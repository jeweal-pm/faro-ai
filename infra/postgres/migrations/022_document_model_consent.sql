BEGIN;

ALTER TABLE business_document_import_jobs
  ADD COLUMN IF NOT EXISTS model_processing_consented boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS model_consented_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='business_document_model_consent_timestamp'
      AND conrelid='business_document_import_jobs'::regclass
  ) THEN
    ALTER TABLE business_document_import_jobs
      ADD CONSTRAINT business_document_model_consent_timestamp
      CHECK ((model_processing_consented AND model_consented_at IS NOT NULL)
          OR (NOT model_processing_consented AND model_consented_at IS NULL));
  END IF;
END $$;

GRANT SELECT (model_processing_consented,model_consented_at)
  ON business_document_import_jobs TO faroai_document_import_access;

INSERT INTO schema_migrations(version)
VALUES ('022_document_model_consent')
ON CONFLICT DO NOTHING;

COMMIT;
