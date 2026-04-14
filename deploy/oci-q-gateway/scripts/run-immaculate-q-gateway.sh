#!/usr/bin/env bash

set -euo pipefail
umask 077

DEFAULT_ENV_FILE="/etc/immaculate/immaculate-q-gateway.env"
PRINT_CONFIG=false

while (($# > 0)); do
  case "$1" in
    --env-file)
      DEFAULT_ENV_FILE="$2"
      shift 2
      ;;
    --print-config)
      PRINT_CONFIG=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -f "${DEFAULT_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${DEFAULT_ENV_FILE}"
  set +a
fi

print_banner() {
  printf '\033[38;5;226m'
  cat <<'EOF'
   ___       __
  / _ \     / /
 | | | |   / /
 | |_| |  / /___
  \__\_\ /_____/
EOF
  printf '\033[38;5;45m'
  cat <<'EOF'
   OCI private Q gateway | dedicated node edge | no public ingress by default
EOF
  printf '\033[0m'
}

IMMACULATE_Q_GATEWAY_IMAGE_NAME="${IMMACULATE_Q_GATEWAY_IMAGE_NAME:-immaculate/q-gateway:oci-private}"
IMMACULATE_Q_GATEWAY_CONTAINER_NAME="${IMMACULATE_Q_GATEWAY_CONTAINER_NAME:-immaculate-q-gateway}"
IMMACULATE_Q_GATEWAY_PRIVATE_BIND_IP="${IMMACULATE_Q_GATEWAY_PRIVATE_BIND_IP:-127.0.0.1}"
IMMACULATE_Q_GATEWAY_PUBLISHED_PORT="${IMMACULATE_Q_GATEWAY_PUBLISHED_PORT:-8788}"
IMMACULATE_RUNTIME_DIR="${IMMACULATE_RUNTIME_DIR:-/var/lib/immaculate/runtime}"
IMMACULATE_Q_GATEWAY_LOG_DIR="${IMMACULATE_Q_GATEWAY_LOG_DIR:-/var/log/immaculate/q-gateway}"
IMMACULATE_Q_GATEWAY_CPU_LIMIT="${IMMACULATE_Q_GATEWAY_CPU_LIMIT:-1}"
IMMACULATE_Q_GATEWAY_MEMORY_LIMIT="${IMMACULATE_Q_GATEWAY_MEMORY_LIMIT:-1g}"
IMMACULATE_Q_GATEWAY_PIDS_LIMIT="${IMMACULATE_Q_GATEWAY_PIDS_LIMIT:-128}"
IMMACULATE_Q_GATEWAY_HOST="${IMMACULATE_Q_GATEWAY_HOST:-0.0.0.0}"
IMMACULATE_Q_GATEWAY_PORT="${IMMACULATE_Q_GATEWAY_PORT:-8788}"

if [[ "${PRINT_CONFIG}" == "true" ]]; then
  cat <<EOF
image=${IMMACULATE_Q_GATEWAY_IMAGE_NAME}
container=${IMMACULATE_Q_GATEWAY_CONTAINER_NAME}
bind=${IMMACULATE_Q_GATEWAY_PRIVATE_BIND_IP}:${IMMACULATE_Q_GATEWAY_PUBLISHED_PORT}
listen=${IMMACULATE_Q_GATEWAY_HOST}:${IMMACULATE_Q_GATEWAY_PORT}
runtime_dir=${IMMACULATE_RUNTIME_DIR}
log_dir=${IMMACULATE_Q_GATEWAY_LOG_DIR}
cpu_limit=${IMMACULATE_Q_GATEWAY_CPU_LIMIT}
memory_limit=${IMMACULATE_Q_GATEWAY_MEMORY_LIMIT}
pids_limit=${IMMACULATE_Q_GATEWAY_PIDS_LIMIT}
EOF
  exit 0
fi

mkdir -p "${IMMACULATE_RUNTIME_DIR}" "${IMMACULATE_Q_GATEWAY_LOG_DIR}"

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required but not installed." >&2
  exit 1
fi

print_banner

PODMAN_ENV_ARGS=(
  --env IMMACULATE_Q_GATEWAY_HOST=0.0.0.0
  --env IMMACULATE_Q_GATEWAY_PORT=8788
  --env IMMACULATE_RUNTIME_DIR=/var/lib/immaculate/runtime
)

append_env_arg() {
  local value_name="$1"
  local value="${!value_name:-}"
  if [[ -n "${value}" ]]; then
    PODMAN_ENV_ARGS+=(--env "${value_name}=${value}")
  fi
}

append_env_arg "IMMACULATE_Q_GATEWAY_ALLOWED_ORIGINS"
append_env_arg "IMMACULATE_Q_GATEWAY_MAX_MESSAGES"
append_env_arg "IMMACULATE_Q_GATEWAY_MAX_INPUT_CHARS"
append_env_arg "IMMACULATE_Q_GATEWAY_TIMEOUT_MS"
append_env_arg "IMMACULATE_OLLAMA_URL"
append_env_arg "IMMACULATE_Q_API_KEYS_PATH"
append_env_arg "IMMACULATE_Q_API_DEFAULT_RPM"
append_env_arg "IMMACULATE_Q_API_DEFAULT_BURST"
append_env_arg "IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT"

exec podman run \
  --name "${IMMACULATE_Q_GATEWAY_CONTAINER_NAME}" \
  --replace \
  --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit "${IMMACULATE_Q_GATEWAY_PIDS_LIMIT}" \
  --memory "${IMMACULATE_Q_GATEWAY_MEMORY_LIMIT}" \
  --cpus "${IMMACULATE_Q_GATEWAY_CPU_LIMIT}" \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --tmpfs /run:rw,noexec,nosuid,size=16m \
  --publish "${IMMACULATE_Q_GATEWAY_PRIVATE_BIND_IP}:${IMMACULATE_Q_GATEWAY_PUBLISHED_PORT}:8788/tcp" \
  --volume "${IMMACULATE_RUNTIME_DIR}:/var/lib/immaculate/runtime:Z" \
  --volume "${IMMACULATE_Q_GATEWAY_LOG_DIR}:/var/log/immaculate:Z" \
  "${PODMAN_ENV_ARGS[@]}" \
  "${IMMACULATE_Q_GATEWAY_IMAGE_NAME}"
