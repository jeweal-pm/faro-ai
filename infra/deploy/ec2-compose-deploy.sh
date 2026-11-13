#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

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
python3 - "$runtime_secret_arn" "$aws_region" "$runtime_secrets_file" <<'PY'
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

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
}

try:
    result = subprocess.run(
        ["aws", "secretsmanager", "get-secret-value", "--secret-id", secret_arn,
         "--region", region, "--query", "SecretString", "--output", "text"],
        check=True, capture_output=True, text=True, timeout=30,
    )
    payload = json.loads(result.stdout)
    if not isinstance(payload, dict) or not payload:
        raise ValueError("SecretString must be a non-empty JSON object")
    unknown = set(payload) - allowed
    if unknown:
        raise ValueError("Secret contains unsupported environment keys")
    if any(not isinstance(key, str) or not isinstance(value, str) for key, value in payload.items()):
        raise ValueError("Secret keys and values must be strings")
    if any(any(char in value for char in "\x00\r\n") for value in payload.values()):
        raise ValueError("Secret values cannot contain control line breaks")

    def compose_literal(value: str) -> str:
        return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"

    content = "".join(f"{key}={compose_literal(payload[key])}\n" for key in sorted(payload))
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
except Exception:
    print("Could not retrieve or validate the staging runtime secret; secret values were not logged", file=sys.stderr)
    raise SystemExit(1)
PY
chown root:root "$runtime_secrets_file"
chmod 600 "$runtime_secrets_file"

profiles=()
artifacts_enabled=false
if grep -Eq '^FAROAI_ARTIFACT_ENABLED=(true|1)$' "$env_file"; then
  profiles+=(--profile artifacts)
  artifacts_enabled=true
fi
if grep -Eq '^FAROAI_DOCUMENT_IMPORT_ENABLED=(true|1)$' "$env_file"; then
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

compose config --quiet
aws ecr get-login-password --region "$aws_region" \
  | docker login --username AWS --password-stdin "$ecr_registry" >/dev/null
compose pull
compose up -d --no-build --remove-orphans

if [[ "$artifacts_enabled" == true ]]; then
  compose run --rm --no-deps --entrypoint python artifact-worker -c \
    'import os, psycopg; conn=psycopg.connect(os.environ["DATABASE_URL"], connect_timeout=10); row=conn.execute("SELECT current_user, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, pg_has_role(current_user, %s, %s) FROM pg_roles WHERE rolname=current_user", ("faroai_artifact_access", "member")).fetchone(); conn.close(); expected=("faroai_artifact_worker", True, False, False, False, False, False, True); raise SystemExit("Artifact worker database role is not the expected restricted login") if row != expected else print("Artifact worker database login and restricted role verified")'
fi

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
exit 1
