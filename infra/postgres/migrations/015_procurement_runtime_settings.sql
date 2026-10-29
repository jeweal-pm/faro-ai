BEGIN;

CREATE TABLE IF NOT EXISTS platform_runtime_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL,
  updated_by_email text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_runtime_settings(setting_key, setting_value, updated_by_email)
VALUES ('procurement_conversation_history', '{"enabled": true}'::jsonb, 'system')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO schema_migrations(version)
VALUES ('015_procurement_runtime_settings')
ON CONFLICT DO NOTHING;

COMMIT;
