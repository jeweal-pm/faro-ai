BEGIN;

ALTER TABLE business_document_import_jobs
  ADD COLUMN IF NOT EXISTS model_consent_prompt_hash text,
  ADD COLUMN IF NOT EXISTS po_preparation_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS po_pending_confirmation_id text,
  ADD COLUMN IF NOT EXISTS po_preparation_result jsonb,
  ADD COLUMN IF NOT EXISTS po_confirmation_result jsonb;

-- Consent recorded before prompt binding was introduced is not sufficient to
-- continue a document into an AI-backed PO flow.
UPDATE business_document_import_jobs
SET model_processing_consented=false, model_consented_at=NULL
WHERE model_processing_consented=true AND model_consent_prompt_hash IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='business_document_model_consent_prompt_hash'
      AND conrelid='business_document_import_jobs'::regclass
  ) THEN
    ALTER TABLE business_document_import_jobs
      ADD CONSTRAINT business_document_model_consent_prompt_hash
      CHECK ((model_processing_consented AND model_consent_prompt_hash ~ '^[0-9a-f]{64}$')
          OR (NOT model_processing_consented AND model_consent_prompt_hash IS NULL));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='business_document_po_preparation_status'
      AND conrelid='business_document_import_jobs'::regclass
  ) THEN
    ALTER TABLE business_document_import_jobs
      ADD CONSTRAINT business_document_po_preparation_status
      CHECK (po_preparation_status IN ('not_started','processing','prepared','failed','confirming','completed','unknown'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='business_document_po_result_size'
      AND conrelid='business_document_import_jobs'::regclass
  ) THEN
    ALTER TABLE business_document_import_jobs
      ADD CONSTRAINT business_document_po_result_size
      CHECK ((po_pending_confirmation_id IS NULL OR po_pending_confirmation_id ~ '^[a-f0-9]{32}$')
          AND (po_preparation_result IS NULL OR (jsonb_typeof(po_preparation_result)='object' AND pg_column_size(po_preparation_result)<=524288))
          AND (po_confirmation_result IS NULL OR (jsonb_typeof(po_confirmation_result)='object' AND pg_column_size(po_confirmation_result)<=524288)));
  END IF;
END $$;

GRANT SELECT (model_consent_prompt_hash)
  ON business_document_import_jobs TO faroai;

INSERT INTO schema_migrations(version)
VALUES ('023_document_po_prompt_consent')
ON CONFLICT DO NOTHING;

COMMIT;
