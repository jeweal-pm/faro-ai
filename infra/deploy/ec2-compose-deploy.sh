#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly release_sha="${1:-}"
readonly ecr_registry="${2:-}"
readonly aws_region="${3:-}"
readonly root="/opt/faroai"
readonly release_dir="${root}/releases/${release_sha}"
readonly env_file="${root}/.env"

[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release identifier" >&2; exit 2; }
[[ "$ecr_registry" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z]{2}(-gov)?-[a-z]+-[0-9]+\.amazonaws\.com$ ]] || {
  echo "Invalid private ECR registry" >&2
  exit 2
}
[[ "$aws_region" =~ ^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$ ]] || { echo "Invalid AWS region" >&2; exit 2; }
[[ -d "$release_dir" && ! -L "$release_dir" ]] || { echo "Release directory is unavailable" >&2; exit 2; }
[[ -f "$release_dir/docker-compose.yml" && -f "$release_dir/docker-compose.hosted.yml" ]] || {
  echo "Compose release files are missing" >&2
  exit 2
}
[[ -f "$env_file" && ! -L "$env_file" ]] || { echo "Host environment file is unavailable" >&2; exit 2; }
[[ "$(stat -c '%u' "$env_file")" == "0" ]] || { echo "Host environment file must be root-owned" >&2; exit 2; }

chmod 600 "$env_file"
export FAROAI_API_IMAGE="${ecr_registry}/faroai-api:${release_sha}"
export FAROAI_AI_SERVICE_IMAGE="${ecr_registry}/faroai-ai-service:${release_sha}"
export FAROAI_BACKOFFICE_IMAGE="${ecr_registry}/faroai-backoffice:${release_sha}"
export FAROAI_ARTIFACT_WORKER_IMAGE="${ecr_registry}/faroai-artifact-worker:${release_sha}"
export FAROAI_DOCUMENT_IMPORT_WORKER_IMAGE="${ecr_registry}/faroai-document-import-worker:${release_sha}"

profiles=()
if grep -Eq '^FAROAI_ARTIFACT_ENABLED=(true|1)$' "$env_file"; then
  profiles+=(--profile artifacts)
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
