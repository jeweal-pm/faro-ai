BEGIN;

ALTER TABLE provider_connections
  ALTER COLUMN max_input_usd_per_million_tokens SET DEFAULT 0,
  ALTER COLUMN max_output_usd_per_million_tokens SET DEFAULT 0;

UPDATE provider_connections
   SET max_input_usd_per_million_tokens=0,
       max_output_usd_per_million_tokens=0,
       allowed_models='{}',
       updated_at=now()
 WHERE max_input_usd_per_million_tokens<>0
    OR max_output_usd_per_million_tokens<>0
    OR allowed_models<>'{}';

INSERT INTO schema_migrations(version) VALUES ('010_fail_closed_provider_price_caps') ON CONFLICT DO NOTHING;

COMMIT;
