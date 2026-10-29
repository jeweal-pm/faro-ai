BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_connections_input_cap_max_10'
       AND conrelid = 'provider_connections'::regclass
  ) THEN
    ALTER TABLE provider_connections
      ADD CONSTRAINT provider_connections_input_cap_max_10
      CHECK (max_input_usd_per_million_tokens <= 10);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'provider_connections_output_cap_max_10'
       AND conrelid = 'provider_connections'::regclass
  ) THEN
    ALTER TABLE provider_connections
      ADD CONSTRAINT provider_connections_output_cap_max_10
      CHECK (max_output_usd_per_million_tokens <= 10);
  END IF;
END
$$;

INSERT INTO schema_migrations(version)
VALUES ('011_provider_price_cap_max_10')
ON CONFLICT DO NOTHING;

COMMIT;