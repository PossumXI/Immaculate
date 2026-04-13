#!/usr/bin/env bash

set -euo pipefail

DEFAULT_ENV_FILE="/etc/immaculate/immaculate-harness.env"
CHECK_ONLY=false

while (($# > 0)); do
  case "$1" in
    --env-file)
      DEFAULT_ENV_FILE="$2"
      shift 2
      ;;
    --check)
      CHECK_ONLY=true
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

SECRET_DIR="${IMMACULATE_SECRET_DIR:-/etc/immaculate/secrets}"
OCI_BIN="${OCI_CLI_BIN:-oci}"
OCI_AUTH="${OCI_CLI_AUTH:-instance_principal}"

if [[ "${CHECK_ONLY}" != "true" ]]; then
  mkdir -p "${SECRET_DIR}"
  chmod 0700 "${SECRET_DIR}"
fi

fetch_secret() {
  local ocid="$1"
  local destination="$2"
  local label="$3"

  if [[ -z "${ocid}" ]]; then
    return 0
  fi

  if [[ "${CHECK_ONLY}" == "true" ]]; then
    printf '%s -> %s\n' "${label}" "${destination}"
    return 0
  fi

  local encoded
  encoded="$("${OCI_BIN}" secrets secret-bundle get \
    --auth "${OCI_AUTH}" \
    --secret-id "${ocid}" \
    --query 'data."secret-bundle-content".content' \
    --raw-output)"
  printf '%s' "${encoded}" | base64 --decode > "${destination}"
  chmod 0600 "${destination}"
}

if [[ "${CHECK_ONLY}" == "true" ]]; then
  printf 'secret-dir=%s\n' "${SECRET_DIR}"
fi

if [[ -n "${OCI_IMMACULATE_API_KEY_SECRET_OCID:-}" || -n "${OCI_IMMACULATE_FEDERATION_SECRET_OCID:-}" || -n "${OCI_WANDB_API_KEY_SECRET_OCID:-}" ]]; then
  if ! command -v "${OCI_BIN}" >/dev/null 2>&1; then
    echo "OCI CLI is required to fetch Vault secrets but was not found." >&2
    exit 1
  fi
fi

fetch_secret \
  "${OCI_IMMACULATE_API_KEY_SECRET_OCID:-}" \
  "${IMMACULATE_API_KEY_FILE:-${SECRET_DIR}/immaculate-api-key}" \
  "immaculate-api-key"
fetch_secret \
  "${OCI_IMMACULATE_FEDERATION_SECRET_OCID:-}" \
  "${IMMACULATE_FEDERATION_SHARED_SECRET_FILE:-${SECRET_DIR}/federation-shared-secret}" \
  "immaculate-federation-secret"
fetch_secret \
  "${OCI_WANDB_API_KEY_SECRET_OCID:-}" \
  "${WANDB_API_KEY_FILE:-${SECRET_DIR}/wandb-api-key}" \
  "wandb-api-key"
