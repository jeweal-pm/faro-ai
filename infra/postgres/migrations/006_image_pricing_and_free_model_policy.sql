BEGIN;

ALTER TABLE provider_model_pricing
  ADD COLUMN IF NOT EXISTS image_usd_per_image numeric(12,8)
    CHECK (image_usd_per_image IS NULL OR image_usd_per_image >= 0);

ALTER TABLE tenant_model_spending_policies
  ADD COLUMN IF NOT EXISTS max_images_per_request integer NOT NULL DEFAULT 0
    CHECK (max_images_per_request BETWEEN 0 AND 16),
  ADD COLUMN IF NOT EXISTS exclude_free_models boolean NOT NULL DEFAULT true;

INSERT INTO schema_migrations(version) VALUES ('006_image_pricing_and_free_model_policy') ON CONFLICT DO NOTHING;

COMMIT;
