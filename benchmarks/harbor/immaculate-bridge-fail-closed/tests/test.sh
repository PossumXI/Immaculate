#!/bin/bash
set -euo pipefail

export OLLAMA_API_BASE="${OLLAMA_API_BASE:-http://host.docker.internal:11434}"
tmp_tests_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_tests_dir"' EXIT

cp /tests/check.py "$tmp_tests_dir/check.py"

if [ "${IMMACULATE_HARBOR_ENABLE_LLM_JUDGE:-0}" = "1" ]; then
  cp /tests/judge.toml "$tmp_tests_dir/judge.toml"
fi

rewardkit "$tmp_tests_dir" --workspace /app --output /logs/verifier/reward.json
