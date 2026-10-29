from __future__ import annotations

import hashlib
import json
import logging
import time
import uuid
from contextlib import closing
from typing import Any

from qdrant_client import models
from redis import Redis

from .app import clean_text, connection, ensure_collection, get_embedder, qdrant
from .settings import settings

logger = logging.getLogger("faroai.worker")
logging.basicConfig(level=logging.INFO, format="%(message)s")

STREAM = "platform:queue:embedding"
GROUP = "faroai-embedding-workers"


def chunk_text(value: str, size: int = 900, overlap: int = 100) -> list[str]:
    text = clean_text(value, 100_000)
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        if end < len(text):
            boundary = text.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


def enqueue_pending_jobs(client: Redis) -> None:
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE embedding_jobs SET status='pending',updated_at=now()
               WHERE status='processing' AND updated_at < now() - interval '5 minutes' AND attempts < 5"""
        )
        cur.execute(
            """UPDATE embedding_jobs SET status='failed',error_code='worker_attempts_exhausted',updated_at=now()
               WHERE status='processing' AND updated_at < now() - interval '5 minutes' AND attempts >= 5"""
        )
        conn.commit()
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute(
            """SELECT tenant_id,id FROM embedding_jobs
               WHERE status='pending' AND updated_at < now() - interval '5 seconds'
               ORDER BY created_at LIMIT 100"""
        )
        pending = cur.fetchall()
    for row in pending:
        tenant_id, job_id = str(row["tenant_id"]), str(row["id"])
        client.xadd(STREAM, {"job_id": str(job_id), "tenant_id": str(tenant_id)}, maxlen=100_000, approximate=True)
        with closing(connection()) as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE embedding_jobs SET status='queued',updated_at=now() WHERE tenant_id=%s AND id=%s AND status='pending'",
                (str(tenant_id), str(job_id)),
            )
            conn.commit()


def expire_pending_learning_candidates() -> None:
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE learning_candidates SET review_status='expired',question='[expired]',generated_answer='[expired]',
                 preferred_answer=NULL,source_refs='[]'::jsonb,local_consent=false,shared_consent=false,rag_consent=false,
                 content_hash=decode(repeat('00',32),'hex')
               WHERE review_status='pending_review' AND expires_at<=now()"""
        )
        conn.commit()


def claim_job(tenant_id: str, job_id: str) -> dict[str, Any] | None:
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute("BEGIN")
        cur.execute(
            """SELECT payload,source_id,source_version,collection_name,embedding_model,job_kind,status
               FROM embedding_jobs WHERE tenant_id=%s AND id=%s FOR UPDATE""",
            (tenant_id, job_id),
        )
        row = cur.fetchone()
        if not row or row["status"] not in ("pending", "queued"):
            conn.rollback()
            return None
        cur.execute(
            """UPDATE embedding_jobs SET status='processing',attempts=attempts+1,updated_at=now()
               WHERE tenant_id=%s AND id=%s""",
            (tenant_id, job_id),
        )
        conn.commit()
        return {"payload": row["payload"], "source_id": str(row["source_id"]) if row["source_id"] else None,
                "source_version": row["source_version"], "collection": row["collection_name"],
                "model": row["embedding_model"], "job_kind": row["job_kind"]}


def ensure_product_collection() -> None:
    collection = settings.qdrant_product_collection
    if not qdrant.collection_exists(collection):
        try:
            qdrant.create_collection(collection_name=collection, vectors_config=models.VectorParams(
                size=settings.embedding_dimension, distance=models.Distance.COSINE,
            ))
        except Exception:
            if not qdrant.collection_exists(collection):
                raise
    for field_name, field_schema in (
        ("tenant_id", models.KeywordIndexParams(type=models.KeywordIndexType.KEYWORD, is_tenant=True)),
        ("product_id", models.PayloadSchemaType.KEYWORD),
        ("product_type", models.PayloadSchemaType.KEYWORD),
        ("metal_color", models.PayloadSchemaType.KEYWORD),
        ("stone_type", models.PayloadSchemaType.KEYWORD),
        ("stone_shape", models.PayloadSchemaType.KEYWORD),
    ):
        qdrant.create_payload_index(collection_name=collection, field_name=field_name, field_schema=field_schema)


def index_catalogue_products(tenant_id: str, job: dict[str, Any]) -> int:
    payload = job["payload"]
    product_ids = payload.get("product_ids", [])
    deleted_ids = payload.get("deleted_product_ids", [])
    if not isinstance(product_ids, list) or not all(isinstance(item, str) and item for item in product_ids):
        raise ValueError("invalid_catalogue_product_ids")
    if not isinstance(deleted_ids, list) or not all(isinstance(item, str) and item for item in deleted_ids):
        raise ValueError("invalid_catalogue_deletion_ids")
    ensure_product_collection()
    collection = settings.qdrant_product_collection
    if deleted_ids:
        for product_id in deleted_ids:
            qdrant.delete(collection_name=collection, points_selector=models.FilterSelector(filter=models.Filter(must=[
                models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id)),
                models.FieldCondition(key="product_id", match=models.MatchValue(value=product_id)),
            ])), wait=True)
    if not product_ids:
        return len(deleted_ids)

    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute("""SELECT id,sku,name,product_type,metal,metal_karat,metal_color,stone_type,stone_shape,
                    stone_carat,weight,search_text,summary,catalogue_version
               FROM products WHERE tenant_id=%s AND id=ANY(%s)""", (tenant_id, product_ids))
        products = cur.fetchall()
    if not products:
        return len(deleted_ids)
    descriptions = []
    for product in products:
        fields = [
            ("Product", product["name"]), ("SKU", product["sku"]), ("Type", product["product_type"]),
            ("Material", product["metal"]), ("Karat", product["metal_karat"]),
            ("Metal color", product["metal_color"]), ("Gemstone", product["stone_type"]),
            ("Gemstone shape", product["stone_shape"]), ("Carat", product["stone_carat"]),
            ("Weight", product["weight"]), ("Search terms", product["search_text"]),
            ("Description", product["summary"]),
        ]
        descriptions.append(clean_text(". ".join(f"{label}: {value}" for label, value in fields if value is not None), 6000))
    vectors = list(get_embedder().passage_embed([f"passage: {text}" for text in descriptions]))
    points = []
    for product, description, vector in zip(products, descriptions, vectors, strict=True):
        product_id = str(product["id"])
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"faroai-product:{tenant_id}:{product_id}"))
        points.append(models.PointStruct(id=point_id, vector=vector.tolist(), payload={
            "tenant_id": tenant_id,
            "product_id": product_id,
            "sku": str(product["sku"]),
            "name": clean_text(str(product["name"]), 300),
            "text": description,
            "product_type": str(product["product_type"]).casefold().strip() if product["product_type"] else None,
            "metal_color": str(product["metal_color"]).casefold().strip() if product["metal_color"] else None,
            "stone_type": str(product["stone_type"]).casefold().strip() if product["stone_type"] else None,
            "stone_shape": str(product["stone_shape"]).casefold().strip() if product["stone_shape"] else None,
            "catalogue_version": str(product["catalogue_version"]),
            "collection_version": collection,
            "embedding_model": settings.embedding_model,
        }))
    qdrant.upsert(collection_name=collection, points=points, wait=True)
    return len(points) + len(deleted_ids)


def index_one_document(tenant_id: str, source_id: str, document: dict[str, Any], collection: str) -> None:
    document_id = str(document["id"])
    title = clean_text(str(document["title"]), 300)
    content = clean_text(str(document["text"]), 100_000)
    lang = document["language"]
    version = str(document["content_version"])
    content_hash = hashlib.sha256(content.encode("utf-8")).digest()
    chunks = chunk_text(content)
    if not chunks:
        return

    ensure_collection()
    vectors = list(get_embedder().passage_embed([f"passage: {chunk}" for chunk in chunks]))
    namespace = uuid.uuid5(uuid.NAMESPACE_URL, f"faroai:{tenant_id}:{document_id}:{version}")
    points = []
    for index, (chunk, vector) in enumerate(zip(chunks, vectors, strict=True)):
        point_id = str(uuid.uuid5(namespace, str(index)))
        points.append(models.PointStruct(
            id=point_id,
            vector=vector.tolist(),
            payload={
                "tenant_id": tenant_id,
                "document_id": document_id,
                "source_id": source_id,
                "title": title,
                "text": chunk,
                "language": lang,
                "content_version": version,
                "collection_version": collection,
                "embedding_model": settings.embedding_model,
                "chunk_index": index,
            },
        ))

    qdrant.upsert(collection_name=collection, points=points, wait=True)
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute(
            """INSERT INTO knowledge_documents(tenant_id,id,source_id,title,sanitized_content,language,content_version,content_hash,status)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'approved')
               ON CONFLICT (tenant_id,id) DO UPDATE SET source_id=EXCLUDED.source_id,title=EXCLUDED.title,
                 sanitized_content=EXCLUDED.sanitized_content,language=EXCLUDED.language,
                 content_version=EXCLUDED.content_version,content_hash=EXCLUDED.content_hash,status='approved',updated_at=now()""",
            (tenant_id, document_id, source_id, title, content, lang, version, content_hash),
        )
        cur.execute("DELETE FROM document_chunks WHERE tenant_id=%s AND document_id=%s", (tenant_id, document_id))
        for index, point in enumerate(points):
            cur.execute(
                """INSERT INTO document_chunks(tenant_id,document_id,chunk_index,content_version,collection_name,point_id)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (tenant_id, document_id, index, version, collection, str(point.id)),
            )
        conn.commit()

    qdrant.delete(
        collection_name=collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id)),
                    models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id)),
                ],
                must_not=[models.FieldCondition(key="content_version", match=models.MatchValue(value=version))],
            )
        ),
        wait=True,
    )


def update_learning_rag_status(tenant_id: str, document: dict[str, Any], status: str) -> None:
    document_id = str(document.get("id", ""))
    if not document_id.startswith("learning-"):
        return
    try:
        candidate_id = str(uuid.UUID(document_id.removeprefix("learning-")))
    except ValueError:
        return
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE learning_candidates SET rag_status=%s
               WHERE tenant_id=%s AND id=%s AND rag_approved=true AND review_status='approved'""",
            (status, tenant_id, candidate_id),
        )
        conn.commit()


def learning_candidate_is_active(tenant_id: str, document: dict[str, Any]) -> bool | None:
    document_id = str(document.get("id", ""))
    if not document_id.startswith("learning-"):
        return None
    try:
        candidate_id = str(uuid.UUID(document_id.removeprefix("learning-")))
    except ValueError:
        return False
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM learning_candidates WHERE tenant_id=%s AND id=%s AND rag_approved=true AND review_status='approved'",
            (tenant_id, candidate_id),
        )
        return cur.fetchone() is not None


def remove_learning_document(tenant_id: str, document: dict[str, Any], collection: str) -> None:
    document_id = str(document.get("id", ""))
    if learning_candidate_is_active(tenant_id, document) is not False:
        return
    qdrant.delete(
        collection_name=collection,
        points_selector=models.FilterSelector(filter=models.Filter(must=[
            models.FieldCondition(key="tenant_id", match=models.MatchValue(value=tenant_id)),
            models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id)),
        ])),
        wait=True,
    )
    with closing(connection()) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM document_chunks WHERE tenant_id=%s AND document_id=%s", (tenant_id, document_id))
        cur.execute("UPDATE knowledge_documents SET status='removed',updated_at=now() WHERE tenant_id=%s AND id=%s", (tenant_id, document_id))
        conn.commit()


def process_job(tenant_id: str, job_id: str) -> None:
    job = claim_job(tenant_id, job_id)
    if job is None:
        return
    try:
        payload = job["payload"]
        if job["job_kind"] == "catalogue_products":
            completed = index_catalogue_products(tenant_id, job)
            with closing(connection()) as conn, conn.cursor() as cur:
                cur.execute("""UPDATE embedding_jobs SET completed_documents=%s,status='completed',updated_at=now()
                   WHERE tenant_id=%s AND id=%s""", (completed, tenant_id, job_id))
                conn.commit()
            return
        documents = payload.get("documents", [])
        for document in documents:
            is_active = learning_candidate_is_active(tenant_id, document)
            if is_active is False:
                continue
            index_one_document(tenant_id, job["source_id"], document, job["collection"])
            if is_active is True and learning_candidate_is_active(tenant_id, document) is False:
                remove_learning_document(tenant_id, document, job["collection"])
                continue
            update_learning_rag_status(tenant_id, document, "completed")
            with closing(connection()) as conn, conn.cursor() as cur:
                cur.execute(
                    "UPDATE embedding_jobs SET completed_documents=completed_documents+1,updated_at=now() WHERE tenant_id=%s AND id=%s",
                    (tenant_id, job_id),
                )
                conn.commit()
        with closing(connection()) as conn, conn.cursor() as cur:
            cur.execute("UPDATE embedding_jobs SET status='completed',updated_at=now() WHERE tenant_id=%s AND id=%s", (tenant_id, job_id))
            cur.execute(
                "UPDATE mcp_sources SET source_version=%s,last_synced_at=now() WHERE tenant_id=%s AND id=%s",
                (job["source_version"], tenant_id, job["source_id"]),
            )
            conn.commit()
    except Exception as error:
        with closing(connection()) as conn, conn.cursor() as cur:
            cur.execute(
                """UPDATE embedding_jobs SET status=CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
                     error_code='indexing_failed',updated_at=now() WHERE tenant_id=%s AND id=%s""",
                (tenant_id, job_id),
            )
            cur.execute("SELECT payload,attempts FROM embedding_jobs WHERE tenant_id=%s AND id=%s", (tenant_id, job_id))
            failed_job = cur.fetchone()
            if failed_job:
                rag_status = "failed" if failed_job["attempts"] >= 5 else "pending"
                for document in failed_job["payload"].get("documents", []):
                    update_learning_rag_status(tenant_id, document, rag_status)
            conn.commit()
        logger.warning(json.dumps({"event": "embedding_job_failed", "tenant_id": tenant_id, "job_id": job_id, "error_type": type(error).__name__}))
        raise


def main() -> None:
    # XREADGROUP can block for 5 seconds; leave time for the Redis response itself.
    client = Redis.from_url(settings.redis_url, decode_responses=True, socket_timeout=10)
    try:
        client.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    except Exception as error:
        if "BUSYGROUP" not in str(error):
            raise
    consumer = f"worker-{uuid.uuid4()}"
    last_reconcile = 0.0
    last_learning_cleanup = 0.0
    while True:
        if time.monotonic() - last_reconcile > 10:
            try:
                enqueue_pending_jobs(client)
            except Exception as error:
                logger.warning(json.dumps({"event": "queue_reconcile_failed", "error_type": type(error).__name__}))
            last_reconcile = time.monotonic()
        if time.monotonic() - last_learning_cleanup > 60:
            try:
                expire_pending_learning_candidates()
            except Exception as error:
                logger.warning(json.dumps({"event": "learning_candidate_cleanup_failed", "error_type": type(error).__name__}))
            last_learning_cleanup = time.monotonic()
        try:
            batches = client.xreadgroup(GROUP, consumer, {STREAM: ">"}, count=1, block=5000)
            for _, entries in batches:
                for message_id, fields in entries:
                    tenant_id = fields.get("tenant_id", "")
                    job_id = fields.get("job_id", "")
                    try:
                        uuid.UUID(tenant_id)
                        uuid.UUID(job_id)
                        process_job(tenant_id, job_id)
                    except Exception:
                        pass
                    finally:
                        client.xack(STREAM, GROUP, message_id)
        except Exception as error:
            logger.warning(json.dumps({"event": "queue_read_failed", "error_type": type(error).__name__}))
            time.sleep(2)


if __name__ == "__main__":
    main()
