BEGIN;

CREATE TABLE IF NOT EXISTS tenant_model_candidates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    model text NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
    is_default boolean NOT NULL DEFAULT false,
    max_tokens integer NOT NULL DEFAULT 600 CHECK (max_tokens BETWEEN 128 AND 2000),
    timeout_seconds integer NOT NULL DEFAULT 30 CHECK (timeout_seconds BETWEEN 3 AND 60),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, provider_connection_id, model)
);

CREATE INDEX IF NOT EXISTS idx_tenant_model_candidates_tenant
    ON tenant_model_candidates (tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_model_candidates_one_default
    ON tenant_model_candidates (tenant_id) WHERE is_default;

-- Preserve the existing effective chat model as a single candidate during rollout.
INSERT INTO tenant_model_candidates
    (tenant_id, provider_connection_id, model, is_default, max_tokens, timeout_seconds)
SELECT p.tenant_id, p.provider_connection_id, p.model, (c.provider IN ('ollama', 'lmstudio')),
       p.max_tokens, p.timeout_seconds
  FROM model_policies p
  JOIN provider_connections c ON c.id = p.provider_connection_id
 WHERE p.task = 'chat' AND p.enabled AND c.enabled AND p.model = ANY(c.allowed_models)
ON CONFLICT (tenant_id, provider_connection_id, model) DO NOTHING;

INSERT INTO schema_migrations(version) VALUES ('002_jev_model_candidates') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_model_candidates TO faroai;

COMMIT;
