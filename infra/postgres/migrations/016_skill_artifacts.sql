BEGIN;

-- Artifact input and output are private tenant data. This table is created only
-- by the migration; the migration does not create any job or business record.
CREATE TABLE IF NOT EXISTS skill_artifact_jobs (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  id uuid NOT NULL,
  api_key_id uuid NOT NULL,
  actor_hash text NOT NULL CHECK (actor_hash ~ '^[0-9a-f]{64}$'),
  format text NOT NULL CHECK (format IN ('pdf', 'xlsx', 'docx', 'pptx')),
  input_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  claim_id uuid,
  output_sha256 text,
  size_bytes bigint,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, api_key_id) REFERENCES api_keys(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS skill_artifact_pending ON skill_artifact_jobs (created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS skill_artifact_expiry ON skill_artifact_jobs (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON skill_artifact_jobs TO faroai;
INSERT INTO schema_migrations(version) VALUES ('016_skill_artifacts') ON CONFLICT DO NOTHING;
COMMIT;
