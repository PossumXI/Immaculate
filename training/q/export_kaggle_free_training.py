import argparse
import json
import os
import re
import shutil
import site
import subprocess
import sysconfig
import textwrap
from datetime import datetime, timezone
from pathlib import Path


ENV_LINE_PATTERN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_latest_session_path(root: Path) -> Path | None:
    candidate = root / ".training-output" / "q" / "latest-hybrid-session.json"
    return candidate if candidate.exists() else None


def rebase_repo_owned_path(root: Path, candidate: Path) -> Path:
    resolved = candidate.expanduser().resolve(strict=False)
    try:
        resolved.relative_to(root.resolve())
        return resolved
    except ValueError:
        pass
    repo_markers = (".training-output", "training", "docs", "deploy", "benchmarks")
    parts = list(resolved.parts)
    for marker in repo_markers:
        if marker not in parts:
            continue
        marker_index = parts.index(marker)
        return (root / Path(*parts[marker_index:])).resolve(strict=False)
    return resolved


def resolve_repo_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    candidate = Path(path_value).expanduser()
    if candidate.is_absolute():
        return rebase_repo_owned_path(repo_root(), candidate)
    return (repo_root() / candidate).resolve(strict=False)


def relative_path(root: Path, path_value: Path | None) -> str | None:
    if path_value is None:
        return None
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def save_json(path_value: Path, payload: dict) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def save_markdown(path_value: Path, content: str) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(content, encoding="utf-8")


def strip_optional_quotes(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        return text[1:-1]
    return text


def load_env_file(path_value: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path_value.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = ENV_LINE_PATTERN.match(raw_line)
        if not match:
            continue
        values[match.group(1).strip()] = strip_optional_quotes(match.group(2).strip())
    return values


def merge_env(env_files: list[Path]) -> dict[str, str]:
    merged = dict(os.environ)
    for env_file in env_files:
        if env_file.exists():
            merged.update(load_env_file(env_file))
    return merged


def git_value(root: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=str(root), check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def infer_repo_slug(root: Path) -> str:
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=str(root),
        check=False,
        capture_output=True,
        text=True,
    )
    remote_url = result.stdout.strip()
    match = re.search(r"[:/]([^/:]+/[^/]+?)(?:\.git)?$", remote_url)
    return match.group(1) if match else "PossumXI/Immaculate"


def detect_kaggle_cli() -> str | None:
    direct = shutil.which("kaggle") or shutil.which("kaggle.exe")
    if direct:
        return direct
    search_dirs = [
        Path(site.getuserbase()) / "Scripts",
        Path(sysconfig.get_path("scripts")),
    ]
    for directory in search_dirs:
        for candidate in (directory / "kaggle.exe", directory / "kaggle"):
            if candidate.exists():
                return str(candidate)
    appdata_local = os.environ.get("LOCALAPPDATA", "").strip()
    if appdata_local:
        for candidate in Path(appdata_local).glob(
            "Packages/PythonSoftwareFoundation.Python.*/LocalCache/local-packages/Python*/Scripts/kaggle.exe"
        ):
            if candidate.exists():
                return str(candidate)
    return None


def markdown_cell(source: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": source.splitlines(keepends=True)}


def code_cell(source: str) -> dict:
    return {
        "cell_type": "code",
        "metadata": {},
        "execution_count": None,
        "outputs": [],
        "source": source.splitlines(keepends=True),
    }


def build_notebook(report: dict) -> dict:
    bundle = report.get("bundle", {})
    session = report.get("session", {})
    micro = report.get("microTrain", {})
    cells = [
        markdown_cell(
            textwrap.dedent(
                f"""
                # Q Kaggle Free Training

                This notebook is bound to the tracked Q + Immaculate session `{report["sessionId"]}`.

                It does three concrete things:
                - clones the exact repo commit behind the current release surface
                - pulls the staged cloud bundle from Hugging Face when a token is present
                - runs the bounded Q micro-train plus the Immaculate bundle rebuild if the Kaggle GPU is large enough

                Truth boundary:
                - this is a supplemental Kaggle notebook lane, not the primary cloud trainer
                - it does not claim a Kaggle launch happened unless a separate operator actually starts the notebook
                - if GPU memory is too small, the notebook should stop at doctor plus bundle replay
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                f"""
                SESSION_ID = "{report["sessionId"]}"
                REPO_URL = "https://github.com/{report["repo"]["slug"]}.git"
                REPO_COMMIT = "{report["release"]["gitSha"]}"
                HF_DATASET_REPO = "{bundle.get("repoId", "")}"
                HF_ARCHIVE_PATH = "{bundle.get("archiveRepoPath", "")}"
                HF_MANIFEST_PATH = "{bundle.get("manifestRepoPath", "")}"
                SESSION_MANIFEST_RELATIVE = "{session.get("manifestPath", "")}"
                Q_CONFIG_RELATIVE = "{session.get("configPath", "")}"
                IMMACULATE_BUNDLE_OUTPUT = "{session.get("immaculateBundleOutputPath", "")}"
                MICRO_CONFIG_RELATIVE = "{micro.get("configPath", "")}"
                MICRO_MAX_STEPS = {micro.get("maxSteps", 40)}
                MICRO_MAX_SEQ_LENGTH = {micro.get("maxSeqLength", 4096)}
                MIN_GPU_MEMORY_GB = {micro.get("minGpuMemoryGb", 15)}
                RUN_MICRO_TRAIN = True
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                import os
                import shutil
                import subprocess
                import sys
                import tarfile
                from pathlib import Path

                def run(command, cwd=None, env=None):
                    print("$", " ".join(command))
                    return subprocess.run(command, cwd=cwd, env=env, check=True)

                def safe_extract(archive_path: Path, target_dir: Path):
                    target_dir = target_dir.resolve()
                    with tarfile.open(archive_path, "r:gz") as handle:
                        for member in handle.getmembers():
                            candidate = (target_dir / member.name).resolve()
                            if not str(candidate).startswith(str(target_dir)):
                                raise ValueError(f"Unsafe tar entry: {member.name}")
                        handle.extractall(target_dir)

                WORKSPACE = Path("/kaggle/working/immaculate-kaggle")
                REPO_ROOT = WORKSPACE / "repo"
                WORKSPACE.mkdir(parents=True, exist_ok=True)

                if REPO_ROOT.exists():
                    shutil.rmtree(REPO_ROOT)

                run(["git", "clone", REPO_URL, str(REPO_ROOT)])
                run(["git", "checkout", REPO_COMMIT], cwd=str(REPO_ROOT))
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                run([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])
                run(
                    [
                        sys.executable,
                        "-m",
                        "pip",
                        "install",
                        "huggingface_hub",
                        "datasets",
                        "transformers",
                        "trl",
                        "accelerate",
                        "peft",
                        "bitsandbytes",
                        "wandb",
                        "unsloth",
                    ]
                )
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()
                if not HF_TOKEN:
                    raise ValueError("HF_TOKEN is required to pull the staged Q cloud bundle in Kaggle.")

                WANDB_API_KEY = os.environ.get("WANDB_API_KEY", "").strip()
                WANDB_ENTITY = os.environ.get("WANDB_ENTITY", "").strip()
                WANDB_PROJECT = os.environ.get("WANDB_PROJECT", "").strip()
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                if HF_DATASET_REPO and HF_ARCHIVE_PATH and HF_MANIFEST_PATH:
                    from huggingface_hub import hf_hub_download

                    archive_path = Path(
                        hf_hub_download(
                            repo_id=HF_DATASET_REPO,
                            filename=HF_ARCHIVE_PATH,
                            repo_type="dataset",
                            token=HF_TOKEN,
                        )
                    )
                    manifest_path = Path(
                        hf_hub_download(
                            repo_id=HF_DATASET_REPO,
                            filename=HF_MANIFEST_PATH,
                            repo_type="dataset",
                            token=HF_TOKEN,
                        )
                    )
                    safe_extract(archive_path, REPO_ROOT)
                    print("Archive:", archive_path)
                    print("Manifest:", manifest_path)
                else:
                    print("No staged HF bundle recorded; proceeding with repo-only session files.")
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                run(
                    [
                        sys.executable,
                        "training/q/run_q_training_session.py",
                        "--doctor",
                        "--session",
                        SESSION_MANIFEST_RELATIVE,
                    ],
                    cwd=str(REPO_ROOT),
                )

                run(
                    [
                        sys.executable,
                        "training/immaculate/build_immaculate_training_bundle.py",
                        "--output",
                        IMMACULATE_BUNDLE_OUTPUT,
                    ],
                    cwd=str(REPO_ROOT),
                )
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                from pathlib import Path

                kaggle_output_root = Path("/kaggle/working/immaculate-q-runs") / SESSION_ID
                kaggle_output_root.mkdir(parents=True, exist_ok=True)
                micro_output_dir = kaggle_output_root / "q-kaggle-free"

                run(
                    [
                        sys.executable,
                        "training/q/build_q_colab_micro_config.py",
                        "--config",
                        Q_CONFIG_RELATIVE,
                        "--output",
                        MICRO_CONFIG_RELATIVE,
                        "--max-steps",
                        str(MICRO_MAX_STEPS),
                        "--max-seq-length",
                        str(MICRO_MAX_SEQ_LENGTH),
                        "--gradient-accumulation-steps",
                        "8",
                        "--output-dir",
                        str(micro_output_dir),
                    ] + (["--disable-wandb"] if not WANDB_API_KEY else []),
                    cwd=str(REPO_ROOT),
                )
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                import torch

                gpu_visible = torch.cuda.is_available()
                total_gpu_memory_gb = 0.0
                if gpu_visible:
                    props = torch.cuda.get_device_properties(0)
                    total_gpu_memory_gb = props.total_memory / (1024 ** 3)

                print({"gpu_visible": gpu_visible, "total_gpu_memory_gb": round(total_gpu_memory_gb, 2)})

                if RUN_MICRO_TRAIN and gpu_visible and total_gpu_memory_gb >= MIN_GPU_MEMORY_GB:
                    env = dict(os.environ)
                    if WANDB_API_KEY:
                        env["WANDB_API_KEY"] = WANDB_API_KEY
                    if WANDB_ENTITY:
                        env["WANDB_ENTITY"] = WANDB_ENTITY
                    if WANDB_PROJECT:
                        env["WANDB_PROJECT"] = WANDB_PROJECT
                    run(
                        [
                            sys.executable,
                            "training/q/train_q_lora_unsloth.py",
                            "--config",
                            MICRO_CONFIG_RELATIVE,
                        ],
                        cwd=str(REPO_ROOT),
                        env=env,
                    )
                else:
                    print("Skipping micro-train because the available Kaggle GPU is too small or not visible.")
                """
            ).strip()
        ),
    ]

    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python", "version": "3.12"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def render_markdown(report: dict) -> str:
    auth = report.get("auth", {})
    bundle = report.get("bundle", {})
    notebook = report.get("notebook", {})
    summary = report.get("summary", {})
    return "\n".join(
        [
            "# Kaggle Free Training",
            "",
            "This page records the Kaggle notebook lane for Q + Immaculate. It is a supplemental export path, not a fake launch claim.",
            "",
            f"- Generated: `{report.get('generatedAt', 'n/a')}`",
            f"- Release: `{report.get('release', {}).get('buildId', 'n/a')}`",
            f"- Session id: `{report.get('sessionId', 'n/a')}`",
            f"- Status: `{summary.get('status', 'unknown')}`",
            f"- Notebook path: `{notebook.get('path', 'n/a')}`",
            f"- Kernel metadata path: `{notebook.get('metadataPath', 'n/a')}`",
            "",
            "## Readiness",
            "",
            f"- Notebook exported: `{notebook.get('exported')}`",
            f"- Kaggle CLI ready: `{auth.get('cliReady')}`",
            f"- Kaggle auth ready: `{auth.get('authReady')}`",
            f"- Push-ready metadata: `{notebook.get('pushReady')}`",
            f"- Recommended next step: {summary.get('recommendedNextStep') or 'n/a'}",
            "",
            "## Auth And Tooling",
            "",
            f"- CLI bin: `{auth.get('cliBin', 'n/a')}`",
            f"- Username source: `{auth.get('usernameSource', 'n/a')}`",
            f"- Username present: `{auth.get('usernameReady')}`",
            f"- API key present: `{auth.get('apiKeyReady')}`",
            f"- kaggle.json path: `{auth.get('configPath', 'n/a')}`",
            "",
            "## Session Inputs",
            "",
            f"- Training bundle: `{bundle.get('trainingBundleId', 'n/a')}`",
            f"- HF staged repo: `{bundle.get('repoId', 'n/a')}`",
            f"- HF archive path: `{bundle.get('archiveRepoPath', 'n/a')}`",
            f"- HF manifest path: `{bundle.get('manifestRepoPath', 'n/a')}`",
            "",
            "## Truth Boundary",
            "",
            "- This lane exports a Kaggle-ready notebook and readiness receipt only.",
            "- It does not claim a real Kaggle notebook run happened unless a separate launch/result surface says so explicitly.",
            "- HF_TOKEN is still required inside Kaggle to pull the staged Q cloud bundle.",
        ]
    ) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Export a Kaggle-ready Q free-training notebook and readiness surface.")
    parser.add_argument("session_path", nargs="?", help="Optional positional session manifest path for npm wrapper compatibility.")
    parser.add_argument("env_paths", nargs="*", help="Optional positional env file paths for npm wrapper compatibility.")
    parser.add_argument(
        "--session",
        default=None,
        help="Path to a hybrid-session manifest or latest-hybrid-session summary JSON.",
    )
    parser.add_argument(
        "--env-file",
        action="append",
        default=[],
        help="Optional env file(s) with Kaggle credentials.",
    )
    args = parser.parse_args()

    session_arg = args.session or args.session_path
    session_path = resolve_repo_path(session_arg) if session_arg else default_latest_session_path(root)
    if session_path is None or not session_path.exists():
        raise FileNotFoundError("A hybrid session manifest or latest-hybrid-session summary is required.")

    session_payload = load_json(session_path)
    manifest_path = resolve_repo_path(session_payload.get("manifestPath")) if session_path.name == "latest-hybrid-session.json" else session_path
    if manifest_path is None or not manifest_path.exists():
        raise FileNotFoundError("Could not resolve the concrete hybrid-session manifest.")
    manifest = load_json(manifest_path)

    latest_lock = load_json(root / ".training-output" / "q" / "latest-training-lock.json")
    hf_jobs_report = load_json(root / "docs" / "wiki" / "HF-Jobs-Training.json")

    env_files = [resolve_repo_path(path_value) for path_value in [*args.env_file, *args.env_paths]]
    env_files = [path for path in env_files if path is not None]
    merged_env = merge_env(env_files)

    kaggle_username = str(merged_env.get("KAGGLE_USERNAME", "")).strip()
    kaggle_key = str(merged_env.get("KAGGLE_KEY", "")).strip()
    kaggle_config_path = Path(merged_env.get("KAGGLE_CONFIG_DIR", "")).expanduser() if merged_env.get("KAGGLE_CONFIG_DIR") else (Path.home() / ".kaggle")
    kaggle_json_path = kaggle_config_path / "kaggle.json"
    if not kaggle_username and kaggle_json_path.exists():
        try:
            kaggle_payload = load_json(kaggle_json_path)
            kaggle_username = str(kaggle_payload.get("username", "")).strip()
            kaggle_key = kaggle_key or str(kaggle_payload.get("key", "")).strip()
        except Exception:
            pass

    session_id = str(manifest.get("sessionId", "q-kaggle-session")).strip() or "q-kaggle-session"
    slug = re.sub(r"[^a-z0-9-]+", "-", session_id.lower()).strip("-") or "q-kaggle-free-training"
    notebook_dir = root / "deploy" / "kaggle" / "notebooks"
    notebook_path = notebook_dir / f"{slug}.ipynb"
    metadata_path = notebook_dir / f"{slug}-kernel-metadata.json"
    cli_bin = detect_kaggle_cli()

    notebook_report = {
        "path": relative_path(root, notebook_path),
        "metadataPath": None,
        "exported": True,
        "pushReady": False,
    }

    report = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "release": {
            "packageVersion": load_json(root / "package.json").get("version", "0.0.0"),
            "gitSha": git_value(root, "rev-parse", "HEAD"),
            "gitShortSha": git_value(root, "rev-parse", "--short=7", "HEAD"),
            "buildId": f"{load_json(root / 'package.json').get('version', '0.0.0')}+{git_value(root, 'rev-parse', '--short=7', 'HEAD')}",
        },
        "sessionId": session_id,
        "sessionPath": relative_path(root, manifest_path),
        "repo": {
            "slug": infer_repo_slug(root),
        },
        "bundle": {
            "trainingBundleId": latest_lock.get("bundleId"),
            "repoId": (((hf_jobs_report.get("stagedBundle") or {}).get("repoId"))),
            "archiveRepoPath": (((hf_jobs_report.get("stagedBundle") or {}).get("archiveRepoPath"))),
            "manifestRepoPath": (((hf_jobs_report.get("stagedBundle") or {}).get("manifestRepoPath"))),
        },
        "session": {
            "manifestPath": relative_path(root, manifest_path),
            "configPath": str((manifest.get("q") or {}).get("configPath") or ""),
            "immaculateBundleOutputPath": str((manifest.get("immaculate") or {}).get("bundleOutputPath") or ""),
        },
        "microTrain": {
            "configPath": f".training-output/q/{slug}-micro-config.json",
            "maxSteps": 40,
            "maxSeqLength": 4096,
            "minGpuMemoryGb": 15,
        },
        "auth": {
            "cliBin": cli_bin,
            "cliReady": bool(cli_bin),
            "usernameReady": bool(kaggle_username),
            "apiKeyReady": bool(kaggle_key),
            "authReady": bool(kaggle_username and kaggle_key),
            "usernameSource": "env-or-config" if kaggle_username else "missing",
            "configPath": str(kaggle_json_path) if kaggle_json_path.exists() else None,
        },
        "notebook": notebook_report,
        "output": {
            "wikiJsonPath": "docs/wiki/Kaggle-Free-Training.json",
            "wikiMarkdownPath": "docs/wiki/Kaggle-Free-Training.md",
        },
    }

    notebook_payload = build_notebook(report)
    notebook_dir.mkdir(parents=True, exist_ok=True)
    notebook_path.write_text(json.dumps(notebook_payload, indent=2) + "\n", encoding="utf-8")

    if kaggle_username:
        metadata_payload = {
            "id": f"{kaggle_username}/{slug}",
            "title": f"Q Kaggle Free Training - {session_id}",
            "code_file": notebook_path.name,
            "language": "python",
            "kernel_type": "notebook",
            "is_private": "true",
            "enable_gpu": "true",
            "enable_internet": "true",
            "dataset_sources": [],
            "competition_sources": [],
            "kernel_sources": [],
        }
        metadata_path.write_text(json.dumps(metadata_payload, indent=2) + "\n", encoding="utf-8")
        report["notebook"]["metadataPath"] = relative_path(root, metadata_path)
        report["notebook"]["pushReady"] = bool(cli_bin and kaggle_key)

    auth_ready = bool(report["auth"]["authReady"])
    cli_ready = bool(report["auth"]["cliReady"])
    push_ready = bool(report["notebook"]["pushReady"])
    if push_ready:
        status = "ready"
        next_step = "Push the exported notebook with `kaggle kernels push -p deploy/kaggle/notebooks` and then start the Kaggle GPU run."
    elif cli_ready and auth_ready:
        status = "metadata-blocked"
        next_step = "Re-export after confirming the Kaggle username so push-ready metadata can be written."
    elif cli_ready:
        status = "auth-blocked"
        next_step = "Set KAGGLE_USERNAME and KAGGLE_KEY or add ~/.kaggle/kaggle.json, then rerun the Kaggle export."
    else:
        status = "cli-blocked"
        next_step = "Install the Kaggle CLI, add Kaggle auth, and rerun the export."
    report["summary"] = {
        "status": status,
        "recommendedNextStep": next_step,
    }

    wiki_json_path = root / report["output"]["wikiJsonPath"]
    wiki_md_path = root / report["output"]["wikiMarkdownPath"]
    save_json(wiki_json_path, report)
    save_markdown(wiki_md_path, render_markdown(report))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
