BEGIN;

-- Group role only; a separately provisioned LOGIN and secret must be granted
-- membership by the deployment operator. Never embed a password in migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_artifact_access') THEN
    CREATE ROLE faroai_artifact_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_artifact_access'
                AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'faroai_artifact_access has unsafe role attributes';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO faroai_artifact_access;
GRANT SELECT (tenant_id,id,api_key_id,format,input_payload,claim_id,status,attempts,updated_at,created_at,expires_at),
  UPDATE (status,error_code,input_payload,updated_at,claim_id,attempts,output_sha256,size_bytes),
  DELETE ON skill_artifact_jobs TO faroai_artifact_access;
GRANT SELECT (id,status) ON tenants TO faroai_artifact_access;
GRANT SELECT (tenant_id,id,revoked_at) ON api_keys TO faroai_artifact_access;

INSERT INTO schema_migrations(version) VALUES ('017_artifact_worker_access') ON CONFLICT DO NOTHING;
COMMIT;
