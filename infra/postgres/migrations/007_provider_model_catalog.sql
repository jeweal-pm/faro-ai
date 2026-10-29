BEGIN;

CREATE TABLE IF NOT EXISTS provider_model_catalog (
    provider_connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 160),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 240),
    is_available boolean NOT NULL DEFAULT false,
    last_seen_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_connection_id, model_id)
);

INSERT INTO provider_model_catalog(provider_connection_id, model_id, display_name, is_available)
SELECT p.id, model_id, model_id, false
  FROM provider_connections p
 CROSS JOIN LATERAL unnest(p.allowed_models) AS models(model_id)
ON CONFLICT (provider_connection_id, model_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_provider_model_catalog_available
    ON provider_model_catalog(provider_connection_id, is_available, model_id);

INSERT INTO schema_migrations(version) VALUES ('007_provider_model_catalog') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_model_catalog TO faroai;

COMMIT;
