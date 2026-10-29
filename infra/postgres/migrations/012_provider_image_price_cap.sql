BEGIN;

ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS max_image_usd_per_image numeric(20,12) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_connections_image_cap_range'
       AND conrelid = 'provider_connections'::regclass
  ) THEN
    ALTER TABLE provider_connections
      ADD CONSTRAINT provider_connections_image_cap_range
      CHECK (max_image_usd_per_image >= 0 AND max_image_usd_per_image <= 10);
  END IF;
END
$$;

INSERT INTO schema_migrations(version)
VALUES ('012_provider_image_price_cap')
ON CONFLICT DO NOTHING;

COMMIT;
