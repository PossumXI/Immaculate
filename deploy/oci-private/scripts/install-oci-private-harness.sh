#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_ROOT}/../.." && pwd)"
ENV_TARGET="/etc/immaculate/immaculate-harness.env"
UNIT_TARGET="/etc/systemd/system/immaculate-harness.service"
SERVICE_NAME="immaculate-harness"
ENABLE=false
SKIP_BUILD=false
DRY_RUN=false

run_cmd() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

configure_firewall() {
  if ! command -v firewall-cmd >/dev/null 2>&1; then
    return 0
  fi

  if [[ -z "${IMMACULATE_ALLOWED_OPERATOR_CIDR:-}" ]]; then
    return 0
  fi

  local port="${IMMACULATE_PUBLISHED_PORT:-8787}"
  local cidr="${IMMACULATE_ALLOWED_OPERATOR_CIDR}"
  run_cmd firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=${cidr} port port=${port} protocol=tcp accept"
  run_cmd firewall-cmd --permanent --add-rich-rule="rule family=ipv4 port port=${port} protocol=tcp drop"
  run_cmd firewall-cmd --reload
}

while (($# > 0)); do
  case "$1" in
    --repo-root)
      REPO_ROOT="$(cd "$2" && pwd)"
      shift 2
      ;;
    --enable)
      ENABLE=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
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

if [[ "${DRY_RUN}" != "true" && "${EUID}" -ne 0 ]]; then
  echo "Run as root or with sudo." >&2
  exit 1
fi

run_cmd mkdir -p /etc/immaculate/secrets /var/lib/immaculate/runtime /var/log/immaculate /opt/immaculate
run_cmd chmod 0700 /etc/immaculate/secrets

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '[dry-run] ensure system user immaculate (uid 10001)\n'
else
  id immaculate >/dev/null 2>&1 || useradd --system --uid 10001 --home-dir /var/lib/immaculate --shell /sbin/nologin immaculate
fi

run_cmd chown -R immaculate:immaculate /var/lib/immaculate /var/log/immaculate

if [[ ! -f "${ENV_TARGET}" ]]; then
  if [[ "${DRY_RUN}" == "true" ]]; then
    printf '[dry-run] create %s from example with IMMACULATE_REPO_ROOT=%s\n' "${ENV_TARGET}" "${REPO_ROOT}"
  else
    sed "s|^IMMACULATE_REPO_ROOT=.*$|IMMACULATE_REPO_ROOT=${REPO_ROOT}|" \
      "${DEPLOY_ROOT}/env/immaculate-harness.env.example" > "${ENV_TARGET}"
    chmod 0600 "${ENV_TARGET}"
  fi
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '[dry-run] write %s from unit template\n' "${UNIT_TARGET}"
else
  sed "s|__REPO_ROOT__|${REPO_ROOT}|g" \
    "${DEPLOY_ROOT}/systemd/immaculate-harness.service" > "${UNIT_TARGET}"
  chmod 0644 "${UNIT_TARGET}"
fi

if [[ -f "${ENV_TARGET}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_TARGET}"
  set +a
fi

configure_firewall

run_cmd systemctl daemon-reload

if [[ "${SKIP_BUILD}" != "true" ]]; then
  run_cmd bash "${DEPLOY_ROOT}/scripts/build-immaculate-harness-image.sh" --repo-root "${REPO_ROOT}"
fi

if [[ "${ENABLE}" == "true" ]]; then
  run_cmd systemctl enable --now "${SERVICE_NAME}"
else
  run_cmd systemctl enable "${SERVICE_NAME}"
fi

cat <<EOF
OCI private deployment bundle installed.

Next steps:
  1. Review ${ENV_TARGET}
  2. Place API and federation secrets under /etc/immaculate/secrets or map OCI Vault OCIDs
  3. Start the service with: sudo systemctl start ${SERVICE_NAME}
  4. Verify from a private client with: curl http://${IMMACULATE_PRIVATE_BIND_IP:-10.0.1.10}:${IMMACULATE_PUBLISHED_PORT:-8787}/api/health
EOF
