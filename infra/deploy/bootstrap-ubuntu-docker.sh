#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ "$(id -u)" == 0 ]] || { echo 'HOST_BOOTSTRAP_REQUIRES_ROOT' >&2; exit 1; }
[[ -r /etc/os-release ]] || { echo 'HOST_OS_UNKNOWN' >&2; exit 1; }
. /etc/os-release
[[ "${ID:-}" == ubuntu ]] || { echo 'HOST_OS_NOT_UBUNTU' >&2; exit 1; }
case "${VERSION_CODENAME:-}" in
  jammy|noble|resolute) ;;
  *) echo 'HOST_UBUNTU_RELEASE_NOT_APPROVED' >&2; exit 1 ;;
esac
case "$(dpkg --print-architecture)" in
  amd64|arm64) ;;
  *) echo 'HOST_ARCH_NOT_APPROVED' >&2; exit 1 ;;
esac

if command -v docker >/dev/null 2>&1; then
  docker compose version >/dev/null || { echo 'DOCKER_COMPOSE_PLUGIN_MISSING' >&2; exit 1; }
  systemctl is-active --quiet docker || { echo 'DOCKER_DAEMON_NOT_RUNNING' >&2; exit 1; }
  echo 'DOCKER_ALREADY_READY'
  exit 0
fi

# Do not remove existing runtime packages or touch /var/lib/docker. A conflict
# needs an administrator review because another workload may depend on it.
for package in docker.io docker-compose docker-compose-v2 podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -qx 'install ok installed'; then
    echo "CONFLICTING_CONTAINER_PACKAGE: $package" >&2
    exit 1
  fi
done

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl
install -d -o root -g root -m 0755 /etc/apt/keyrings
curl -fsSL --proto '=https' --tlsv1.2 \
  https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
chmod 0644 /etc/apt/sources.list.d/docker.sources
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
apt-get clean
systemctl enable --now docker >/dev/null
docker compose version >/dev/null
docker info >/dev/null
echo 'DOCKER_BOOTSTRAP_OK'
