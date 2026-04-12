#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv_path="${repo_root}/.tools/wandb-venv"
python_exe="${venv_path}/bin/python3"

if [[ ! -d "${venv_path}" ]]; then
  python3 -m venv "${venv_path}"
fi

"${python_exe}" -m pip install --upgrade pip
"${python_exe}" -m pip install wandb

echo "W&B bootstrap complete at ${venv_path}"
echo "Python: ${python_exe}"
