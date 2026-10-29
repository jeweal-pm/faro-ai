BEGIN;

CREATE TABLE IF NOT EXISTS provider_model_pricing (
    provider_connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    model text NOT NULL CHECK (length(model) BETWEEN 1 AND 160),
    input_usd_per_million_tokens numeric(20,12) NOT NULL CHECK (input_usd_per_million_tokens >= 0),
    output_usd_per_million_tokens numeric(20,12) NOT NULL CHECK (output_usd_per_million_tokens >= 0),
    verified_by_email text NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider_connection_id, model)
);

CREATE TABLE IF NOT EXISTS tenant_model_spending_policies (
    tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    max_estimated_cost_per_request_usd numeric(12,8)
      CHECK (max_estimated_cost_per_request_usd IS NULL OR max_estimated_cost_per_request_usd BETWEEN 0 AND 100),
    max_input_tokens integer NOT NULL DEFAULT 8192 CHECK (max_input_tokens BETWEEN 128 AND 128000),
    updated_by_email text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_model_pricing_verified
  ON provider_model_pricing (verified_at);

INSERT INTO schema_migrations(version) VALUES ('005_model_cost_policy') ON CONFLICT DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON provider_model_pricing, tenant_model_spending_policies TO faroai;

COMMIT;
