BEGIN;

ALTER TABLE skill_artifact_jobs
  ADD COLUMN IF NOT EXISTS base_skill_id text;

UPDATE skill_artifact_jobs SET base_skill_id = CASE format
  WHEN 'pdf' THEN 'base.pdf'
  WHEN 'xlsx' THEN 'base.xlsx'
  WHEN 'docx' THEN 'base.docx'
  WHEN 'pptx' THEN 'base.pptx'
END
WHERE base_skill_id IS NULL;

ALTER TABLE skill_artifact_jobs
  ALTER COLUMN base_skill_id SET NOT NULL,
  ADD CONSTRAINT skill_artifact_base_skill_format CHECK (
    (format = 'pdf' AND base_skill_id = 'base.pdf') OR
    (format = 'xlsx' AND base_skill_id = 'base.xlsx') OR
    (format = 'docx' AND base_skill_id = 'base.docx') OR
    (format = 'pptx' AND base_skill_id = 'base.pptx')
  );

GRANT SELECT (base_skill_id) ON skill_artifact_jobs TO faroai_artifact_access;
INSERT INTO schema_migrations(version) VALUES ('018_base_skill_artifact_binding') ON CONFLICT DO NOTHING;
COMMIT;
