#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
CHECK_ONLY=false
SESSION_MANIFEST="${IMMACULATE_Q_HYBRID_SESSION_PATH:-}"
ENV_FILES=()

while (($# > 0)); do
  case "$1" in
    --check)
      CHECK_ONLY=true
      shift
      ;;
    --session-manifest)
      SESSION_MANIFEST="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILES+=("$2")
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

normalize_path() {
  local raw_path="$1"
  if [[ -z "${raw_path}" ]]; then
    printf '%s' ""
    return 0
  fi
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "${raw_path}" 2>/dev/null || printf '%s' "${raw_path}"
    return 0
  fi
  printf '%s' "${raw_path}"
}

for env_file in "${ENV_FILES[@]}"; do
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "${env_file}"
    set +a
  fi
done

PYTHON_BIN="${IMMACULATE_Q_TRAINING_CONTROLLER_PYTHON:-}"
if [[ -z "${PYTHON_BIN}" ]]; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  else
    echo "A controller Python interpreter is required." >&2
    exit 1
  fi
fi
PYTHON_BIN="$(normalize_path "${PYTHON_BIN}")"
OCI_BIN="$(normalize_path "${OCI_CLI_BIN:-oci}")"
REPO_ROOT="$(normalize_path "${IMMACULATE_REPO_ROOT:-${REPO_ROOT_DEFAULT}}")"
BUNDLE_PATH="$(normalize_path "${IMMACULATE_Q_CLOUD_BUNDLE_PATH:-}")"
SESSION_REPO_PATH="${IMMACULATE_Q_HYBRID_SESSION_REPO_PATH:-}"
DISPLAY_NAME_PREFIX="${OCI_Q_TRAINING_DISPLAY_NAME_PREFIX:-immaculate-q-train}"
OCI_OBJECT_STORAGE_NAMESPACE="${OCI_OBJECT_STORAGE_NAMESPACE:-}"
OCI_OBJECT_STORAGE_BUCKET="${OCI_OBJECT_STORAGE_BUCKET:-}"
OCI_Q_TRAINING_BUNDLE_OBJECT="${OCI_Q_TRAINING_BUNDLE_OBJECT:-}"
GIT_REMOTE_URL_VALUE="${GIT_REMOTE_URL:-}"
if [[ -z "${GIT_REMOTE_URL_VALUE}" || "${GIT_REMOTE_URL_VALUE}" == "unknown" ]]; then
  GIT_REMOTE_URL_VALUE="https://github.com/PossumXI/Immaculate.git"
fi
SESSION_MANIFEST="$(normalize_path "${SESSION_MANIFEST}")"

require_value() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing required value: ${name}" >&2
    exit 1
  fi
}

if [[ -z "${SESSION_MANIFEST}" ]]; then
  echo "Session manifest is required." >&2
  exit 1
fi

if [[ ! -f "${SESSION_MANIFEST}" ]]; then
  echo "Session manifest not found: ${SESSION_MANIFEST}" >&2
  exit 1
fi

if [[ -z "${BUNDLE_PATH}" ]]; then
  BUNDLE_PATH="$("${PYTHON_BIN}" - <<'PY' "${SESSION_MANIFEST}" "${REPO_ROOT}"
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1]).resolve()
repo_root = Path(sys.argv[2]).resolve()
session = json.loads(manifest_path.read_text(encoding="utf-8"))
session_id = str(session.get("sessionId", "")).strip()
if not session_id:
    raise SystemExit("sessionId missing")
bundle_path = repo_root / ".training-output" / "q" / "sessions" / session_id / "cloud-bundle" / f"{session_id}-cloud-bundle.tar.gz"
print(bundle_path)
PY
)"
fi

if [[ ! -f "${BUNDLE_PATH}" ]]; then
  echo "Cloud bundle path is missing or unreadable: ${BUNDLE_PATH}" >&2
  exit 1
fi

if [[ "${CHECK_ONLY}" == "true" ]]; then
  cat <<EOF
session_manifest=${SESSION_MANIFEST}
bundle_path=${BUNDLE_PATH}
oci_bin=${OCI_BIN}
compartment=${OCI_COMPARTMENT_OCID:-}
subnet=${OCI_SUBNET_OCID:-}
availability_domain=${OCI_AVAILABILITY_DOMAIN:-}
image=${OCI_IMAGE_OCID:-}
shape=${OCI_SHAPE:-}
object_namespace=${OCI_OBJECT_STORAGE_NAMESPACE}
object_bucket=${OCI_OBJECT_STORAGE_BUCKET}
bundle_object=${OCI_Q_TRAINING_BUNDLE_OBJECT:-}
EOF
  exit 0
fi

require_value OCI_COMPARTMENT_OCID
require_value OCI_SUBNET_OCID
require_value OCI_AVAILABILITY_DOMAIN
require_value OCI_IMAGE_OCID
require_value OCI_SHAPE
require_value OCI_OBJECT_STORAGE_NAMESPACE
require_value OCI_OBJECT_STORAGE_BUCKET

if [[ -z "${OCI_Q_TRAINING_BUNDLE_OBJECT}" ]]; then
  bundle_name="$(basename "${BUNDLE_PATH}")"
  session_name="$(basename "$(dirname "${SESSION_MANIFEST}")")"
  OCI_Q_TRAINING_BUNDLE_OBJECT="q-training/${session_name}/${bundle_name}"
fi

if [[ ! -x "${OCI_BIN}" ]] && ! command -v "${OCI_BIN}" >/dev/null 2>&1; then
  echo "OCI CLI not found: ${OCI_BIN}" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
user_data_path="${tmp_dir}/user-data.yaml"
metadata_path="${tmp_dir}/metadata.json"
launch_result_path="${tmp_dir}/launch-result.json"

RENDER_CONTEXT_JSON="$("${PYTHON_BIN}" - <<'PY' "${SESSION_MANIFEST}" "${REPO_ROOT}" "${OCI_Q_TRAINING_BUNDLE_OBJECT}" "${DISPLAY_NAME_PREFIX}"
import json
import sys
from pathlib import Path

session_manifest = Path(sys.argv[1]).resolve()
repo_root = Path(sys.argv[2]).resolve()
bundle_object = sys.argv[3]
display_name_prefix = sys.argv[4]
session = json.loads(session_manifest.read_text(encoding="utf-8"))
session_id = str(session.get("sessionId", "q-training-session")).strip() or "q-training-session"
payload = {
    "session_id": session_id,
    "session_repo_path": str(session_manifest.relative_to(repo_root)).replace("\\", "/"),
    "bundle_object": bundle_object,
    "display_name": f"{display_name_prefix}-{session_id}",
}
print(json.dumps(payload))
PY
)"

SESSION_ID="$("${PYTHON_BIN}" - <<'PY' "${RENDER_CONTEXT_JSON}"
import json, sys
payload = json.loads(sys.argv[1])
print(payload["session_id"])
PY
)"
SESSION_REPO_PATH="$("${PYTHON_BIN}" - <<'PY' "${RENDER_CONTEXT_JSON}"
import json, sys
payload = json.loads(sys.argv[1])
print(payload["session_repo_path"])
PY
)"
DISPLAY_NAME="$("${PYTHON_BIN}" - <<'PY' "${RENDER_CONTEXT_JSON}"
import json, sys
payload = json.loads(sys.argv[1])
print(payload["display_name"])
PY
)"

export SESSION_REPO_PATH

"${OCI_BIN}" os object put \
  --namespace-name "${OCI_OBJECT_STORAGE_NAMESPACE}" \
  --bucket-name "${OCI_OBJECT_STORAGE_BUCKET}" \
  --name "${OCI_Q_TRAINING_BUNDLE_OBJECT}" \
  --file "${BUNDLE_PATH}" \
  --force >/dev/null

template_path="${REPO_ROOT}/deploy/oci-training/cloud-init/immaculate-q-training.cloud-init.yaml"
if [[ ! -f "${template_path}" ]]; then
  echo "Cloud-init template not found: ${template_path}" >&2
  exit 1
fi

sed \
  -e "s|__REPO_URL__|$(printf '%s' "${GIT_REMOTE_URL_VALUE}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__GIT_SHA__|$(printf '%s' "${IMMACULATE_RELEASE_GIT_SHA:-main}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__OBJECT_NAMESPACE__|$(printf '%s' "${OCI_OBJECT_STORAGE_NAMESPACE}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__OBJECT_BUCKET__|$(printf '%s' "${OCI_OBJECT_STORAGE_BUCKET}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__OBJECT_NAME__|$(printf '%s' "${OCI_Q_TRAINING_BUNDLE_OBJECT}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__SESSION_REPO_PATH__|$(printf '%s' "${SESSION_REPO_PATH}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__HF_SECRET_OCID__|$(printf '%s' "${OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID:-}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__WANDB_SECRET_OCID__|$(printf '%s' "${OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID:-}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__WANDB_ENTITY__|$(printf '%s' "${WANDB_ENTITY:-}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__WANDB_PROJECT__|$(printf '%s' "${WANDB_PROJECT:-immaculate}" | sed 's/[&|]/\\&/g')|g" \
  -e "s|__WANDB_MODE__|$(printf '%s' "${WANDB_MODE:-offline}" | sed 's/[&|]/\\&/g')|g" \
  "${template_path}" > "${user_data_path}"

"${PYTHON_BIN}" - <<'PY' "${user_data_path}" "${metadata_path}" "${OCI_SSH_AUTHORIZED_KEYS_FILE:-}"
import base64
import json
import sys
from pathlib import Path

user_data = Path(sys.argv[1]).read_bytes()
metadata_path = Path(sys.argv[2])
ssh_key_file = sys.argv[3].strip()
metadata = {
    "user_data": base64.b64encode(user_data).decode("ascii"),
}
if ssh_key_file:
    metadata["ssh_authorized_keys"] = Path(ssh_key_file).read_text(encoding="utf-8")
metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
PY

"${OCI_BIN}" compute instance launch \
  --compartment-id "${OCI_COMPARTMENT_OCID}" \
  --availability-domain "${OCI_AVAILABILITY_DOMAIN}" \
  --subnet-id "${OCI_SUBNET_OCID}" \
  --shape "${OCI_SHAPE}" \
  --image-id "${OCI_IMAGE_OCID}" \
  --display-name "${DISPLAY_NAME}" \
  --metadata "file://${metadata_path}" \
  --wait-for-state RUNNING > "${launch_result_path}"

cat "${launch_result_path}"
