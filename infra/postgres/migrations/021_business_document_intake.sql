BEGIN;

-- Source objects are stored outside PostgreSQL at
-- <FAROAI_DOCUMENT_IMPORT_ROOT>/<tenant_uuid>/<job_uuid>.fai.
-- Wire format: `FAI1` + 12-byte nonce + AES-256-GCM ciphertext + 16-byte tag.
-- AAD is UTF-8 `${tenant_uuid}:${job_uuid}:source`.
-- Safe JPEG previews use <FAROAI_DOCUMENT_PREVIEW_ROOT>/<tenant>/<job>/<page>.fai
-- and AAD `${tenant_uuid}:${job_uuid}:preview:<page>`. Never use artifact_data.
CREATE TABLE IF NOT EXISTS business_document_import_jobs (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  api_key_id uuid NOT NULL,
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[0-9a-f]{64}$'),
  source_name text NOT NULL CHECK (length(source_name) BETWEEN 0 AND 180),
  media_type text NOT NULL CHECK (media_type IN ('application/pdf','image/png','image/jpeg','application/octet-stream')),
  source_sha256 text CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'),
  source_bytes bigint NOT NULL CHECK (source_bytes BETWEEN 0 AND 20971520),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','needs_review','completed','rejected','failed','expired','cancelled')),
  registry_version text NOT NULL,
  selected_type_id text,
  language_hint text NOT NULL DEFAULT 'auto' CHECK (language_hint IN ('auto','en','th')),
  detected_type_id text NOT NULL DEFAULT 'unknown',
  type_candidates jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(type_candidates) = 'array'),
  extraction_payload jsonb NOT NULL DEFAULT '{"pages":[],"fields":[],"line_items":[]}'::jsonb
    CHECK (jsonb_typeof(extraction_payload) = 'object' AND pg_column_size(extraction_payload) <= 2097152),
  validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(validation_issues) = 'array' AND pg_column_size(validation_issues) <= 262144),
  page_count smallint NOT NULL DEFAULT 0 CHECK (page_count BETWEEN 0 AND 25),
  correction_version integer NOT NULL DEFAULT 0 CHECK (correction_version >= 0),
  correction_audit jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(correction_audit) = 'array' AND pg_column_size(correction_audit) <= 524288),
  consent_version integer NOT NULL CHECK (consent_version >= 0),
  consented_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  claim_id uuid,
  source_expires_at timestamptz NOT NULL,
  source_deleted_at timestamptz,
  deletion_requested_at timestamptz,
  expires_at timestamptz NOT NULL,
  preview_deleted_at timestamptz,
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,api_key_id) REFERENCES api_keys(tenant_id,id) ON DELETE CASCADE,
  CHECK (source_expires_at <= expires_at)
);

CREATE INDEX IF NOT EXISTS idx_business_document_import_pending
  ON business_document_import_jobs (created_at, tenant_id, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_business_document_import_expiry
  ON business_document_import_jobs (expires_at);
CREATE INDEX IF NOT EXISTS idx_business_document_import_tenant_actor
  ON business_document_import_jobs (tenant_id, actor_hash, created_at DESC);

-- Worker reports readiness through PostgreSQL. The API accepts uploads only
-- while the isolated local parser/OCR worker is alive and marked ready.
CREATE TABLE IF NOT EXISTS document_import_worker_heartbeat (
  singleton smallint PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  worker_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ready','draining')),
  last_seen_at timestamptz NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_document_import_access') THEN
    CREATE ROLE faroai_document_import_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_document_import_access'
                AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'faroai_document_import_access has unsafe role attributes';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON business_document_import_jobs TO faroai;
GRANT SELECT ON document_import_worker_heartbeat TO faroai;

GRANT USAGE ON SCHEMA public TO faroai_document_import_access;
GRANT SELECT (tenant_id,id,api_key_id,source_sha256,source_bytes,media_type,status,registry_version,
  selected_type_id,detected_type_id,type_candidates,consent_version,consented_at,attempts,claim_id,
  language_hint,source_expires_at,source_deleted_at,deletion_requested_at,expires_at,preview_deleted_at,page_count,created_at,updated_at)
  ON business_document_import_jobs TO faroai_document_import_access;
GRANT UPDATE (status,detected_type_id,type_candidates,extraction_payload,validation_issues,page_count,
  attempts,claim_id,source_deleted_at,preview_deleted_at,correction_audit,error_code,updated_at)
  ON business_document_import_jobs TO faroai_document_import_access;
GRANT SELECT (id,status) ON tenants TO faroai_document_import_access;
GRANT SELECT (tenant_id,id,revoked_at,expires_at) ON api_keys TO faroai_document_import_access;
GRANT SELECT, INSERT, UPDATE ON document_import_worker_heartbeat TO faroai_document_import_access;

INSERT INTO schema_migrations(version)
VALUES ('021_business_document_intake')
ON CONFLICT DO NOTHING;

COMMIT;
