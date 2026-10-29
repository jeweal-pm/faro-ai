BEGIN;

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'knowledge_documents_approved_by_length'
       AND conrelid = 'knowledge_documents'::regclass
  ) THEN
    ALTER TABLE knowledge_documents
      ADD CONSTRAINT knowledge_documents_approved_by_length
      CHECK (approved_by IS NULL OR length(approved_by) <= 320);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_review
  ON knowledge_documents (tenant_id, status, updated_at DESC);

INSERT INTO schema_migrations(version)
VALUES ('013_manual_knowledge_approval')
ON CONFLICT DO NOTHING;

COMMIT;
