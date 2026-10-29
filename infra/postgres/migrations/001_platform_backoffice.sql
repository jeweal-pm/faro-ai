BEGIN;

CREATE TABLE IF NOT EXISTS platform_admin_sessions (
    token_hash bytea PRIMARY KEY,
    admin_email text NOT NULL,
    auth_method text NOT NULL CHECK (auth_method IN ('oidc', 'local')),
    csrf_hash bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_active
    ON platform_admin_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS provider_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL CHECK (provider IN ('openrouter', 'ollama', 'lmstudio')),
    name text NOT NULL,
    endpoint_url text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    allowed_models text[] NOT NULL DEFAULT '{}',
    secret_ciphertext bytea,
    secret_nonce bytea,
    secret_tag bytea,
    secret_key_version smallint NOT NULL DEFAULT 1,
    secret_hint text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, name),
    CHECK ((secret_ciphertext IS NULL AND secret_nonce IS NULL AND secret_tag IS NULL)
        OR (secret_ciphertext IS NOT NULL AND secret_nonce IS NOT NULL AND secret_tag IS NOT NULL))
);

ALTER TABLE model_policies
    ADD COLUMN IF NOT EXISTS provider_connection_id uuid REFERENCES provider_connections(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tenant_credit_accounts (
    tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO tenant_credit_accounts (tenant_id, balance)
SELECT id, 0 FROM tenants ON CONFLICT (tenant_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_credit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    amount bigint NOT NULL CHECK (amount <> 0),
    entry_type text NOT NULL CHECK (entry_type IN ('grant', 'adjustment', 'model_request', 'refund')),
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
    actor_email text NOT NULL,
    correlation_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_credit_ledger_tenant_created
    ON tenant_credit_ledger (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS model_credit_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    correlation_id text NOT NULL,
    status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'refunded')),
    created_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz,
    UNIQUE (tenant_id, correlation_id)
);
CREATE INDEX IF NOT EXISTS idx_model_credit_reservations_pending
    ON model_credit_reservations (created_at) WHERE status = 'reserved';

ALTER TABLE audit_events
    ADD COLUMN IF NOT EXISTS actor_email text,
    ADD COLUMN IF NOT EXISTS actor_kind text NOT NULL DEFAULT 'tenant_api'
        CHECK (actor_kind IN ('tenant_api', 'platform_admin', 'system'));
CREATE INDEX IF NOT EXISTS idx_audit_events_platform_created
    ON audit_events (created_at DESC) WHERE actor_kind = 'platform_admin';

CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES ('001_platform_backoffice') ON CONFLICT DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO faroai;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO faroai;

COMMIT;
