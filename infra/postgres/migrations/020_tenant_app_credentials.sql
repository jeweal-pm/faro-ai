BEGIN;

CREATE TABLE IF NOT EXISTS tenant_app_credentials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    client_id text NOT NULL UNIQUE CHECK (length(client_id) BETWEEN 24 AND 80),
    client_secret_hash bytea NOT NULL,
    label text NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
    scopes text[] NOT NULL DEFAULT ARRAY['chat:write']::text[],
    created_by_email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz,
    revoked_at timestamptz,
    UNIQUE (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_app_credentials_active
    ON tenant_app_credentials (tenant_id, created_at DESC) WHERE revoked_at IS NULL;

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS client_credential_id uuid;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_client_credential_tenant_fk
    FOREIGN KEY (client_credential_id, tenant_id) REFERENCES tenant_app_credentials(id, tenant_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_api_keys_active_expiry ON api_keys (expires_at) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_tenant_browser_session
    ON api_keys (tenant_id) WHERE label='FaroAI authenticated discovery' AND revoked_at IS NULL;

INSERT INTO schema_migrations(version) VALUES ('020_tenant_app_credentials') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_app_credentials TO faroai;
GRANT UPDATE (client_credential_id, expires_at) ON api_keys TO faroai;

COMMIT;
