BEGIN;

ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS max_input_usd_per_million_tokens numeric(20,12) NOT NULL DEFAULT 1000000
    CHECK (max_input_usd_per_million_tokens >= 0),
  ADD COLUMN IF NOT EXISTS max_output_usd_per_million_tokens numeric(20,12) NOT NULL DEFAULT 1000000
    CHECK (max_output_usd_per_million_tokens >= 0);

ALTER TABLE provider_model_pricing
  ADD COLUMN IF NOT EXISTS price_source text NOT NULL DEFAULT 'manual'
    CHECK (price_source IN ('manual', 'provider'));

ALTER TABLE provider_model_catalog
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_model_catalog_id ON provider_model_catalog(id);

INSERT INTO schema_migrations(version) VALUES ('008_provider_price_caps_and_synced_rates') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_model_catalog, provider_model_pricing, provider_connections TO faroai;

COMMIT;
