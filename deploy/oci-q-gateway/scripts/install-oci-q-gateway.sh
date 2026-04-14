#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${DEPLOY_ROOT}/../.." && pwd)"
ENV_TARGET="/etc/immaculate/immaculate-q-gateway.env"
UNIT_TARGET="/etc/systemd/system/immaculate-q-gateway.service"
SERVICE_NAME="immaculate-q-gateway"
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

  if [[ -z "${IMMACULATE_Q_GATEWAY_ALLOWED_CLIENT_CIDR:-}" ]]; then
    return 0
  fi

  local port="${IMMACULATE_Q_GATEWAY_PUBLISHED_PORT:-8788}"
  local cidr="${IMMACULATE_Q_GATEWAY_ALLOWED_CLIENT_CIDR}"
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

run_cmd mkdir -p /etc/immaculate /var/lib/immaculate/runtime /var/log/immaculate/q-gateway /opt/immaculate

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
      "${DEPLOY_ROOT}/env/immaculate-q-gateway.env.example" > "${ENV_TARGET}"
    chmod 0600 "${ENV_TARGET}"
  fi
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  printf '[dry-run] write %s from unit template\n' "${UNIT_TARGET}"
else
  sed "s|__REPO_ROOT__|${REPO_ROOT}|g" \
    "${DEPLOY_ROOT}/systemd/immaculate-q-gateway.service" > "${UNIT_TARGET}"
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
  run_cmd bash "${DEPLOY_ROOT}/scripts/build-immaculate-q-gateway-image.sh" --repo-root "${REPO_ROOT}"
fi

if [[ "${ENABLE}" == "true" ]]; then
  run_cmd systemctl enable --now "${SERVICE_NAME}"
else
  run_cmd systemctl enable "${SERVICE_NAME}"
fi

cat <<EOF
OCI private Q gateway bundle installed.

Next steps:
  1. Review ${ENV_TARGET}
  2. Point IMMACULATE_OLLAMA_URL at the private Ollama host reachable from the gateway node
  3. Create at least one Q API key with: npm run q:keys -- create --label oci-client
  4. Start the service with: sudo systemctl start ${SERVICE_NAME}
  5. Verify from a private client with: curl http://${IMMACULATE_Q_GATEWAY_PRIVATE_BIND_IP:-10.0.3.10}:${IMMACULATE_Q_GATEWAY_PUBLISHED_PORT:-8788}/health
EOF
