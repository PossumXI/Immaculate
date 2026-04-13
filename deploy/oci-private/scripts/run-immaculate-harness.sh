#!/usr/bin/env bash

set -euo pipefail
umask 077

DEFAULT_ENV_FILE="/etc/immaculate/immaculate-harness.env"
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
  ___                             _       _       
 |_ _|_ __ ___  _ __ ___   __ _  | | __ _| |_ ___ 
  | || '_ ` _ \| '_ ` _ \ / _` | | |/ _` | __/ _ \
  | || | | | | | | | | | | (_| | | | (_| | ||  __/
 |___|_| |_| |_|_| |_| |_|\__,_| |_|\__,_|\__\___|
EOF
  printf '\033[38;5;45m'
  cat <<'EOF'
   OCI private harness | governed control plane | no public ingress
EOF
  printf '\033[0m'
}

load_secret_file() {
  local value_name="$1"
  local file_var_name="${value_name}_FILE"
  local file_path="${!file_var_name:-}"
  if [[ -z "${file_path}" ]]; then
    return 0
  fi
  if [[ ! -r "${file_path}" ]]; then
    echo "Secret file is not readable: ${file_path}" >&2
    exit 1
  fi
  local value
  value="$(tr -d '\r' < "${file_path}")"
  value="${value%$'\n'}"
  export "${value_name}=${value}"
}

append_env_arg() {
  local value_name="$1"
  local value="${!value_name:-}"
  if [[ -n "${value}" ]]; then
    PODMAN_ENV_ARGS+=(--env "${value_name}=${value}")
  fi
}

IMMACULATE_IMAGE_NAME="${IMMACULATE_IMAGE_NAME:-immaculate/harness:oci-private}"
IMMACULATE_CONTAINER_NAME="${IMMACULATE_CONTAINER_NAME:-immaculate-harness}"
IMMACULATE_PRIVATE_BIND_IP="${IMMACULATE_PRIVATE_BIND_IP:-127.0.0.1}"
IMMACULATE_PUBLISHED_PORT="${IMMACULATE_PUBLISHED_PORT:-8787}"
IMMACULATE_RUNTIME_DIR="${IMMACULATE_RUNTIME_DIR:-/var/lib/immaculate/runtime}"
IMMACULATE_LOG_DIR="${IMMACULATE_LOG_DIR:-/var/log/immaculate}"
IMMACULATE_CPU_LIMIT="${IMMACULATE_CPU_LIMIT:-4}"
IMMACULATE_MEMORY_LIMIT="${IMMACULATE_MEMORY_LIMIT:-8g}"
IMMACULATE_PIDS_LIMIT="${IMMACULATE_PIDS_LIMIT:-512}"

if [[ "${PRINT_CONFIG}" == "true" ]]; then
  cat <<EOF
image=${IMMACULATE_IMAGE_NAME}
container=${IMMACULATE_CONTAINER_NAME}
bind=${IMMACULATE_PRIVATE_BIND_IP}:${IMMACULATE_PUBLISHED_PORT}
runtime_dir=${IMMACULATE_RUNTIME_DIR}
log_dir=${IMMACULATE_LOG_DIR}
cpu_limit=${IMMACULATE_CPU_LIMIT}
memory_limit=${IMMACULATE_MEMORY_LIMIT}
pids_limit=${IMMACULATE_PIDS_LIMIT}
EOF
  exit 0
fi

load_secret_file "IMMACULATE_API_KEY"
load_secret_file "IMMACULATE_FEDERATION_SHARED_SECRET"
load_secret_file "WANDB_API_KEY"

mkdir -p "${IMMACULATE_RUNTIME_DIR}" "${IMMACULATE_LOG_DIR}"

if ! command -v podman >/dev/null 2>&1; then
  echo "podman is required but not installed." >&2
  exit 1
fi

print_banner

PODMAN_ENV_ARGS=(
  --env IMMACULATE_HARNESS_HOST=0.0.0.0
  --env IMMACULATE_HARNESS_PORT=8787
  --env IMMACULATE_RUNTIME_DIR=/var/lib/immaculate/runtime
)

append_env_arg "IMMACULATE_API_KEY"
append_env_arg "IMMACULATE_FEDERATION_SHARED_SECRET"
append_env_arg "IMMACULATE_TICK_MS"
append_env_arg "IMMACULATE_NODE_LABEL"
append_env_arg "IMMACULATE_NODE_LOCALITY"
append_env_arg "IMMACULATE_NODE_CONTROL_URL"
append_env_arg "IMMACULATE_LOCAL_WORKER_SLOTS"
append_env_arg "IMMACULATE_WORKER_COST_PER_HOUR_USD"
append_env_arg "IMMACULATE_WORKER_DEVICE_AFFINITY"
append_env_arg "IMMACULATE_NODE_COST_PER_HOUR_USD"
append_env_arg "IMMACULATE_NODE_DEVICE_AFFINITY"
append_env_arg "IMMACULATE_OLLAMA_URL"
append_env_arg "WANDB_API_KEY"
append_env_arg "WANDB_ENTITY"
append_env_arg "WANDB_PROJECT"
append_env_arg "WANDB_MODE"

exec podman run \
  --name "${IMMACULATE_CONTAINER_NAME}" \
  --replace \
  --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --pids-limit "${IMMACULATE_PIDS_LIMIT}" \
  --memory "${IMMACULATE_MEMORY_LIMIT}" \
  --cpus "${IMMACULATE_CPU_LIMIT}" \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  --tmpfs /run:rw,noexec,nosuid,size=16m \
  --publish "${IMMACULATE_PRIVATE_BIND_IP}:${IMMACULATE_PUBLISHED_PORT}:8787/tcp" \
  --volume "${IMMACULATE_RUNTIME_DIR}:/var/lib/immaculate/runtime:Z" \
  --volume "${IMMACULATE_LOG_DIR}:/var/log/immaculate:Z" \
  "${PODMAN_ENV_ARGS[@]}" \
  "${IMMACULATE_IMAGE_NAME}"
