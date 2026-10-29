BEGIN;

ALTER TABLE embedding_jobs
  ADD COLUMN IF NOT EXISTS job_kind text NOT NULL DEFAULT 'knowledge_documents';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'embedding_jobs_job_kind_check'
       AND conrelid = 'embedding_jobs'::regclass
  ) THEN
    ALTER TABLE embedding_jobs
      ADD CONSTRAINT embedding_jobs_job_kind_check
      CHECK (job_kind IN ('knowledge_documents', 'catalogue_products'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_catalogue_pending
  ON embedding_jobs (tenant_id, created_at)
  WHERE status = 'pending' AND job_kind = 'catalogue_products';

INSERT INTO schema_migrations(version)
VALUES ('014_semantic_product_vectors')
ON CONFLICT DO NOTHING;

COMMIT;
