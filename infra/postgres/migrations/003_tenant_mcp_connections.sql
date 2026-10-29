BEGIN;

CREATE TABLE IF NOT EXISTS tenant_mcp_connections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_key text NOT NULL CHECK (integration_key IN ('gis', 'gms', 'erp', 'custom')),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
    endpoint_url text NOT NULL CHECK (length(endpoint_url) BETWEEN 1 AND 1000),
    secret_ciphertext bytea NOT NULL,
    secret_nonce bytea NOT NULL,
    secret_tag bytea NOT NULL,
    secret_key_version smallint NOT NULL DEFAULT 1,
    secret_hint text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    connection_status text NOT NULL DEFAULT 'untested'
        CHECK (connection_status IN ('untested', 'connected', 'error')),
    discovered_tools text[] NOT NULL DEFAULT '{}',
    allowed_tools text[] NOT NULL DEFAULT '{}',
    last_checked_at timestamptz,
    last_error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, integration_key),
    CHECK (allowed_tools <@ discovered_tools)
);

CREATE INDEX IF NOT EXISTS idx_tenant_mcp_connections_active
    ON tenant_mcp_connections (tenant_id, integration_key) WHERE enabled;

INSERT INTO schema_migrations(version) VALUES ('003_tenant_mcp_connections') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_mcp_connections TO faroai;

COMMIT;
