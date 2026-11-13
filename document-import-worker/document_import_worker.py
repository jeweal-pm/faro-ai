"""Offline, bounded worker for the first review-only document intake slice.

The worker has no AI/GIS clients and performs no network requests. It converts
PDF/image input into OCR/text evidence and encrypted raster previews only.
"""
from __future__ import annotations

import base64
import hashlib
import os
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import psycopg
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from psycopg.rows import dict_row

from document_processor import DocumentRejected, iter_document_pages

SOURCE_ROOT = Path(os.environ.get("FAROAI_DOCUMENT_IMPORT_ROOT", "/var/faroai/document-import/source"))
PREVIEW_ROOT = Path(os.environ.get("FAROAI_DOCUMENT_PREVIEW_ROOT", "/var/faroai/document-import/previews"))
TEMP_ROOT = Path(os.environ.get("FAROAI_DOCUMENT_IMPORT_TEMP", "/tmp/document-import"))
DATABASE_URL = os.environ.get("DATABASE_URL", "")
POLL_SECONDS = 2
MAX_SOURCE_BYTES = 20 * 1024 * 1024
MAX_JOB_PREVIEW_BYTES = 20 * 1024 * 1024
MAX_PAGE_PREVIEW_BYTES = 3_000_000
MAX_JOB_TEXT_BYTES = 1_000_000
MAX_JOB_BLOCKS = 1_000
os.umask(0o077)


def _key() -> bytes:
    encoded = os.environ.get("FAROAI_DOCUMENT_IMPORT_ENCRYPTION_KEY", "")
    try:
        value = base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise RuntimeError("document_import_encryption_key_invalid") from error
    if len(value) != 32:
        raise RuntimeError("document_import_encryption_key_invalid")
    return value


def _uuid(value: str) -> str:
    return str(uuid.UUID(str(value)))


def _object_path(root: Path, tenant_id: str, job_id: str, page: int | None = None) -> Path:
    tenant, job = _uuid(tenant_id), _uuid(job_id)
    if page is None:
        return root / tenant / f"{job}.fai"
    if page < 1 or page > 25:
        raise ValueError("invalid_page")
    return root / tenant / job / f"{page}.fai"


def _check_ancestors(root: Path, path: Path) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError as error:
        raise RuntimeError("document_import_path_invalid") from error
    current = root
    for part in relative.parts[:-1]:
        current = current / part
        if current.exists() and current.is_symlink():
            raise RuntimeError("document_import_path_invalid")


def _safe_root(root: Path, *, writable: bool) -> None:
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError("document_import_volume_unavailable")
    if writable and not os.access(root, os.W_OK):
        raise RuntimeError("document_import_volume_unavailable")


def _aad(tenant_id: str, job_id: str, object_kind: str) -> bytes:
    return f"{_uuid(tenant_id)}:{_uuid(job_id)}:{object_kind}".encode("utf-8")


def _decrypt(path: Path, tenant_id: str, job_id: str, object_kind: str, key: bytes) -> bytes:
    _check_ancestors(SOURCE_ROOT, path)
    if path.is_symlink() or not path.is_file():
        raise DocumentRejected("source_unavailable")
    if path.stat().st_size > MAX_SOURCE_BYTES + 64:
        raise DocumentRejected("file_too_large")
    data = path.read_bytes()
    if len(data) < 4 + 12 + 16 or data[:4] != b"FAI1":
        raise DocumentRejected("source_invalid")
    try:
        plaintext = AESGCM(key).decrypt(data[4:16], data[16:], _aad(tenant_id, job_id, object_kind))
    except InvalidTag as error:
        raise DocumentRejected("source_integrity_failed") from error
    if len(plaintext) > MAX_SOURCE_BYTES:
        raise DocumentRejected("file_too_large")
    return plaintext


def _encrypt(data: bytes, tenant_id: str, job_id: str, object_kind: str, key: bytes) -> bytes:
    nonce = os.urandom(12)
    return b"FAI1" + nonce + AESGCM(key).encrypt(nonce, data, _aad(tenant_id, job_id, object_kind))


def _atomic_write(path: Path, payload: bytes) -> None:
    _check_ancestors(PREVIEW_ROOT, path)
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.is_symlink() or path.is_symlink():
        raise RuntimeError("document_import_path_invalid")
    temp = path.with_name(f".{path.name}.{uuid.uuid4()}.tmp")
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def _claim(conn: psycopg.Connection) -> dict[str, Any] | None:
    claim_id = uuid.uuid4()
    with conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
        cur.execute("""
          UPDATE business_document_import_jobs SET status='failed',error_code='attempts_exceeded',
            claim_id=NULL,updated_at=now()
          WHERE status='processing' AND updated_at<now()-interval '10 minutes' AND attempts>=3
        """)
        cur.execute("""
          WITH candidate AS (
            SELECT j.tenant_id,j.id FROM business_document_import_jobs j
            JOIN tenants t ON t.id=j.tenant_id AND t.status='active'
            JOIN api_keys k ON k.tenant_id=j.tenant_id AND k.id=j.api_key_id AND k.revoked_at IS NULL
              AND (k.expires_at IS NULL OR k.expires_at>now())
            WHERE (j.status='queued' OR
              (j.status='processing' AND j.updated_at<now()-interval '10 minutes'))
              AND j.source_expires_at>now() AND j.expires_at>now()
              AND j.attempts<3
            ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1
          )
          UPDATE business_document_import_jobs j SET status='processing', attempts=j.attempts+1,
            claim_id=%s, updated_at=now()
          FROM candidate c WHERE j.tenant_id=c.tenant_id AND j.id=c.id
          RETURNING j.tenant_id,j.id,j.claim_id,j.source_sha256,j.source_bytes,j.media_type,
            j.registry_version,j.selected_type_id,j.language_hint,j.consent_version,j.consented_at
        """, (claim_id,))
        return cur.fetchone()


def _heartbeat(conn: psycopg.Connection, worker_id: str, status: str = "ready") -> None:
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("""
          INSERT INTO document_import_worker_heartbeat(singleton,worker_id,status,last_seen_at)
          VALUES(1,%s,%s,now())
          ON CONFLICT(singleton) DO UPDATE SET worker_id=EXCLUDED.worker_id,
            status=EXCLUDED.status,last_seen_at=now()
        """, (worker_id, status))


def _heartbeat_loop(worker_id: str, stop: threading.Event) -> None:
    while not stop.wait(15):
        try:
            with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
                _heartbeat(conn, worker_id)
        except psycopg.Error:
            continue


def _cleanup_expired_previews(conn: psycopg.Connection) -> None:
    """Remove only page objects for expired UUID jobs and retain a minimal tombstone."""
    with conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
        cur.execute("""
          SELECT tenant_id,id,status FROM business_document_import_jobs
          WHERE preview_deleted_at IS NULL AND (expires_at<=now() OR status='cancelled')
          ORDER BY CASE WHEN status='cancelled' THEN 0 ELSE 1 END,expires_at
          LIMIT 20 FOR UPDATE SKIP LOCKED
        """)
        rows = cur.fetchall()
        for row in rows:
            tenant_id, job_id = _uuid(row["tenant_id"]), _uuid(row["id"])
            job_dir = PREVIEW_ROOT / tenant_id / job_id
            safe_to_mark = True
            try:
                _check_ancestors(PREVIEW_ROOT, job_dir / "1.fai")
                for page_number in range(1, 26):
                    target = _object_path(PREVIEW_ROOT, tenant_id, job_id, page_number)
                    if target.is_symlink():
                        safe_to_mark = False
                        continue
                    target.unlink(missing_ok=True)
                with suppress_oserror():
                    job_dir.rmdir()
                    job_dir.parent.rmdir()
            except (OSError, RuntimeError):
                safe_to_mark = False
            if safe_to_mark:
                cur.execute("""
                  UPDATE business_document_import_jobs SET status=CASE WHEN status='cancelled' THEN 'cancelled' ELSE 'expired' END,
                    preview_deleted_at=now(),
                    extraction_payload='{}'::jsonb,validation_issues='[]'::jsonb,
                    correction_audit='[]'::jsonb,updated_at=now()
                  WHERE tenant_id=%s AND id=%s AND preview_deleted_at IS NULL
                    AND (status='cancelled' OR expires_at<=now())
                """, (tenant_id, job_id))


def _normalized_blocks(items: list[dict[str, Any]], width: int, height: int, limit: int) -> list[dict[str, Any]]:
    blocks = []
    for item in items[:limit]:
        box = item.get("bbox_pixels")
        if not isinstance(box, dict) or width < 1 or height < 1:
            continue
        source_width = max(1, int(item.get("image_width") or width))
        source_height = max(1, int(item.get("image_height") or height))
        left = max(0, min(source_width, int(box["left"])))
        top = max(0, min(source_height, int(box["top"])))
        box_width = max(0, min(source_width - left, int(box["width"])))
        box_height = max(0, min(source_height - top, int(box["height"])))
        blocks.append({
            "text": str(item.get("text", ""))[:120],
            "bbox": {
                "x": round(left / source_width, 6),
                "y": round(top / source_height, 6),
                "width": round(box_width / source_width, 6),
                "height": round(box_height / source_height, 6),
            },
        })
    return blocks


def _process(conn: psycopg.Connection, job: dict[str, Any], key: bytes) -> None:
    tenant_id, job_id = _uuid(job["tenant_id"]), _uuid(job["id"])
    claim_id = _uuid(job["claim_id"])
    source = _object_path(SOURCE_ROOT, tenant_id, job_id)
    temp_file: Path | None = None
    preview_paths: list[Path] = []
    completed = False
    try:
        raw = _decrypt(source, tenant_id, job_id, "source", key)
        if hashlib.sha256(raw).hexdigest() != job["source_sha256"] or len(raw) != job["source_bytes"]:
            raise DocumentRejected("source_integrity_failed")
        TEMP_ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
        if TEMP_ROOT.is_symlink():
            raise RuntimeError("document_import_temp_invalid")
        with tempfile.NamedTemporaryFile(prefix="source-", suffix=".input", dir=TEMP_ROOT, delete=False) as output:
            temp_file = Path(output.name)
            os.chmod(temp_file, 0o600)
            output.write(raw)
        del raw

        pages: list[dict[str, Any]] = []
        total_preview_bytes = 0
        remaining_text_bytes = MAX_JOB_TEXT_BYTES
        remaining_blocks = MAX_JOB_BLOCKS
        recognized_characters = 0
        for page_number, text, _source_kind, evidence, preview in iter_document_pages(temp_file, job["media_type"], job["language_hint"]):
            if len(preview) > MAX_PAGE_PREVIEW_BYTES:
                raise DocumentRejected("preview_limit_exceeded")
            total_preview_bytes += len(preview)
            if total_preview_bytes > MAX_JOB_PREVIEW_BYTES:
                raise DocumentRejected("preview_job_limit_exceeded")
            from PIL import Image
            import io
            with Image.open(io.BytesIO(preview)) as image:
                width, height = image.size
            page_blocks = min(200, remaining_blocks)
            blocks = _normalized_blocks(evidence, width, height, page_blocks)
            remaining_blocks -= len(blocks)
            encoded_text = text.encode("utf-8")
            truncated = len(encoded_text) > remaining_text_bytes
            if truncated:
                encoded_text = encoded_text[:remaining_text_bytes]
                while encoded_text and (encoded_text[-1] & 0xC0) == 0x80:
                    encoded_text = encoded_text[:-1]
                # If the final byte is a multibyte lead byte, remove it as well.
                try:
                    page_text = encoded_text.decode("utf-8")
                except UnicodeDecodeError:
                    page_text = encoded_text.decode("utf-8", errors="ignore")
            else:
                page_text = text
            remaining_text_bytes = max(0, remaining_text_bytes - len(page_text.encode("utf-8")))
            recognized_characters += sum(1 for character in page_text if not character.isspace())
            encrypted_preview = _encrypt(preview, tenant_id, job_id, f"preview:{page_number}", key)
            preview_path = _object_path(PREVIEW_ROOT, tenant_id, job_id, page_number)
            _atomic_write(preview_path, encrypted_preview)
            preview_paths.append(preview_path)
            pages.append({
                "page_number": page_number,
                "width": width,
                "height": height,
                "ocr_text": page_text,
                "ocr_text_truncated": truncated,
                "blocks": blocks,
            })
            lease = conn.execute("""
              UPDATE business_document_import_jobs SET updated_at=now()
              WHERE tenant_id=%s AND id=%s AND claim_id=%s AND status='processing'
                AND expires_at>now() AND source_expires_at>now()
            """, (tenant_id, job_id, claim_id))
            if lease.rowcount != 1:
                raise DocumentRejected("job_lease_lost")

        if not pages:
            raise DocumentRejected("document_has_no_pages")
        if recognized_characters < 20:
            raise DocumentRejected("no_document_text_detected")
        payload = {"pages": pages, "fields": [], "line_items": []}
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("""
              SELECT 1 FROM business_document_import_jobs j
              JOIN tenants t ON t.id=j.tenant_id AND t.status='active'
              JOIN api_keys k ON k.tenant_id=j.tenant_id AND k.id=j.api_key_id AND k.revoked_at IS NULL
                AND (k.expires_at IS NULL OR k.expires_at>now())
              WHERE j.tenant_id=%s AND j.id=%s AND j.claim_id=%s AND j.status='processing'
                AND j.expires_at>now() AND j.source_expires_at>now()
              FOR UPDATE OF j
            """, (tenant_id, job_id, claim_id))
            if cur.fetchone() is None:
                return
            cur.execute("""
              UPDATE business_document_import_jobs SET status='needs_review',
                detected_type_id='unknown',type_candidates='[]'::jsonb,
                extraction_payload=%s::jsonb,validation_issues='[]'::jsonb,page_count=%s,
                claim_id=NULL,error_code=NULL,updated_at=now()
              WHERE tenant_id=%s AND id=%s AND claim_id=%s AND status='processing'
            """, (psycopg.types.json.Jsonb(payload), len(pages), tenant_id, job_id, claim_id))
        completed = True
    except DocumentRejected as error:
        _finish_error(conn, tenant_id, job_id, claim_id, "rejected", str(error))
    except Exception:
        _finish_error(conn, tenant_id, job_id, claim_id, "failed", "processing_failed")
    finally:
        if temp_file:
            temp_file.unlink(missing_ok=True)
        # Remove only preview files this claim just wrote, never traverse user paths.
        if not completed:
            for path in preview_paths:
                path.unlink(missing_ok=True)
            for path in preview_paths:
                with suppress_oserror():
                    path.parent.rmdir()
                    path.parent.parent.rmdir()


def suppress_oserror():
    from contextlib import suppress
    return suppress(OSError)


def _finish_error(conn: psycopg.Connection, tenant_id: str, job_id: str, claim_id: str, status: str, code: str) -> None:
    allowed = {"rejected", "failed"}
    if status not in allowed or not code.replace("_", "").isalnum() or len(code) > 48:
        status, code = "failed", "processing_failed"
    with conn.transaction(), conn.cursor() as cur:
        cur.execute("""
          UPDATE business_document_import_jobs SET status=%s,error_code=%s,claim_id=NULL,
            updated_at=now() WHERE tenant_id=%s AND id=%s AND claim_id=%s AND status='processing'
        """, (status, code, tenant_id, job_id, claim_id))


def main() -> None:
    if not DATABASE_URL:
        raise RuntimeError("document_import_worker_database_url_required")
    key = _key()
    _safe_root(SOURCE_ROOT, writable=False)
    _safe_root(PREVIEW_ROOT, writable=True)
    worker_id = str(uuid.uuid4())
    stop_heartbeat = threading.Event()
    heartbeat_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(worker_id, stop_heartbeat),
        name="document-import-heartbeat",
        daemon=True,
    )
    heartbeat_thread.start()
    while True:
        try:
            with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
                _heartbeat(conn, worker_id)
                _cleanup_expired_previews(conn)
                job = _claim(conn)
                if job:
                    _process(conn, job, key)
                    _heartbeat(conn, worker_id)
                else:
                    time.sleep(POLL_SECONDS)
                    _heartbeat(conn, worker_id)
        except (psycopg.Error, OSError):
            time.sleep(5)


if __name__ == "__main__":
    main()
