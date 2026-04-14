import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


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


def resolve_repo_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    candidate = Path(path_value).expanduser()
    if candidate.is_absolute():
        return candidate.resolve()
    return (repo_root() / candidate).resolve()


def git_value(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(root),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def count_jsonl_rows(path_value: Path) -> int:
    row_count = 0
    with path_value.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row_count += 1
    return row_count


def normalize_command(command_value: object) -> list[str]:
    if isinstance(command_value, list):
        return [str(entry) for entry in command_value if str(entry).strip()]
    if isinstance(command_value, str) and command_value.strip():
        return [command_value.strip()]
    return []


def python_module_available(python_executable: str, module_name: str) -> bool:
    result = subprocess.run(
        [python_executable, "-c", f"import {module_name}"],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def default_cloud_env(provider: str) -> list[str]:
    defaults = {
        "oci": ["HF_TOKEN"],
        "runpod": ["HF_TOKEN", "RUNPOD_API_KEY"],
        "vast": ["HF_TOKEN", "VAST_API_KEY"],
        "modal": ["HF_TOKEN", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
        "custom": ["HF_TOKEN"],
    }
    return defaults.get(provider, ["HF_TOKEN"])


def build_release_summary(root: Path) -> dict:
    package_version = load_json(root / "package.json").get("version", "0.0.0")
    git_sha = git_value(root, "rev-parse", "HEAD")
    git_short_sha = git_value(root, "rev-parse", "--short=7", "HEAD")
    return {
        "packageVersion": package_version,
        "gitSha": git_sha,
        "gitShortSha": git_short_sha,
        "buildId": f"{package_version}+{git_short_sha}",
    }


def render_markdown(summary: dict) -> str:
    q = summary["q"]
    immaculate = summary["immaculate"]
    local_lane = summary["lanes"]["local"]
    cloud_lane = summary["lanes"]["cloud"]
    doctor = summary["doctor"]
    lines = [
        "# Q Hybrid Training",
        "",
        "This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.",
        "",
        f"- Generated: `{summary['generatedAt']}`",
        f"- Release: `{summary['release']['buildId']}`",
        f"- Session id: `{summary['sessionId']}`",
        f"- Q training bundle: `{q['trainingBundleId']}`",
        f"- Base model: `{q['baseModel']}`",
        f"- Dataset rows: `{q['trainDatasetRowCount']}`",
        f"- Immaculate orchestration bundle: `{immaculate['bundleId']}`",
        "",
        "## Plain English Status",
        "",
        f"- Local lane: `{local_lane['status']}` in mode `{local_lane['mode']}`",
        f"- Cloud lane: `{cloud_lane['status']}` on provider `{cloud_lane['provider']}`",
        f"- Hugging Face token present: `{doctor['huggingFace']['ready']}`",
        f"- W&B publish env ready: `{doctor['wandb']['ready']}`",
        "",
        "## Q Fine-Tune Lane",
        "",
        f"- Training lock: `{q['trainingLockPath']}`",
        f"- Config: `{q['configPath']}`",
        f"- Dataset: `{q['trainDatasetPath']}`",
        f"- Mix manifest: `{q['mixManifestPath']}`",
        f"- Curation run: `{q['curationRunId']}`",
        f"- Failure corpus: `{q['failureCorpusPath']}`",
        f"- Local command: `{' '.join(local_lane['command']) if local_lane['command'] else 'n/a'}`",
        "",
        "## Immaculate Orchestration Lane",
        "",
        f"- Bundle path: `{immaculate['bundlePath']}`",
        f"- Signal count: `{immaculate['signalCount']}`",
        "- This lane improves Immaculate through benchmark and orchestration evidence, not by pretending Immaculate is a separate base model.",
        "",
        "## Cloud Doctor",
        "",
        f"- Provider: `{cloud_lane['provider']}`",
        f"- Launch command configured: `{doctor['cloud']['launchCommandConfigured']}`",
        f"- Cloud ready: `{doctor['cloud']['ready']}`",
        *[f"- Cloud note: {reason}" for reason in doctor["cloud"]["reasons"]],
        "",
        "## Truth Boundary",
        "",
        "- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.",
        "- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.",
        "- On this machine, missing cloud auth or tooling keeps the cloud lane explicit as `not-configured` instead of being papered over.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Doctor and coordinate a hybrid Q training session.")
    parser.add_argument("--session", required=True, help="Path to the hybrid training session manifest JSON.")
    parser.add_argument("--doctor", action="store_true", help="Validate and materialize the session summary without launching.")
    parser.add_argument("--launch", action="store_true", help="Launch the enabled session lanes after doctor checks.")
    args = parser.parse_args()

    manifest_path = resolve_repo_path(args.session)
    if manifest_path is None or not manifest_path.exists():
        raise ValueError("Session manifest path does not exist.")
    manifest = load_json(manifest_path)

    session_id = str(manifest.get("sessionId", "")).strip()
    if not session_id:
        raise ValueError("Session manifest requires sessionId.")

    q_manifest = manifest.get("q", {})
    if not isinstance(q_manifest, dict):
        raise ValueError("Session manifest q field must be an object.")
    training_lock_path = resolve_repo_path(str(q_manifest.get("trainingLockPath", "")).strip())
    if training_lock_path is None or not training_lock_path.exists():
        raise ValueError("Session manifest requires a valid q.trainingLockPath.")
    training_lock = load_json(training_lock_path)

    config_path = resolve_repo_path(str(q_manifest.get("configPath", "")).strip()) or resolve_repo_path(
        str(training_lock.get("run", {}).get("configPath", "")).strip()
    )
    if config_path is None or not config_path.exists():
        raise ValueError("Unable to resolve the concrete Q config path from the manifest or training lock.")
    config = load_json(config_path)

    mix_manifest_path = resolve_repo_path(str(q_manifest.get("mixManifestPath", "")).strip()) or resolve_repo_path(
        str(training_lock.get("mixManifest", {}).get("path", "")).strip()
    )
    if mix_manifest_path is None or not mix_manifest_path.exists():
        raise ValueError("Unable to resolve the concrete Q mix manifest path from the manifest or training lock.")

    curation_run_path = resolve_repo_path(str(q_manifest.get("curationRunPath", "")).strip()) or resolve_repo_path(
        str(training_lock.get("curation", {}).get("runPath", "")).strip()
    )
    if curation_run_path is None or not curation_run_path.exists():
        raise ValueError("Unable to resolve the concrete curation run path from the manifest or training lock.")

    dataset_path = resolve_repo_path(str(config.get("train_dataset_path", "")).strip())
    if dataset_path is None or not dataset_path.exists():
        raise ValueError("The resolved train_dataset_path does not exist.")

    locked_dataset_path = Path(training_lock.get("run", {}).get("trainDatasetPath", "")).resolve()
    if str(dataset_path.resolve()) != str(locked_dataset_path):
        raise ValueError("Session config and training lock disagree on the dataset path.")
    if str(config.get("base_model")) != str(training_lock.get("run", {}).get("baseModel")):
        raise ValueError("Session config and training lock disagree on the base model.")

    failure_corpus_path = resolve_repo_path(str(q_manifest.get("failureCorpusPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Failure-Corpus.json"
    )

    artifacts = manifest.get("artifacts", {})
    if not isinstance(artifacts, dict):
        artifacts = {}
    session_root = resolve_repo_path(str(artifacts.get("sessionRoot", "")).strip()) or (
        root / ".training-output" / "q" / "sessions" / session_id
    )
    session_json_path = session_root / "hybrid-session.json"
    session_markdown_path = session_root / "hybrid-session.md"
    wiki_json_path = resolve_repo_path(str(artifacts.get("wikiJsonPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Hybrid-Training.json"
    )
    wiki_markdown_path = resolve_repo_path(str(artifacts.get("wikiMarkdownPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Hybrid-Training.md"
    )

    policy = manifest.get("policy", {})
    if not isinstance(policy, dict):
        policy = {}

    immaculate_manifest = manifest.get("immaculate", {})
    if not isinstance(immaculate_manifest, dict):
        immaculate_manifest = {}
    immaculate_bundle_output = resolve_repo_path(str(immaculate_manifest.get("bundleOutputPath", "")).strip()) or (
        root / ".training-output" / "immaculate" / f"immaculate-training-bundle-{session_id}.json"
    )

    local_manifest = manifest.get("local", {})
    if not isinstance(local_manifest, dict):
        local_manifest = {}
    local_enabled = bool(local_manifest.get("enabled", True))
    local_mode = str(local_manifest.get("mode", "dry-run")).strip() or "dry-run"
    local_python = str(local_manifest.get("python", sys.executable)).strip() or sys.executable
    local_python_executable = shutil.which(local_python) or local_python
    local_extra_args = [str(entry) for entry in local_manifest.get("extraArgs", [])] if isinstance(local_manifest.get("extraArgs"), list) else []
    local_command: list[str] = []
    if local_enabled and local_mode != "skip":
        local_command = [
            local_python_executable,
            str(root / "training" / "q" / "train_q_lora_unsloth.py"),
            "--config",
            str(config_path),
            "--session-manifest",
            str(manifest_path),
        ]
        if local_mode == "dry-run":
            local_command.append("--dry-run")
        local_command.extend(local_extra_args)

    local_python_present = Path(local_python_executable).exists() or shutil.which(local_python_executable) is not None
    local_dependency_state = {
        "datasets": python_module_available(local_python_executable, "datasets") if local_python_present else False,
        "transformers": python_module_available(local_python_executable, "transformers") if local_python_present else False,
        "trl": python_module_available(local_python_executable, "trl") if local_python_present else False,
        "unsloth": python_module_available(local_python_executable, "unsloth") if local_python_present else False,
    }
    local_reasons: list[str] = []
    if not local_python_present:
        local_reasons.append(f"Python executable not found: {local_python}")
    if local_mode == "train":
        missing_modules = [name for name, present in local_dependency_state.items() if not present]
        if missing_modules:
            local_reasons.append(f"Missing local training modules: {', '.join(missing_modules)}")
    gpu_ready = shutil.which("nvidia-smi") is not None
    if local_mode == "train" and not gpu_ready:
        local_reasons.append("nvidia-smi is not available on this machine.")
    local_ready = local_enabled and local_mode != "skip" and not local_reasons

    cloud_manifest = manifest.get("cloud", {})
    if not isinstance(cloud_manifest, dict):
        cloud_manifest = {}
    cloud_enabled = bool(cloud_manifest.get("enabled", False))
    cloud_provider = str(cloud_manifest.get("provider", "custom")).strip() or "custom"
    cloud_mode = str(cloud_manifest.get("mode", "doctor")).strip() or "doctor"
    cloud_launch_command = normalize_command(cloud_manifest.get("launchCommand"))
    required_env = [str(entry) for entry in cloud_manifest.get("requiredEnv", default_cloud_env(cloud_provider))]
    optional_env = [str(entry) for entry in cloud_manifest.get("optionalEnv", [])]
    required_env_state = {name: bool(os.getenv(name)) for name in required_env}
    optional_env_state = {name: bool(os.getenv(name)) for name in optional_env}
    cloud_reasons: list[str] = []
    if cloud_enabled and cloud_mode != "skip":
        missing_required_env = [name for name, present in required_env_state.items() if not present]
        if missing_required_env:
            cloud_reasons.append(f"Missing cloud env: {', '.join(missing_required_env)}")
        if cloud_provider == "oci":
            if shutil.which("oci") is None:
                cloud_reasons.append("OCI CLI is not installed.")
            oci_auth_ready = (
                os.getenv("OCI_CLI_AUTH") == "instance_principal"
                or bool(os.getenv("OCI_CONFIG_FILE"))
                or all(bool(os.getenv(name)) for name in ("OCI_USER", "OCI_TENANCY", "OCI_FINGERPRINT", "OCI_REGION"))
            )
            if not oci_auth_ready:
                cloud_reasons.append(
                    "OCI auth is not configured through instance principals, OCI_CONFIG_FILE, or explicit OCI_* identity variables."
                )
        if cloud_mode == "launch" and not cloud_launch_command:
            cloud_reasons.append("Cloud launchCommand is not configured.")
        if shutil.which("bash") is None and cloud_provider in {"oci", "custom"}:
            cloud_reasons.append("bash is not available for cloud launcher execution.")
    cloud_ready = cloud_enabled and cloud_mode != "skip" and not cloud_reasons

    hugging_face_ready = bool(os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN"))
    wandb_ready = bool(os.getenv("WANDB_API_KEY") or os.getenv("IMMACULATE_WANDB_API_KEY"))

    build_immaculate_bundle = bool(policy.get("buildImmaculateBundle", True))
    if build_immaculate_bundle:
        bundle_script = root / "training" / "immaculate" / "build_immaculate_training_bundle.py"
        subprocess.run(
            [sys.executable, str(bundle_script), "--output", str(immaculate_bundle_output)],
            cwd=str(root),
            check=True,
        )
        immaculate_bundle = load_json(immaculate_bundle_output)
    else:
        immaculate_bundle = {"bundleId": "skipped", "summary": {"signalCount": 0}}

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sessionId": session_id,
        "manifestPath": relative_path(root, manifest_path),
        "release": build_release_summary(root),
        "q": {
            "trainingBundleId": training_lock.get("bundleId"),
            "trainingLockPath": relative_path(root, training_lock_path),
            "configPath": relative_path(root, config_path),
            "baseModel": config.get("base_model"),
            "trainDatasetPath": relative_path(root, dataset_path),
            "trainDatasetRowCount": count_jsonl_rows(dataset_path),
            "mixManifestPath": relative_path(root, mix_manifest_path),
            "curationRunId": training_lock.get("curation", {}).get("runId"),
            "failureCorpusPath": relative_path(root, failure_corpus_path) if failure_corpus_path.exists() else str(failure_corpus_path),
        },
        "immaculate": {
            "bundleId": immaculate_bundle.get("bundleId"),
            "bundlePath": relative_path(root, immaculate_bundle_output),
            "signalCount": immaculate_bundle.get("summary", {}).get("signalCount"),
        },
        "doctor": {
            "local": {
                "python": local_python_executable,
                "ready": local_ready,
                "mode": local_mode,
                "pythonPresent": local_python_present,
                "gpuVisible": gpu_ready,
                "dependencies": local_dependency_state,
                "reasons": local_reasons,
            },
            "cloud": {
                "provider": cloud_provider,
                "ready": cloud_ready,
                "requiredEnv": required_env_state,
                "optionalEnv": optional_env_state,
                "launchCommandConfigured": bool(cloud_launch_command),
                "reasons": cloud_reasons,
            },
            "huggingFace": {"ready": hugging_face_ready},
            "wandb": {
                "ready": wandb_ready,
                "entityPresent": bool(os.getenv("WANDB_ENTITY") or os.getenv("IMMACULATE_WANDB_ENTITY")),
                "projectPresent": bool(os.getenv("WANDB_PROJECT") or os.getenv("IMMACULATE_WANDB_PROJECT")),
            },
        },
        "lanes": {
            "local": {
                "enabled": local_enabled,
                "mode": local_mode,
                "status": "ready" if local_ready else ("skipped" if not local_enabled or local_mode == "skip" else "not-configured"),
                "command": local_command,
            },
            "cloud": {
                "enabled": cloud_enabled,
                "provider": cloud_provider,
                "mode": cloud_mode,
                "status": "ready" if cloud_ready else ("skipped" if not cloud_enabled or cloud_mode == "skip" else "not-configured"),
                "command": cloud_launch_command,
            },
        },
        "output": {
            "sessionJsonPath": relative_path(root, session_json_path),
            "sessionMarkdownPath": relative_path(root, session_markdown_path),
            "wikiJsonPath": relative_path(root, wiki_json_path),
            "wikiMarkdownPath": relative_path(root, wiki_markdown_path),
        },
    }

    if args.launch:
        local_process = None
        cloud_process = None
        if local_ready and local_command:
            local_process = subprocess.Popen(local_command, cwd=str(root))
            summary["lanes"]["local"]["status"] = "launched"
        if cloud_ready and cloud_mode == "launch" and cloud_launch_command:
            cloud_process = subprocess.Popen(cloud_launch_command, cwd=str(root))
            summary["lanes"]["cloud"]["status"] = "launched"

        if local_process is not None:
            local_exit_code = local_process.wait()
            summary["lanes"]["local"]["exitCode"] = local_exit_code
            summary["lanes"]["local"]["status"] = "completed" if local_exit_code == 0 else "failed"
        if cloud_process is not None:
            cloud_exit_code = cloud_process.wait()
            summary["lanes"]["cloud"]["exitCode"] = cloud_exit_code
            summary["lanes"]["cloud"]["status"] = "completed" if cloud_exit_code == 0 else "failed"

    latest_session_path = root / ".training-output" / "q" / "latest-hybrid-session.json"
    save_json(session_json_path, summary)
    save_json(latest_session_path, summary)
    markdown = render_markdown(summary)
    save_markdown(session_markdown_path, markdown)
    save_json(wiki_json_path, summary)
    save_markdown(wiki_markdown_path, markdown)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
