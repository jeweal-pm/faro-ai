BEGIN;

CREATE TABLE IF NOT EXISTS tenant_admin_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
    password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by_email text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz,
    UNIQUE (email),
    UNIQUE (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_admin_users_login ON tenant_admin_users (email, status);

CREATE TABLE IF NOT EXISTS tenant_admin_sessions (
    token_hash bytea PRIMARY KEY,
    tenant_admin_id uuid NOT NULL,
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    csrf_hash bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    FOREIGN KEY (tenant_admin_id, tenant_id)
        REFERENCES tenant_admin_users(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tenant_admin_sessions_active
    ON tenant_admin_sessions (tenant_id, expires_at) WHERE revoked_at IS NULL;

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_kind_check;
ALTER TABLE audit_events ADD CONSTRAINT audit_events_actor_kind_check
    CHECK (actor_kind IN ('tenant_api', 'tenant_admin', 'platform_admin', 'system'));

INSERT INTO platform_runtime_settings(setting_key, setting_value, updated_by_email)
VALUES ('mcp_new_tool_default', '{"policy":"all_discovered"}'::jsonb, 'system')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO schema_migrations(version) VALUES ('019_tenant_mcp_accounts') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_admin_users, tenant_admin_sessions TO faroai;

COMMIT;
