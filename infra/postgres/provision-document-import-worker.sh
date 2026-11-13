#!/usr/bin/env bash
set -euo pipefail

# Provision a dedicated LOGIN role for the opt-in document-import worker.
# This script does not enable the feature, start the worker, or run migrations.
# Apply migration 021 first and set FAROAI_DB_PASSWORD before invoking it.

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
env_file="$root_dir/.env"
if [[ ! -f "$env_file" ]]; then
  printf '%s\n' 'Project .env is required; create it from the deployment template first.' >&2
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'openssl and python3 are required.' >&2
  exit 1
fi

password="$(openssl rand -hex 32)"
worker_url="postgres://faroai_document_import_worker:${password}@postgres:5432/faroai"

# The generated password contains only lowercase hex, so embedding it in this
# single quoted SQL literal is safe. The secret is sent over stdin, not argv.
docker compose -f "$root_dir/docker-compose.yml" exec -T postgres \
  psql -U postgres -d faroai -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_document_import_access') THEN
    RAISE EXCEPTION 'Apply migration 021 before provisioning the document-import worker login.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_document_import_access'
             AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'The document-import access group has unsafe role attributes.';
  END IF;
END
\$\$;
SELECT format('CREATE ROLE faroai_document_import_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', '${password}')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='faroai_document_import_worker') \gexec
SELECT format('ALTER ROLE faroai_document_import_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', '${password}') \gexec
GRANT faroai_document_import_access TO faroai_document_import_worker;
SQL

DOCUMENT_IMPORT_DATABASE_URL="$worker_url" python3 - "$env_file" <<'PY'
import os
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = "FAROAI_DOCUMENT_IMPORT_DATABASE_URL"
value = os.environ["DOCUMENT_IMPORT_DATABASE_URL"]
lines = path.read_text(encoding="utf-8").splitlines()
new_line = f"{key}={value}"
for index, line in enumerate(lines):
    if line.lstrip().startswith(f"{key}="):
        lines[index] = new_line
        break
else:
    lines.append(new_line)
temporary = path.with_suffix(path.suffix + ".tmp")
temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
temporary.chmod(0o600)
temporary.replace(path)
path.chmod(0o600)
PY

unset password worker_url
printf '%s\n' 'Provisioned the restricted document-import worker login and stored its DATABASE_URL in .env.'
printf '%s\n' 'The feature remains disabled; set the encryption key and explicitly enable the worker only after review.'
