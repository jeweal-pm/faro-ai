#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
deploy_stage=VALIDATE_HOST
trap 'code=$?; echo "FAROAI_DEPLOY_FAILED_STAGE=${deploy_stage} EXIT=${code}" >&2' ERR

readonly release_sha="${1:-}"
readonly ecr_registry="${2:-}"
readonly aws_region="${3:-}"
readonly runtime_secret_arn="${4:-}"
readonly root="/opt/faroai"
readonly release_dir="${root}/releases/${release_sha}"
readonly env_file="${root}/.env"
readonly runtime_secrets_file="${root}/.runtime-secrets.env"

[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release identifier" >&2; exit 2; }
[[ "$ecr_registry" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z]{2}(-gov)?-[a-z]+-[0-9]+\.amazonaws\.com$ ]] || {
  echo "Invalid private ECR registry" >&2
  exit 2
}
[[ "$aws_region" =~ ^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$ ]] || { echo "Invalid AWS region" >&2; exit 2; }
[[ "$runtime_secret_arn" =~ ^arn:aws:secretsmanager:${aws_region}:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$ ]] || {
  echo "Invalid staging runtime secret ARN" >&2
  exit 2
}
[[ -d "$release_dir" && ! -L "$release_dir" ]] || { echo "Release directory is unavailable" >&2; exit 2; }
[[ -f "$release_dir/docker-compose.yml" && -f "$release_dir/docker-compose.hosted.yml" ]] || {
  echo "Compose release files are missing" >&2
  exit 2
}
if [[ -L "$env_file" ]]; then
  echo "Host environment file must not be a symlink" >&2
  exit 2
fi
if [[ ! -e "$env_file" ]]; then
  # Runtime secrets are fetched separately from Secrets Manager. The host file
  # is only for optional non-secret overrides; an empty file uses Compose defaults.
  install -o root -g root -m 0600 /dev/null "$env_file"
  echo "Created empty host configuration; Compose defaults will be used"
fi
[[ -f "$env_file" ]] || { echo "Host environment file is not a regular file" >&2; exit 2; }
[[ "$(stat -c '%u' "$env_file")" == "0" ]] || { echo "Host environment file must be root-owned" >&2; exit 2; }

chmod 600 "$env_file"
export FAROAI_API_IMAGE="${ecr_registry}/faroai-api:${release_sha}"
export FAROAI_AI_SERVICE_IMAGE="${ecr_registry}/faroai-ai-service:${release_sha}"
export FAROAI_BACKOFFICE_IMAGE="${ecr_registry}/faroai-backoffice:${release_sha}"
export FAROAI_ARTIFACT_WORKER_IMAGE="${ecr_registry}/faroai-artifact-worker:${release_sha}"
export FAROAI_DOCUMENT_IMPORT_WORKER_IMAGE="${ecr_registry}/faroai-document-import-worker:${release_sha}"

# Pull the one tenant-independent staging runtime secret only on EC2. The
# secret must be a JSON object of approved environment-name/string pairs.
deploy_stage=LOAD_RUNTIME_SECRET
python3 - "$runtime_secret_arn" "$aws_region" "$runtime_secrets_file" <<'PY'
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import quote

secret_arn, region, target_name = sys.argv[1:]
allowed = {
    "POSTGRES_PASSWORD",
    "FAROAI_DB_PASSWORD",
    "DATABASE_URL",
    "REDIS_URL",
    "FAROAI_INTERNAL_SECRET",
    "FAROAI_GIS_MCP_CONTEXT_SECRET",
    "API_KEY_PEPPER",
    "QDRANT_API_KEY",
    "QDRANT_READ_ONLY_API_KEY",
    "MODEL_API_KEY",
    "BACKOFFICE_OIDC_CLIENT_SECRET",
    "BACKOFFICE_LOCAL_ADMIN_PASSWORD_HASH_B64",
    "FAROAI_CONFIG_ENCRYPTION_KEY",
    "FAROAI_GIS_API_KEY",
    "FAROAI_ARTIFACT_DATABASE_URL",
    "FAROAI_DOCUMENT_IMPORT_DATABASE_URL",
    "FAROAI_DOCUMENT_IMPORT_ENCRYPTION_KEY",
    "BACKOFFICE_COOKIE_SECURE", "BACKOFFICE_ENABLED", "BACKOFFICE_LOCAL_ADMIN_EMAIL",
    "BACKOFFICE_LOCAL_AUTH_ENABLED", "BACKOFFICE_OIDC_ENABLED", "BACKOFFICE_URL",
    "EMBEDDING_DIMENSION", "EMBEDDING_MODEL", "FAROAI_ALLOWED_LOCAL_MODEL_HOSTS",
    "FAROAI_ALLOW_EXTERNAL_PROVIDERS", "FAROAI_ARTIFACT_ENABLED",
    "FAROAI_DEPLOYMENT_MODE", "FAROAI_DOCUMENT_IMPORT_ENABLED",
    "FAROAI_LOCAL_LLM_ENABLED", "FAROAI_TENANT_MODE", "MCP_ALLOWED_HOSTS",
    "MCP_ALLOW_DOCKER_HOST_HTTP", "MCP_CONNECTIONS_JSON", "MODEL_BASE_URL",
    "MODEL_NAME", "MODEL_PROVIDER", "OPENROUTER_DATA_COLLECTION",
    "PRODUCT_BASE_URL", "QDRANT_COLLECTION",
}
ignored_legacy = {"DECISION_API_KEY", "DECISION_BASE_URL", "DECISION_MODEL", "FAROAI_DEMO_TENANT_ID"}

def fail(code: str) -> None:
    print(f"Staging secret preflight failed [{code}]; secret values were not logged", file=sys.stderr)
    raise SystemExit(1)

try:
    result = subprocess.run(
        ["aws", "secretsmanager", "get-secret-value", "--secret-id", secret_arn,
         "--region", region, "--query", "SecretString", "--output", "text"],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        stderr = result.stderr
        if "AccessDenied" in stderr:
            fail("EC2_ROLE_SECRET_ACCESS_DENIED")
        if "ResourceNotFound" in stderr:
            fail("SECRET_NOT_FOUND_IN_REGION")
        if "DecryptionFailure" in stderr:
            fail("SECRET_DECRYPTION_FAILED")
        fail("SECRET_FETCH_FAILED")
    if result.stdout.strip() in ("", "None"):
        fail("SECRET_STRING_MISSING")
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict) or not payload:
        fail("SECRET_NOT_NONEMPTY_JSON_OBJECT")
    unknown = set(payload) - allowed - ignored_legacy
    if unknown:
        safe_names = [key if isinstance(key, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,100}', key) else '<invalid-name>' for key in sorted(unknown)]
        print('Unsupported secret key names: ' + ', '.join(safe_names), file=sys.stderr)
        fail("UNSUPPORTED_SECRET_KEYS")
    if any(not isinstance(key, str) or not isinstance(value, str) for key, value in payload.items()):
        fail("SECRET_VALUES_MUST_BE_STRINGS")
    if any(any(char in value for char in "\x00\r\n") for value in payload.values()):
        fail("SECRET_VALUE_HAS_LINE_BREAK")
    required = {"POSTGRES_PASSWORD", "FAROAI_DB_PASSWORD", "FAROAI_INTERNAL_SECRET", "API_KEY_PEPPER", "QDRANT_API_KEY", "QDRANT_READ_ONLY_API_KEY"}
    missing = sorted(key for key in required if not payload.get(key))
    if missing:
        print("Missing required secret key names: " + ", ".join(missing), file=sys.stderr)
        fail("REQUIRED_SECRET_KEYS_MISSING")
    if set(payload) & ignored_legacy:
        print("Ignored obsolete staging key names: " + ", ".join(sorted(set(payload) & ignored_legacy)), file=sys.stderr)

    # This staging Compose stack owns its PostgreSQL service. Build the app URI
    # from the single source of truth so reserved password characters cannot
    # be interpreted as URI host/query syntax by libpq.
    payload["DATABASE_URL"] = (
        "postgresql://faroai:"
        + quote(payload["FAROAI_DB_PASSWORD"], safe="")
        + "@postgres:5432/faroai"
    )
    print("Staging app database URL derived from FAROAI_DB_PASSWORD")

    def compose_literal(value: str) -> str:
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"

    content = "".join(f"{key}={compose_literal(payload[key])}\n" for key in sorted(set(payload) & allowed))
    target = Path(target_name)
    fd, temporary_name = tempfile.mkstemp(prefix=".runtime-secrets.", dir=target.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary_name, target)
        os.chmod(target, 0o600)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)
except subprocess.TimeoutExpired:
    fail("SECRET_FETCH_TIMEOUT")
except json.JSONDecodeError:
    fail("SECRET_STRING_INVALID_JSON")
except OSError:
    fail("SECRET_FILE_OR_COMMAND_ERROR")
PY
chown root:root "$runtime_secrets_file"
chmod 600 "$runtime_secrets_file"

profile_enabled() {
  local name="$1" line=""
  line="$(grep -E "^${name}=" "$runtime_secrets_file" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    line="$(grep -E "^${name}=" "$env_file" | tail -n 1 || true)"
  fi
  case "${line#*=}" in
    true|1|\'true\'|\'1\'|\"true\"|\"1\") return 0 ;;
    *) return 1 ;;
  esac
}

profiles=()
artifacts_enabled=false
if profile_enabled FAROAI_ARTIFACT_ENABLED; then
  profiles+=(--profile artifacts)
  artifacts_enabled=true
fi
if profile_enabled FAROAI_DOCUMENT_IMPORT_ENABLED; then
  profiles+=(--profile document-import)
fi

docker_config="$(mktemp -d "${TMPDIR:-/tmp}/faroai-docker-config.XXXXXX")"
trap 'rm -rf -- "$docker_config"' EXIT
export DOCKER_CONFIG="$docker_config"

compose() {
  docker compose \
    --env-file "$env_file" \
    --env-file "$runtime_secrets_file" \
    -f "$release_dir/docker-compose.yml" \
    -f "$release_dir/docker-compose.hosted.yml" \
    "${profiles[@]}" \
    "$@"
}

deploy_stage=VALIDATE_COMPOSE
compose config --quiet
deploy_stage=ECR_LOGIN
aws ecr get-login-password --region "$aws_region" \
  | docker login --username AWS --password-stdin "$ecr_registry" >/dev/null
deploy_stage=PULL_IMAGES
compose pull --quiet
deploy_stage=START_SERVICES
compose up -d --no-build --quiet-pull --remove-orphans

if [[ "$artifacts_enabled" == true ]]; then
  deploy_stage=VERIFY_ARTIFACT_DATABASE_ROLE
  compose run --rm --no-deps --entrypoint python artifact-worker -c \
    'import os, psycopg; conn=psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=10); row=conn.execute("SELECT current_user, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, pg_has_role(current_user, %s, %s) FROM pg_roles WHERE rolname=current_user", ("faroai_artifact_access", "member")).fetchone(); conn.close(); expected=("faroai_artifact_worker", True, False, False, False, False, False, True); raise SystemExit("Artifact worker database role is not the expected restricted login") if row != expected else print("Artifact worker database login and restricted role verified")'
fi

deploy_stage=WAIT_API_READINESS
for attempt in $(seq 1 18); do
  if compose exec -T api node -e \
    "fetch('http://127.0.0.1:3000/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
    >/dev/null 2>&1; then
    install -d -o root -g root -m 0750 "$root"
    printf '%s\n' "$release_sha" > "$root/.deployed-release"
    chmod 600 "$root/.deployed-release"
    echo "FaroAI staging release is ready"
    exit 0
  fi
  sleep 10
done

echo "FaroAI API readiness check failed; inspect staging service status without printing secrets" >&2
echo "FAROAI_DEPLOY_FAILED_STAGE=WAIT_API_READINESS EXIT=1" >&2
exit 1
