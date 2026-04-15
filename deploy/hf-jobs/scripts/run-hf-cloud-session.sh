#!/usr/bin/env bash

set -euo pipefail
umask 077

validate_bundle_archive() {
  local archive_path="$1"
  local entry=""
  while IFS= read -r entry; do
    [[ -z "${entry}" ]] && continue
    if [[ "${entry}" == /* || "${entry}" == *"\\"* ]]; then
      echo "Unsafe bundle entry path: ${entry}" >&2
      exit 1
    fi
    if [[ "${entry}" == ".." || "${entry}" == ../* || "${entry}" == *"/../"* || "${entry}" == *"/.." ]]; then
      echo "Bundle entry escapes repo root: ${entry}" >&2
      exit 1
    fi
    case "${entry}" in
      bundle-manifest.json|.training-output/*|docs/*|training/*)
        ;;
      *)
        echo "Bundle entry is outside the allowed repo surface: ${entry}" >&2
        exit 1
        ;;
    esac
  done < <(tar -tzf "${archive_path}")
}

resolve_path_from_repo() {
  local repo_root="$1"
  local raw_path="$2"
  python3 - <<'PY' "${repo_root}" "${raw_path}"
import sys
from pathlib import Path

repo_root = Path(sys.argv[1]).resolve()
raw_path = Path(sys.argv[2]).expanduser()
if raw_path.is_absolute():
    print(raw_path.resolve())
else:
    print((repo_root / raw_path).resolve())
PY
}

REPO_ROOT="${IMMACULATE_REPO_ROOT:-$(pwd)}"
SESSION_REPO_PATH="${IMMACULATE_Q_HYBRID_SESSION_REPO_PATH:-${IMMACULATE_SESSION_MANIFEST_REPO_PATH:-}}"
JOB_MODE="${HF_JOB_MODE:-dry-run}"
PYTHON_BIN="${IMMACULATE_Q_TRAINING_PYTHON:-python3}"
BUNDLE_MOUNT_ROOT="${HF_BUNDLE_MOUNT_ROOT:-/bundle}"
BUNDLE_REPO_PATH="${HF_BUNDLE_ARCHIVE_PATH:-}"
MANIFEST_REPO_PATH="${HF_BUNDLE_MANIFEST_REPO_PATH:-}"

if [[ -z "${SESSION_REPO_PATH}" ]]; then
  echo "IMMACULATE_Q_HYBRID_SESSION_REPO_PATH is required." >&2
  exit 1
fi

if [[ -z "${BUNDLE_REPO_PATH}" ]]; then
  echo "HF_BUNDLE_ARCHIVE_PATH is required." >&2
  exit 1
fi

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python interpreter not found: ${PYTHON_BIN}" >&2
  exit 1
fi

BUNDLE_ARCHIVE="${BUNDLE_REPO_PATH}"
if [[ "${BUNDLE_ARCHIVE}" != /* ]]; then
  BUNDLE_ARCHIVE="${BUNDLE_MOUNT_ROOT}/${BUNDLE_ARCHIVE}"
fi

if [[ ! -f "${BUNDLE_ARCHIVE}" ]]; then
  echo "Mounted HF bundle archive is missing: ${BUNDLE_ARCHIVE}" >&2
  exit 1
fi

validate_bundle_archive "${BUNDLE_ARCHIVE}"
tar -xzf "${BUNDLE_ARCHIVE}" -C "${REPO_ROOT}"

SESSION_MANIFEST="$(resolve_path_from_repo "${REPO_ROOT}" "${SESSION_REPO_PATH}")"
if [[ ! -f "${SESSION_MANIFEST}" ]]; then
  echo "Session manifest does not exist after bundle extraction: ${SESSION_MANIFEST}" >&2
  exit 1
fi

CONFIG_PATH="$("${PYTHON_BIN}" - <<'PY' "${SESSION_MANIFEST}" "${REPO_ROOT}"
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

IMMACULATE_BUNDLE_OUTPUT="$("${PYTHON_BIN}" - <<'PY' "${SESSION_MANIFEST}" "${REPO_ROOT}"
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1]).resolve()
repo_root = Path(sys.argv[2]).resolve()
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
bundle_path = Path(manifest.get("immaculate", {}).get("bundleOutputPath", "")).expanduser()
if not bundle_path.is_absolute():
    bundle_path = (repo_root / bundle_path).resolve()
print(bundle_path)
PY
)"

"${PYTHON_BIN}" "${REPO_ROOT}/training/immaculate/build_immaculate_training_bundle.py" --output "${IMMACULATE_BUNDLE_OUTPUT}"

TRAIN_ARGS=(
  "${PYTHON_BIN}"
  "${REPO_ROOT}/training/q/train_q_lora_unsloth.py"
  "--config" "${CONFIG_PATH}"
  "--session-manifest" "${SESSION_MANIFEST}"
)

if [[ "${JOB_MODE}" != "train" ]]; then
  TRAIN_ARGS+=(--dry-run)
fi

exec "${TRAIN_ARGS[@]}"
