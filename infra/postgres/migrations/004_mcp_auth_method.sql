BEGIN;

ALTER TABLE tenant_mcp_connections
    ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'bearer'
    CHECK (auth_method IN ('bearer', 'x-api-key'));

INSERT INTO schema_migrations(version) VALUES ('004_mcp_auth_method') ON CONFLICT DO NOTHING;

COMMIT;
