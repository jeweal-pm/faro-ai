"""Private fixed-operation document worker. No model code, URLs or shell commands run here."""
from __future__ import annotations

import hashlib
import os
import time
import uuid
from pathlib import Path

import psycopg
import redis
from psycopg.rows import dict_row

from document_render import FORMATS, render_document

ROOT = Path(os.environ.get("ARTIFACT_ROOT", "/var/faroai/artifacts"))
DATABASE_URL = os.environ["DATABASE_URL"]
REDIS_URL = os.environ["REDIS_URL"]
if not DATABASE_URL or not REDIS_URL:
    raise RuntimeError("Dedicated artifact worker database and Redis credentials are required")
os.umask(0o027)


def file_path(tenant_id: str, job_id: str, kind: str) -> Path:
    tenant = str(uuid.UUID(str(tenant_id)))
    job = str(uuid.UUID(str(job_id)))
    if kind not in FORMATS:
        raise ValueError("unsupported_format")
    return ROOT / tenant / f"{job}.{kind}"


def claim(conn: psycopg.Connection) -> dict | None:
    token = uuid.uuid4()
    with conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
        cur.execute("""
          UPDATE skill_artifact_jobs j SET status='failed', error_code='access_revoked',
            input_payload='{}'::jsonb, updated_at=now(), claim_id=NULL
          WHERE j.status IN ('pending','processing') AND NOT EXISTS (
            SELECT 1 FROM tenants t JOIN api_keys k ON k.tenant_id=t.id
            WHERE t.id=j.tenant_id AND t.status='active' AND k.id=j.api_key_id AND k.revoked_at IS NULL
          )
        """)
        cur.execute("""
          UPDATE skill_artifact_jobs SET status='failed', error_code='attempts_exceeded',
            input_payload='{}'::jsonb, updated_at=now(), claim_id=NULL
          WHERE status='processing' AND updated_at < now()-interval '5 minutes' AND attempts>=3
        """)
        cur.execute("""
          WITH candidate AS (
            SELECT j.tenant_id,j.id FROM skill_artifact_jobs j
            JOIN tenants t ON t.id=j.tenant_id AND t.status='active'
            JOIN api_keys k ON k.tenant_id=j.tenant_id AND k.id=j.api_key_id AND k.revoked_at IS NULL
            WHERE j.expires_at>now() AND j.attempts<3 AND
              (j.status='pending' OR (j.status='processing' AND j.updated_at<now()-interval '5 minutes'))
            ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1
          )
          UPDATE skill_artifact_jobs j SET status='processing', attempts=j.attempts+1,
            claim_id=%s, updated_at=now()
          FROM candidate c WHERE j.tenant_id=c.tenant_id AND j.id=c.id
          RETURNING j.tenant_id,j.id,j.api_key_id,j.format,j.input_payload,j.claim_id
        """, (token,))
        return cur.fetchone()


def run_job(conn: psycopg.Connection, job: dict) -> None:
    final = file_path(job["tenant_id"], job["id"], job["format"])
    final.parent.mkdir(mode=0o750, exist_ok=True)
    if final.parent.is_symlink():
        raise ValueError("invalid_directory")
    temporary = final.with_name(f".{final.name}.{job['claim_id']}.tmp")
    try:
        render_document(job["format"], job["input_payload"], temporary)
        temporary.chmod(0o640)
        digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
        size = temporary.stat().st_size
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("""
              SELECT j.id FROM skill_artifact_jobs j
              JOIN tenants t ON t.id=j.tenant_id AND t.status='active'
              JOIN api_keys k ON k.tenant_id=j.tenant_id AND k.id=j.api_key_id AND k.revoked_at IS NULL
              WHERE j.tenant_id=%s AND j.id=%s AND j.claim_id=%s AND j.status='processing'
                AND j.expires_at>now() FOR UPDATE OF j
            """, (job["tenant_id"], job["id"], job["claim_id"]))
            if cur.fetchone() is None:
                return
            os.replace(temporary, final)
            cur.execute("""
              UPDATE skill_artifact_jobs SET status='completed',input_payload='{}'::jsonb,
                output_sha256=%s,size_bytes=%s,claim_id=NULL,updated_at=now()
              WHERE tenant_id=%s AND id=%s AND claim_id=%s
            """, (digest, size, job["tenant_id"], job["id"], job["claim_id"]))
    except Exception:
        with conn.transaction(), conn.cursor() as cur:
            cur.execute("""UPDATE skill_artifact_jobs SET status='failed',error_code='render_failed',
              input_payload='{}'::jsonb,claim_id=NULL,updated_at=now()
              WHERE tenant_id=%s AND id=%s AND claim_id=%s""",
                        (job["tenant_id"], job["id"], job["claim_id"]))
    finally:
        temporary.unlink(missing_ok=True)


def clean_expired(conn: psycopg.Connection) -> None:
    # Only worker-generated UUID paths are eligible for deletion; never recurse.
    with conn.transaction(), conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT tenant_id,id,format FROM skill_artifact_jobs WHERE expires_at<=now() LIMIT 100 FOR UPDATE SKIP LOCKED")
        for row in cur.fetchall():
            target = file_path(row["tenant_id"], row["id"], row["format"])
            target.unlink(missing_ok=True)
            # A stopped worker may leave a same-job staging file behind.
            if target.parent.is_dir() and not target.parent.is_symlink():
                for staging in target.parent.glob(f".{target.name}.*.tmp"):
                    staging.unlink(missing_ok=True)
            cur.execute("DELETE FROM skill_artifact_jobs WHERE tenant_id=%s AND id=%s", (row["tenant_id"], row["id"]))


def main() -> None:
    if not ROOT.is_dir() or ROOT.is_symlink() or not os.access(ROOT, os.W_OK):
        raise RuntimeError("Private artifact volume is unavailable or not writable")
    queue = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2, socket_timeout=7)
    while True:
        try:
            with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
                while True:
                    clean_expired(conn)
                    job = claim(conn)
                    if job:
                        run_job(conn, job)
                    else:
                        try:
                            queue.blpop("platform:queue:artifacts", timeout=5)
                        except redis.RedisError:
                            time.sleep(5)  # PostgreSQL remains the source of truth.
        except (psycopg.Error, OSError):
            time.sleep(5)


if __name__ == "__main__":
    main()
