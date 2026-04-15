#!/usr/bin/env bash

set -euo pipefail
umask 077

DEFAULT_ENV_FILE="/etc/immaculate/immaculate-q-training.env"
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
  # shellcheck disable=SC1090,SC1091
  . <(tr -d '\r' < "${DEFAULT_ENV_FILE}")
  set +a
fi

print_banner() {
  printf '\033[38;5;226m'
  cat <<'EOF'
   ____        _______             _       _
  / __ \      / /_  (_)___  ____ _(_)___  (_)___  ____ _
 / / / /_    / / / / / __ \/ __ `/ / __ \/ / __ \/ __ `/
/ /_/ / /___/ / / / / / / / /_/ / / / / / / / / / /_/ /
\___\_\_____/_/ /_/_/_/ /_/\__, /_/_/ /_/_/_/ /_/\__, /
                          /____/                /____/
EOF
  printf '\033[38;5;45m'
  cat <<'EOF'
   OCI Q training runner | tracked hybrid session | governed cloud lane
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

IMMACULATE_REPO_ROOT="${IMMACULATE_REPO_ROOT:-/opt/immaculate/src}"
IMMACULATE_Q_TRAINING_PYTHON="${IMMACULATE_Q_TRAINING_PYTHON:-python3}"
IMMACULATE_Q_TRAINING_RUNTIME_DIR="${IMMACULATE_Q_TRAINING_RUNTIME_DIR:-/var/lib/immaculate/q-training}"
IMMACULATE_Q_TRAINING_LOG_DIR="${IMMACULATE_Q_TRAINING_LOG_DIR:-/var/log/immaculate/q-training}"
IMMACULATE_Q_TRAINING_BUNDLE_PATH="${IMMACULATE_Q_TRAINING_BUNDLE_PATH:-/var/lib/immaculate/q-training/session-bundle.tar.gz}"
IMMACULATE_Q_TRAINING_DRY_RUN="${IMMACULATE_Q_TRAINING_DRY_RUN:-false}"
SESSION_REPO_PATH="${IMMACULATE_Q_HYBRID_SESSION_REPO_PATH:-}"
OCI_BIN="${OCI_CLI_BIN:-oci}"

if [[ "${PRINT_CONFIG}" == "true" ]]; then
  cat <<EOF
repo_root=${IMMACULATE_REPO_ROOT}
python=${IMMACULATE_Q_TRAINING_PYTHON}
bundle=${IMMACULATE_Q_TRAINING_BUNDLE_PATH}
runtime_dir=${IMMACULATE_Q_TRAINING_RUNTIME_DIR}
log_dir=${IMMACULATE_Q_TRAINING_LOG_DIR}
session_repo_path=${SESSION_REPO_PATH}
EOF
  exit 0
fi

mkdir -p "${IMMACULATE_Q_TRAINING_RUNTIME_DIR}" "${IMMACULATE_Q_TRAINING_LOG_DIR}" "${HF_HOME:-${IMMACULATE_Q_TRAINING_RUNTIME_DIR}/cache/hf}" "${TRANSFORMERS_CACHE:-${IMMACULATE_Q_TRAINING_RUNTIME_DIR}/cache/transformers}" "${WANDB_DIR:-${IMMACULATE_Q_TRAINING_RUNTIME_DIR}/cache/wandb}"

if [[ -x "${IMMACULATE_REPO_ROOT}/deploy/oci-training/scripts/fetch-oci-training-secrets.sh" ]]; then
  bash "${IMMACULATE_REPO_ROOT}/deploy/oci-training/scripts/fetch-oci-training-secrets.sh" --env-file "${DEFAULT_ENV_FILE}"
fi

load_secret_file "HF_TOKEN"
load_secret_file "WANDB_API_KEY"

if [[ ! -f "${IMMACULATE_Q_TRAINING_BUNDLE_PATH}" ]]; then
  if [[ -z "${OCI_OBJECT_STORAGE_NAMESPACE:-}" || -z "${OCI_OBJECT_STORAGE_BUCKET:-}" || -z "${OCI_Q_TRAINING_BUNDLE_OBJECT:-}" ]]; then
    echo "Training bundle is missing and Object Storage download is not configured." >&2
    exit 1
  fi
  if ! command -v "${OCI_BIN}" >/dev/null 2>&1; then
    echo "OCI CLI is required to download the training bundle." >&2
    exit 1
  fi
  "${OCI_BIN}" os object get \
    --auth "${OCI_CLI_AUTH:-instance_principal}" \
    --namespace-name "${OCI_OBJECT_STORAGE_NAMESPACE}" \
    --bucket-name "${OCI_OBJECT_STORAGE_BUCKET}" \
    --name "${OCI_Q_TRAINING_BUNDLE_OBJECT}" \
    --file "${IMMACULATE_Q_TRAINING_BUNDLE_PATH}"
fi

if [[ ! -d "${IMMACULATE_REPO_ROOT}" ]]; then
  echo "Repo root does not exist: ${IMMACULATE_REPO_ROOT}" >&2
  exit 1
fi

print_banner

tar -xzf "${IMMACULATE_Q_TRAINING_BUNDLE_PATH}" -C "${IMMACULATE_REPO_ROOT}"

if [[ -z "${SESSION_REPO_PATH}" ]]; then
  echo "IMMACULATE_Q_HYBRID_SESSION_REPO_PATH is required." >&2
  exit 1
fi

SESSION_MANIFEST="${IMMACULATE_REPO_ROOT}/${SESSION_REPO_PATH}"
if [[ ! -f "${SESSION_MANIFEST}" ]]; then
  echo "Session manifest does not exist after bundle extraction: ${SESSION_MANIFEST}" >&2
  exit 1
fi

CONFIG_PATH="$("${IMMACULATE_Q_TRAINING_PYTHON}" - <<'PY' "${SESSION_MANIFEST}" "${IMMACULATE_REPO_ROOT}"
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1]).resolve()
repo_root = Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
config_path = Path(manifest.get("q", {}).get("configPath", "")).expanduser()
if not config_path.is_absolute():
    config_path = (repo_root / config_path).resolve()
print(config_path)
PY
)"

TRAIN_ARGS=(
  "${IMMACULATE_Q_TRAINING_PYTHON}"
  "${IMMACULATE_REPO_ROOT}/training/q/train_q_lora_unsloth.py"
  "--config" "${CONFIG_PATH}"
  "--session-manifest" "${SESSION_MANIFEST}"
)

if [[ "${IMMACULATE_Q_TRAINING_DRY_RUN}" == "true" ]]; then
  TRAIN_ARGS+=(--dry-run)
fi

exec "${TRAIN_ARGS[@]}"
