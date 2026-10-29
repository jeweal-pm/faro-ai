BEGIN;

CREATE TABLE IF NOT EXISTS tenant_learning_settings (
    tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    shared_training_authorized boolean NOT NULL DEFAULT false,
    authorization_reference text,
    updated_by_email text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (authorization_reference IS NULL OR length(authorization_reference) <= 300)
);

CREATE TABLE IF NOT EXISTS learning_candidates (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    question text NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
    generated_answer text NOT NULL CHECK (length(generated_answer) BETWEEN 1 AND 8000),
    preferred_answer text CHECK (preferred_answer IS NULL OR length(preferred_answer) <= 8000),
    provider text NOT NULL CHECK (provider IN ('openrouter', 'ollama', 'lmstudio')),
    model text NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
    language text NOT NULL CHECK (language IN ('en', 'th', 'fr')),
    source_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_refs) = 'array'),
    rag_consent boolean NOT NULL DEFAULT false,
    local_consent boolean NOT NULL DEFAULT false,
    shared_consent boolean NOT NULL DEFAULT false,
    policy_version integer NOT NULL DEFAULT 1 CHECK (policy_version > 0),
    review_status text NOT NULL DEFAULT 'pending_review'
      CHECK (review_status IN ('pending_review', 'approved', 'rejected', 'expired', 'deleted')),
    rag_approved boolean NOT NULL DEFAULT false,
    local_training_approved boolean NOT NULL DEFAULT false,
    shared_training_approved boolean NOT NULL DEFAULT false,
    promotion_method text NOT NULL DEFAULT 'human' CHECK (promotion_method IN ('human', 'automatic')),
    rag_status text NOT NULL DEFAULT 'not_requested'
      CHECK (rag_status IN ('not_requested', 'pending', 'completed', 'failed')),
    rag_job_id uuid,
    correlation_id text NOT NULL,
    content_hash bytea NOT NULL,
    reviewed_by text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
    PRIMARY KEY (tenant_id, id),
    CHECK (NOT local_training_approved OR (local_consent AND preferred_answer IS NOT NULL)),
    CHECK (NOT shared_training_approved OR (shared_consent AND preferred_answer IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_learning_candidates_review
  ON learning_candidates (tenant_id, review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_learning_candidates_expiry
  ON learning_candidates (expires_at) WHERE review_status = 'pending_review';

CREATE TABLE IF NOT EXISTS learning_dataset_manifests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope text NOT NULL CHECK (scope IN ('tenant_local', 'central_shared')),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    example_count integer NOT NULL CHECK (example_count >= 0),
    content_sha256 text NOT NULL CHECK (length(content_sha256) = 64),
    policy_version integer NOT NULL DEFAULT 1,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((scope = 'tenant_local' AND tenant_id IS NOT NULL) OR (scope = 'central_shared' AND tenant_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_learning_manifests_scope_created
  ON learning_dataset_manifests (scope, tenant_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('004_consented_learning') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faroai;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faroai;

COMMIT;
