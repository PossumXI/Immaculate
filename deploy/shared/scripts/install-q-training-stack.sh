#!/usr/bin/env bash

set -euo pipefail

PYTHON_BIN="${1:-python3}"
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python interpreter not found: ${PYTHON_BIN}" >&2
  exit 1
fi

PACKAGES=(
  huggingface_hub
  datasets
  transformers
  trl
  accelerate
  peft
  bitsandbytes
  wandb
  unsloth
)

"${PYTHON_BIN}" -m pip install --upgrade pip
"${PYTHON_BIN}" -m pip install "${PACKAGES[@]}"
