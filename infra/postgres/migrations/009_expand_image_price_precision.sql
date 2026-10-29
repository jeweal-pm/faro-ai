BEGIN;

ALTER TABLE provider_model_pricing
  ALTER COLUMN image_usd_per_image TYPE numeric(20,12);

INSERT INTO schema_migrations(version) VALUES ('009_expand_image_price_precision') ON CONFLICT DO NOTHING;

COMMIT;
