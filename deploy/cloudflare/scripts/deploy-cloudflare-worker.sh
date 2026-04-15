#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$DEPLOY_ROOT/../.." && pwd)"
WORKER_DIR="$DEPLOY_ROOT/worker"
WRANGLER_CONFIG="$DEPLOY_ROOT/wrangler.toml"

MODE="deploy"
ENV_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      MODE="check"
      shift
      ;;
    --env-file)
      ENV_FILES+=("$2")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

load_env_file() {
  local env_file="$1"
  if [[ ! -f "$env_file" ]]; then
    echo "Missing env file: $env_file" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
}

for env_file in "${ENV_FILES[@]}"; do
  load_env_file "$env_file"
done

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "CLOUDFLARE_ACCOUNT_ID is required." >&2
  exit 1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required." >&2
  exit 1
fi

export CLOUDFLARE_ACCOUNT_ID
export CLOUDFLARE_API_TOKEN

npm --prefix "$WORKER_DIR" run typecheck

if [[ "$MODE" == "check" ]]; then
  npm exec --prefix "$WORKER_DIR" wrangler deploy --config "$WRANGLER_CONFIG" --dry-run
else
  npm exec --prefix "$WORKER_DIR" wrangler deploy --config "$WRANGLER_CONFIG"
fi
