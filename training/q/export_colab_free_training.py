import argparse
import json
import re
import subprocess
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


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


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def try_load_json(path_value: Path | None) -> dict | None:
    if path_value is None or not path_value.exists():
        return None
    try:
        return load_json(path_value)
    except Exception:
        return None


def save_json(path_value: Path, payload: dict) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def save_markdown(path_value: Path, content: str) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(content, encoding="utf-8")


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
    ssh_match = re.search(r"[:/]([^/:]+/[^/]+?)(?:\.git)?$", remote_url)
    return ssh_match.group(1) if ssh_match else "PossumXI/Immaculate"


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
    bundle = report["bundle"]
    micro = report["microTrain"]
    session = report["session"]
    cells = [
        markdown_cell(
            textwrap.dedent(
                f"""
                # Q Colab Free Training

                This notebook is bound to the tracked Q + Immaculate hybrid session `{report["sessionId"]}`.

                It does two real things:
                - rebuilds the Immaculate orchestration bundle from the same stamped session inputs
                - runs a bounded Q micro-train when Colab exposes enough GPU memory

                Truth boundary:
                - this does **not** replace the heavier HF Jobs or OCI lane
                - this is a free supplemental lane for session doctoring, bundle replay, and bounded Q updates
                - if the available Colab GPU is too small, the notebook stays truthful and stops at doctor plus dry-run
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                f"""
                SESSION_ID = "{report["sessionId"]}"
                REPO_SLUG = "{report["repo"]["slug"]}"
                REPO_URL = "https://github.com/{report["repo"]["slug"]}.git"
                REPO_COMMIT = "{report["release"]["gitSha"]}"
                HF_DATASET_REPO = "{bundle["repoId"]}"
                HF_ARCHIVE_PATH = "{bundle["archiveRepoPath"]}"
                HF_MANIFEST_PATH = "{bundle["manifestRepoPath"]}"
                SESSION_MANIFEST_RELATIVE = "{session["manifestPath"]}"
                Q_CONFIG_RELATIVE = "{session["configPath"]}"
                IMMACULATE_BUNDLE_OUTPUT = "{session["immaculateBundleOutputPath"]}"
                MICRO_CONFIG_RELATIVE = "{micro["configPath"]}"
                MICRO_MAX_STEPS = {micro["maxSteps"]}
                MICRO_MAX_SEQ_LENGTH = {micro["maxSeqLength"]}
                MIN_GPU_MEMORY_GB = {micro["minGpuMemoryGb"]}
                RUN_MICRO_TRAIN = True
                MOUNT_DRIVE = True
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
                from getpass import getpass
                from pathlib import Path

                def run(command, cwd=None, env=None):
                    print("$", " ".join(command))
                    completed = subprocess.run(command, cwd=cwd, env=env, check=True)
                    return completed.returncode

                def safe_extract(archive_path: Path, target_dir: Path):
                    target_dir = target_dir.resolve()
                    with tarfile.open(archive_path, "r:gz") as handle:
                        for member in handle.getmembers():
                            candidate = (target_dir / member.name).resolve()
                            if not str(candidate).startswith(str(target_dir)):
                                raise ValueError(f"Unsafe tar entry: {member.name}")
                        handle.extractall(target_dir)

                if "google.colab" in sys.modules and MOUNT_DRIVE:
                    from google.colab import drive
                    drive.mount("/content/drive")

                WORKSPACE = Path("/content/immaculate-colab")
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
                    HF_TOKEN = getpass("HF_TOKEN: ").strip()
                if not HF_TOKEN:
                    raise ValueError("HF_TOKEN is required to pull the staged cloud bundle.")

                WANDB_API_KEY = os.environ.get("WANDB_API_KEY", "").strip()
                WANDB_ENTITY = os.environ.get("WANDB_ENTITY", "").strip()
                WANDB_PROJECT = os.environ.get("WANDB_PROJECT", "").strip()
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
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
                colab_output_root = Path("/content/immaculate-colab-output") / SESSION_ID
                if Path("/content/drive").exists():
                    drive_output_root = Path("/content/drive/MyDrive/immaculate/q-runs") / SESSION_ID
                    drive_output_root.parent.mkdir(parents=True, exist_ok=True)
                    colab_output_root = drive_output_root
                colab_output_root.mkdir(parents=True, exist_ok=True)
                micro_output_dir = colab_output_root / "q-colab-free"

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

                run(
                    [
                        sys.executable,
                        "training/q/train_q_lora_unsloth.py",
                        "--config",
                        MICRO_CONFIG_RELATIVE,
                        "--session-manifest",
                        SESSION_MANIFEST_RELATIVE,
                        "--dry-run",
                    ],
                    cwd=str(REPO_ROOT),
                )
                """
            ).strip()
        ),
        code_cell(
            textwrap.dedent(
                """
                import torch

                gpu_ready = torch.cuda.is_available()
                gpu_name = torch.cuda.get_device_name(0) if gpu_ready else "cpu-only"
                gpu_memory_gb = (
                    round(torch.cuda.get_device_properties(0).total_memory / (1024 ** 3), 1)
                    if gpu_ready
                    else 0.0
                )
                print({"gpu_ready": gpu_ready, "gpu_name": gpu_name, "gpu_memory_gb": gpu_memory_gb})

                if RUN_MICRO_TRAIN and gpu_ready and gpu_memory_gb >= MIN_GPU_MEMORY_GB:
                    launch_env = dict(os.environ)
                    launch_env["HF_TOKEN"] = HF_TOKEN
                    if WANDB_API_KEY:
                        launch_env["WANDB_API_KEY"] = WANDB_API_KEY
                    if WANDB_ENTITY:
                        launch_env["WANDB_ENTITY"] = WANDB_ENTITY
                    if WANDB_PROJECT:
                        launch_env["WANDB_PROJECT"] = WANDB_PROJECT
                    run(
                        [
                            sys.executable,
                            "training/q/train_q_lora_unsloth.py",
                            "--config",
                            MICRO_CONFIG_RELATIVE,
                            "--session-manifest",
                            SESSION_MANIFEST_RELATIVE,
                        ],
                        cwd=str(REPO_ROOT),
                        env=launch_env,
                    )
                else:
                    print(
                        "Skipping bounded Q micro-train because the current Colab runtime is too small. "
                        "Doctor, bundle replay, and dry-run validation still completed."
                    )
                """
            ).strip()
        ),
    ]
    return {
        "cells": cells,
        "metadata": {
            "colab": {
                "name": report["notebook"]["fileName"],
                "provenance": [],
                "include_colab_link": True,
            },
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {
                "name": "python",
                "version": "3.12",
            },
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def render_markdown(report: dict) -> str:
    bundle = report["bundle"]
    micro = report["microTrain"]
    notebook = report["notebook"]
    return "\n".join(
        [
            "# Colab Free Training",
            "",
            "This page records the free supplemental Colab lane for the active Q and Immaculate hybrid session.",
            "",
            f"- Generated: `{report['generatedAt']}`",
            f"- Release: `{report['release']['buildId']}`",
            f"- Session id: `{report['sessionId']}`",
            f"- Notebook path: `{notebook['path']}`",
            f"- Open in Colab: `{notebook['openInColabUrl'] or 'n/a'}`",
            "",
            "## What This Lane Does",
            "",
            "- Replays the staged hybrid cloud bundle inside a Colab runtime.",
            "- Rebuilds the Immaculate orchestration bundle from the same session inputs.",
            "- Runs a bounded Q micro-train only when the Colab GPU has enough memory.",
            "- Stops at doctor plus dry-run when the free runtime is too small instead of overstating cloud readiness.",
            "",
            "## Bundle Source",
            "",
            f"- Source type: `{bundle['sourceType']}`",
            f"- Dataset repo: `{bundle['repoId']}`",
            f"- Archive path: `{bundle['archiveRepoPath']}`",
            f"- Manifest path: `{bundle['manifestRepoPath']}`",
            f"- Bundle staged: `{bundle['staged']}`",
            "",
            "## Micro-Train Defaults",
            "",
            f"- Derived config path: `{micro['configPath']}`",
            f"- Max steps: `{micro['maxSteps']}`",
            f"- Max sequence length: `{micro['maxSeqLength']}`",
            f"- Minimum GPU memory for train: `{micro['minGpuMemoryGb']} GB`",
            f"- W&B optional: `{micro['wandbOptional']}`",
            "",
            "## Truth Boundary",
            "",
            "- This free lane is a supplemental bounded-training path. It does not replace the heavier tracked HF Jobs or OCI lane.",
            "- The notebook only claims a real Q update when the runtime reaches the micro-train cell on a sufficiently large GPU.",
            "- On smaller free runtimes, it still contributes value through session doctoring, bundle replay, and Immaculate bundle regeneration.",
        ]
    ) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Export a Colab-ready free training notebook for the active hybrid Q session.")
    parser.add_argument("session_path", nargs="?", help="Optional positional session manifest path for npm wrapper compatibility.")
    parser.add_argument("--session", help="Path to the hybrid session manifest JSON.")
    parser.add_argument("--micro-max-steps", type=int, default=24, help="Bounded Q train steps for the Colab micro run.")
    parser.add_argument("--micro-max-seq-length", type=int, default=2048, help="Bounded max sequence length for the Colab micro run.")
    parser.add_argument("--min-gpu-memory-gb", type=int, default=20, help="Minimum GPU memory required before the notebook attempts a real Q train.")
    args = parser.parse_args()

    session_arg = args.session_path or args.session
    if not session_arg:
        raise ValueError("Session manifest path is required.")
    session_path = resolve_repo_path(session_arg)
    if session_path is None or not session_path.exists():
        raise FileNotFoundError(f"Session manifest not found: {session_arg}")
    session = load_json(session_path)
    session_id = str(session.get("sessionId", "")).strip() or "unknown-session"

    q_manifest = session.get("q", {}) if isinstance(session.get("q"), dict) else {}
    artifacts = session.get("artifacts", {}) if isinstance(session.get("artifacts"), dict) else {}
    session_root = resolve_repo_path(str(artifacts.get("sessionRoot", "")).strip()) or session_path.parent
    config_path = resolve_repo_path(str(q_manifest.get("configPath", "")).strip())
    training_lock_path = resolve_repo_path(str(q_manifest.get("trainingLockPath", "")).strip())
    immaculate_manifest = session.get("immaculate", {}) if isinstance(session.get("immaculate"), dict) else {}
    immaculate_bundle_output = resolve_repo_path(str(immaculate_manifest.get("bundleOutputPath", "")).strip()) or (
        root / ".training-output" / "immaculate" / f"immaculate-training-bundle-{session_id}.json"
    )

    if config_path is None or not config_path.exists():
        raise FileNotFoundError("Tracked Q config is missing for Colab export.")

    hf_jobs_report = try_load_json(root / "docs" / "wiki" / "HF-Jobs-Training.json") or {}
    staged_bundle = hf_jobs_report.get("stagedBundle", {}) if isinstance(hf_jobs_report.get("stagedBundle"), dict) else {}
    repo_id = str(staged_bundle.get("repoId", "")).strip()
    archive_repo_path = str(staged_bundle.get("archiveRepoPath", "")).strip()
    manifest_repo_path = str(staged_bundle.get("manifestRepoPath", "")).strip()
    if not repo_id or not archive_repo_path or not manifest_repo_path:
        raise ValueError("HF Jobs staged bundle is missing. Run the HF Jobs exporter before exporting the Colab notebook.")

    notebook_path = root / "deploy" / "colab" / "notebooks" / f"{session_id}-colab-free.ipynb"
    notebook_path.parent.mkdir(parents=True, exist_ok=True)
    report_json_path = root / "docs" / "wiki" / "Colab-Free-Training.json"
    report_markdown_path = root / "docs" / "wiki" / "Colab-Free-Training.md"
    session_report_path = session_root / "colab-free-export.json"
    micro_config_path = session_root / "colab" / "q-colab-micro-config.json"

    release = {
        "packageVersion": load_json(root / "package.json").get("version", "0.0.0"),
        "gitSha": git_value(root, "rev-parse", "HEAD"),
        "gitShortSha": git_value(root, "rev-parse", "--short=7", "HEAD"),
    }
    release["buildId"] = f"{release['packageVersion']}+{release['gitShortSha']}"
    repo_slug = infer_repo_slug(root)
    notebook_relative = relative_path(root, notebook_path)
    open_in_colab_url = f"https://colab.research.google.com/github/{repo_slug}/blob/main/{quote(notebook_relative)}"
    training_lock = try_load_json(training_lock_path)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "release": release,
        "repo": {
            "slug": repo_slug,
        },
        "sessionId": session_id,
        "session": {
            "manifestPath": relative_path(root, session_path),
            "configPath": relative_path(root, config_path),
            "trainingLockPath": relative_path(root, training_lock_path) if training_lock_path else None,
            "trainingBundleId": training_lock.get("bundleId") if isinstance(training_lock, dict) else None,
            "immaculateBundleOutputPath": relative_path(root, immaculate_bundle_output),
        },
        "bundle": {
            "sourceType": "hf_dataset",
            "repoId": repo_id,
            "archiveRepoPath": archive_repo_path,
            "manifestRepoPath": manifest_repo_path,
            "staged": bool(staged_bundle.get("staged")),
        },
        "microTrain": {
            "configPath": relative_path(root, micro_config_path),
            "maxSteps": args.micro_max_steps,
            "maxSeqLength": args.micro_max_seq_length,
            "minGpuMemoryGb": args.min_gpu_memory_gb,
            "wandbOptional": True,
        },
        "notebook": {
            "path": notebook_relative,
            "fileName": notebook_path.name,
            "openInColabUrl": open_in_colab_url,
        },
        "summary": {
            "provider": "colab_free",
            "ready": bool(staged_bundle.get("staged")),
            "recommendedNextStep": "Open the notebook in Colab, provide HF_TOKEN, and use the free runtime for doctor plus dry-run or a bounded Q micro-train when a large enough GPU appears.",
        },
        "output": {
            "sessionJsonPath": relative_path(root, session_report_path),
            "wikiJsonPath": relative_path(root, report_json_path),
            "wikiMarkdownPath": relative_path(root, report_markdown_path),
            "notebookPath": notebook_relative,
        },
    }

    notebook = build_notebook(report)
    notebook_path.write_text(json.dumps(notebook, indent=2) + "\n", encoding="utf-8")
    save_json(session_report_path, report)
    save_json(report_json_path, report)
    save_markdown(report_markdown_path, render_markdown(report))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
