BEGIN;

ALTER TABLE tenant_learning_settings
  ADD COLUMN IF NOT EXISTS local_training_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_authorization_reference text;

ALTER TABLE tenant_learning_settings
  ADD CONSTRAINT tenant_learning_local_authorization_reference_length
  CHECK (local_authorization_reference IS NULL OR length(local_authorization_reference) <= 300);

ALTER TABLE learning_candidates
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'interaction',
  ADD COLUMN IF NOT EXISTS rag_training_consent boolean NOT NULL DEFAULT false;

ALTER TABLE learning_candidates
  ADD CONSTRAINT learning_candidates_origin_check
  CHECK (origin IN ('interaction', 'rag_document'));

ALTER TABLE learning_candidates
  DROP CONSTRAINT IF EXISTS learning_candidates_check;
ALTER TABLE learning_candidates
  DROP CONSTRAINT IF EXISTS learning_candidates_check1;
ALTER TABLE learning_candidates
  ADD CONSTRAINT learning_candidates_local_training_requires_consent
  CHECK (NOT local_training_approved OR ((local_consent OR rag_training_consent) AND preferred_answer IS NOT NULL));
ALTER TABLE learning_candidates
  ADD CONSTRAINT learning_candidates_shared_training_requires_consent
  CHECK (NOT shared_training_approved OR (shared_consent AND preferred_answer IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_learning_candidates_rag_training
  ON learning_candidates (tenant_id, origin, review_status, created_at DESC)
  WHERE rag_training_consent = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_candidates_rag_draft_dedupe
  ON learning_candidates (tenant_id, content_hash)
  WHERE origin = 'rag_document' AND review_status <> 'deleted';

INSERT INTO schema_migrations(version) VALUES ('005_tenant_rag_learning') ON CONFLICT DO NOTHING;

COMMIT;
