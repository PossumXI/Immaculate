#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_ROOT}/../.." && pwd)"
DOCKERFILE_PATH="${DEPLOY_ROOT}/Dockerfile"
IMAGE_NAME="${IMMACULATE_IMAGE_NAME:-immaculate/harness:oci-private}"
DRY_RUN=false

while (($# > 0)); do
  case "$1" in
    --repo-root)
      REPO_ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    --image-name)
      IMAGE_NAME="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "${DOCKERFILE_PATH}" ]]; then
  echo "Missing Dockerfile at ${DOCKERFILE_PATH}" >&2
  exit 1
fi

if [[ ! -f "${REPO_ROOT}/package.json" ]]; then
  echo "Repo root does not look valid: ${REPO_ROOT}" >&2
  exit 1
fi

CMD=(
  podman build
  --pull=newer
  --tag "${IMAGE_NAME}"
  --file "${DOCKERFILE_PATH}"
  "${REPO_ROOT}"
)

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '%s\n' "${CMD[*]}"
  exit 0
fi

exec "${CMD[@]}"
