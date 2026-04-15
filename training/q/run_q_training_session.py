import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path


ENV_LINE_PATTERN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")
HF_TOKEN_SECRET_OCID = "OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID"
WANDB_API_KEY_SECRET_OCID = "OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID"
CANONICAL_ENV_ALIASES: dict[str, tuple[str, ...]] = {
    "HF_TOKEN": ("HF_TOKEN", "HUGGINGFACE_TOKEN", "HUGGINFACE_ACCESS_TOKEN"),
    "WANDB_API_KEY": ("WANDB_API_KEY", "IMMACULATE_WANDB_API_KEY"),
    "WANDB_ENTITY": ("WANDB_ENTITY", "IMMACULATE_WANDB_ENTITY"),
    "WANDB_PROJECT": ("WANDB_PROJECT", "IMMACULATE_WANDB_PROJECT"),
    "WANDB_MODE": ("WANDB_MODE", "IMMACULATE_WANDB_MODE"),
    "OCI_CLI_AUTH": ("OCI_CLI_AUTH",),
    "OCI_CLI_CONFIG_FILE": ("OCI_CLI_CONFIG_FILE", "OCI_CONFIG_FILE"),
    "OCI_CLI_PROFILE": ("OCI_CLI_PROFILE", "OCI_PROFILE"),
    "OCI_CLI_USER": ("OCI_CLI_USER", "OCI_USER"),
    "OCI_CLI_TENANCY": ("OCI_CLI_TENANCY", "OCI_TENANCY"),
    "OCI_CLI_FINGERPRINT": ("OCI_CLI_FINGERPRINT", "OCI_FINGERPRINT"),
    "OCI_CLI_REGION": ("OCI_CLI_REGION", "OCI_REGION"),
    "OCI_CLI_KEY_FILE": ("OCI_CLI_KEY_FILE", "OCI_KEY_FILE"),
}


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


def resolve_repo_paths(path_value: object) -> list[Path]:
    if isinstance(path_value, list):
        resolved: list[Path] = []
        for entry in path_value:
            candidate = resolve_repo_path(str(entry).strip())
            if candidate is not None:
                resolved.append(candidate)
        return resolved
    if isinstance(path_value, str):
        candidate = resolve_repo_path(path_value.strip())
        return [candidate] if candidate is not None else []
    return []


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


def sha256_file(path_value: Path) -> str:
    digest = sha256()
    with path_value.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


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
        "oci": [
            "OCI_COMPARTMENT_OCID",
            "OCI_SUBNET_OCID",
            "OCI_AVAILABILITY_DOMAIN",
            "OCI_IMAGE_OCID",
            "OCI_SHAPE",
            "OCI_OBJECT_STORAGE_NAMESPACE",
            "OCI_OBJECT_STORAGE_BUCKET",
        ],
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
        key = match.group(1).strip()
        value = strip_optional_quotes(match.group(2).strip())
        values[key] = value
    return values


def build_effective_env(env_file_paths: list[Path], inline_env: object) -> tuple[dict[str, str], list[dict[str, object]]]:
    effective_env = dict(os.environ)
    env_file_summaries: list[dict[str, object]] = []
    for env_path in env_file_paths:
        exists = env_path.exists()
        env_file_summaries.append(
            {
                "path": relative_path(repo_root(), env_path),
                "exists": exists,
            }
        )
        if exists:
            effective_env.update(load_env_file(env_path))
    if isinstance(inline_env, dict):
        for key, value in inline_env.items():
            key_text = str(key).strip()
            if not key_text:
                continue
            effective_env[key_text] = str(value)
    return effective_env, env_file_summaries


def first_present_env_value(env_map: dict[str, str], aliases: tuple[str, ...]) -> tuple[str | None, str | None]:
    for alias in aliases:
        value = str(env_map.get(alias, "")).strip()
        if value:
            return alias, value
    return None, None


def canonicalize_env(env_map: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    canonical_env = dict(env_map)
    sources: dict[str, str] = {}
    for canonical_name, aliases in CANONICAL_ENV_ALIASES.items():
        source_name, value = first_present_env_value(env_map, aliases)
        if source_name and value:
            canonical_env[canonical_name] = value
            sources[canonical_name] = source_name
    return canonical_env, sources


def read_secret_value(env_map: dict[str, str], base_name: str) -> tuple[str | None, str | None]:
    file_var_name = f"{base_name}_FILE"
    file_path_value = str(env_map.get(file_var_name, "")).strip()
    if not file_path_value:
        return None, None
    file_path = Path(file_path_value).expanduser()
    if not file_path.is_absolute():
        file_path = (repo_root() / file_path).resolve()
    if not file_path.exists() or not file_path.is_file():
        return file_var_name, None
    return file_var_name, file_path.read_text(encoding="utf-8").strip()


def git_remote_url(root: Path) -> str:
    return git_value(root, "remote", "get-url", "origin")


def materialize_json_surface(script_path: Path, *args: str) -> None:
    subprocess.run([sys.executable, str(script_path), *args], cwd=str(repo_root()), check=True)


def resolve_surface_jsonl_path(manifest_path: Path) -> Path | None:
    if not manifest_path.exists():
        return None
    try:
        payload = load_json(manifest_path)
    except Exception:
        return None
    output = payload.get("output", {})
    if not isinstance(output, dict):
        return None
    return resolve_repo_path(str(output.get("jsonlPath", "")).strip())


def build_cloud_bundle(
    *,
    root: Path,
    session_id: str,
    session_root: Path,
    manifest_path: Path,
    training_lock_path: Path,
    config_path: Path,
    mix_manifest_path: Path,
    curation_run_path: Path,
    dataset_path: Path,
    failure_corpus_path: Path | None,
    benchmark_corpus_path: Path | None,
    benchmark_corpus_jsonl_path: Path | None,
    immaculate_bundle_output: Path,
    release_summary: dict,
) -> dict:
    bundle_root = session_root / "cloud-bundle"
    bundle_root.mkdir(parents=True, exist_ok=True)
    bundle_manifest_path = bundle_root / "bundle-manifest.json"
    bundle_archive_path = bundle_root / f"{session_id}-cloud-bundle.tar.gz"

    source_paths = [
        manifest_path,
        training_lock_path,
        config_path,
        mix_manifest_path,
        curation_run_path,
        dataset_path,
        immaculate_bundle_output,
    ]
    if failure_corpus_path is not None and failure_corpus_path.exists():
        source_paths.append(failure_corpus_path)
    if benchmark_corpus_path is not None and benchmark_corpus_path.exists():
        source_paths.append(benchmark_corpus_path)
    if benchmark_corpus_jsonl_path is not None and benchmark_corpus_jsonl_path.exists():
        source_paths.append(benchmark_corpus_jsonl_path)

    source_entries = [
        {
            "path": relative_path(root, source_path),
            "sha256": sha256_file(source_path),
            "sizeBytes": source_path.stat().st_size,
        }
        for source_path in source_paths
    ]

    bundle_manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "bundleKind": "q-hybrid-cloud-session",
        "sessionId": session_id,
        "bundleId": f"{session_id}-{release_summary['gitShortSha']}",
        "release": release_summary,
        "repo": {
            "remoteUrl": git_remote_url(root),
            "gitSha": release_summary["gitSha"],
            "gitShortSha": release_summary["gitShortSha"],
        },
        "sources": source_entries,
    }
    save_json(bundle_manifest_path, bundle_manifest)

    with tarfile.open(bundle_archive_path, "w:gz") as archive:
        for source_path in source_paths:
            archive.add(source_path, arcname=relative_path(root, source_path))
        archive.add(bundle_manifest_path, arcname="bundle-manifest.json")

    bundle_sha256 = sha256_file(bundle_archive_path)
    bundle_manifest["archive"] = {
        "path": relative_path(root, bundle_archive_path),
        "sha256": bundle_sha256,
        "sizeBytes": bundle_archive_path.stat().st_size,
    }
    save_json(bundle_manifest_path, bundle_manifest)

    return {
        "bundleId": bundle_manifest["bundleId"],
        "archivePath": relative_path(root, bundle_archive_path),
        "archiveSha256": bundle_sha256,
        "archiveSizeBytes": bundle_archive_path.stat().st_size,
        "manifestPath": relative_path(root, bundle_manifest_path),
        "fileCount": len(source_entries),
        "repoRemoteUrl": bundle_manifest["repo"]["remoteUrl"],
    }


def render_markdown(summary: dict) -> str:
    q = summary["q"]
    immaculate = summary["immaculate"]
    local_lane = summary["lanes"]["local"]
    cloud_lane = summary["lanes"]["cloud"]
    doctor = summary["doctor"]
    cloud_bundle = summary["cloudBundle"]
    lines = [
        "# Q Hybrid Training",
        "",
        "This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.",
        "",
        f"- Generated: `{summary['generatedAt']}`",
        f"- Release: `{summary['release']['buildId']}`",
        f"- Session id: `{summary['sessionId']}`",
        f"- Q training bundle: `{q['trainingBundleId']}`",
        f"- Dataset rows: `{q['trainDatasetRowCount']}`",
        f"- Immaculate orchestration bundle: `{immaculate['bundleId']}`",
        "",
        "## Plain English Status",
        "",
        f"- Local lane: `{local_lane['status']}` in mode `{local_lane['mode']}`",
        f"- Cloud lane: `{cloud_lane['status']}` on provider `{cloud_lane['provider']}` in mode `{cloud_lane['mode']}`",
        f"- Hugging Face token or secret path ready: `{doctor['huggingFace']['ready']}` via `{doctor['huggingFace']['source']}`",
        f"- W&B state ready: `{doctor['wandb']['ready']}` via `{doctor['wandb']['source']}`",
        "",
        "## Q Fine-Tune Lane",
        "",
        f"- Training lock: `{q['trainingLockPath']}`",
        f"- Config: `{q['configPath']}`",
        f"- Dataset: `{q['trainDatasetPath']}`",
        f"- Mix manifest: `{q['mixManifestPath']}`",
        f"- Curation run: `{q['curationRunId']}`",
        f"- Benchmark corpus: `{q['benchmarkCorpusPath']}`",
        f"- Benchmark corpus JSONL: `{q['benchmarkCorpusJsonlPath']}`",
        f"- Benchmark corpus records: `{q['benchmarkCorpusRecordCount']}`",
        f"- Failure corpus: `{q['failureCorpusPath']}`",
        f"- Local command: `{' '.join(local_lane['command']) if local_lane['command'] else 'n/a'}`",
        "",
        "## Immaculate Orchestration Lane",
        "",
        f"- Bundle path: `{immaculate['bundlePath']}`",
        f"- Signal count: `{immaculate['signalCount']}`",
        "- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.",
        "",
        "## Cloud Bundle",
        "",
        f"- Bundle id: `{cloud_bundle['bundleId']}`",
        f"- Archive: `{cloud_bundle['archivePath']}`",
        f"- Archive SHA-256: `{cloud_bundle['archiveSha256']}`",
        f"- Bundle manifest: `{cloud_bundle['manifestPath']}`",
        f"- Included file count: `{cloud_bundle['fileCount']}`",
        "",
        "## Cloud Doctor",
        "",
        f"- Provider: `{cloud_lane['provider']}`",
        f"- Launch command configured: `{doctor['cloud']['launchCommandConfigured']}`",
        f"- OCI CLI path: `{doctor['cloud']['cliBin']}`",
        f"- OCI auth mode: `{doctor['cloud']['authMode']}`",
        f"- Cloud ready: `{doctor['cloud']['ready']}`",
        *[
            f"- Env file: `{entry['path']}` exists `{entry['exists']}`"
            for entry in doctor["cloud"]["envFiles"]
        ],
        *[
            f"- Launch target `{name}`: `{present}`"
            for name, present in doctor["cloud"]["launchTarget"].items()
        ],
        *[f"- Cloud note: {reason}" for reason in doctor["cloud"]["reasons"]],
        "",
        "## Truth Boundary",
        "",
        "- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.",
        "- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.",
        "- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.",
        "- Missing OCI auth, missing launch target OCIDs, or missing secret mappings keep the cloud lane explicit as `not-configured` instead of being papered over.",
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
        raise ValueError("Session config and training lock disagree on the Q lineage source.")

    failure_corpus_path = resolve_repo_path(str(q_manifest.get("failureCorpusPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Failure-Corpus.json"
    )
    benchmark_corpus_path = resolve_repo_path(str(q_manifest.get("benchmarkCorpusPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Benchmark-Corpus.json"
    )
    benchmark_corpus_jsonl_path = resolve_repo_path(str(q_manifest.get("benchmarkCorpusJsonlPath", "")).strip()) or (
        root / ".training-output" / "q" / "q-benchmark-corpus.jsonl"
    )

    materialize_json_surface(
        root / "training" / "q" / "build_q_failure_corpus.py",
        "--manifest",
        str(failure_corpus_path),
    )
    materialize_json_surface(
        root / "training" / "q" / "build_q_benchmark_corpus.py",
        "--manifest",
        str(benchmark_corpus_path),
        "--output",
        str(benchmark_corpus_jsonl_path),
    )

    if benchmark_corpus_jsonl_path is None or not benchmark_corpus_jsonl_path.exists():
        resolved_benchmark_jsonl = resolve_surface_jsonl_path(benchmark_corpus_path)
        if resolved_benchmark_jsonl is not None:
            benchmark_corpus_jsonl_path = resolved_benchmark_jsonl
    benchmark_corpus_summary = load_json(benchmark_corpus_path) if benchmark_corpus_path.exists() else {}

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

    release_summary = build_release_summary(root)
    cloud_bundle = build_cloud_bundle(
        root=root,
        session_id=session_id,
        session_root=session_root,
        manifest_path=manifest_path,
        training_lock_path=training_lock_path,
        config_path=config_path,
        mix_manifest_path=mix_manifest_path,
        curation_run_path=curation_run_path,
        dataset_path=dataset_path,
        failure_corpus_path=failure_corpus_path if failure_corpus_path.exists() else None,
        benchmark_corpus_path=benchmark_corpus_path if benchmark_corpus_path.exists() else None,
        benchmark_corpus_jsonl_path=benchmark_corpus_jsonl_path if benchmark_corpus_jsonl_path and benchmark_corpus_jsonl_path.exists() else None,
        immaculate_bundle_output=immaculate_bundle_output,
        release_summary=release_summary,
    )

    cloud_manifest = manifest.get("cloud", {})
    if not isinstance(cloud_manifest, dict):
        cloud_manifest = {}
    cloud_enabled = bool(cloud_manifest.get("enabled", False))
    cloud_provider = str(cloud_manifest.get("provider", "custom")).strip() or "custom"
    cloud_mode = str(cloud_manifest.get("mode", "doctor")).strip() or "doctor"
    cloud_launch_command = normalize_command(cloud_manifest.get("launchCommand"))
    cloud_env_file_paths = resolve_repo_paths(cloud_manifest.get("envFilePath"))
    cloud_inline_env = cloud_manifest.get("inlineEnv", {})
    effective_cloud_env, env_file_summaries = build_effective_env(cloud_env_file_paths, cloud_inline_env)
    canonical_cloud_env, canonical_sources = canonicalize_env(effective_cloud_env)

    required_env = [str(entry) for entry in cloud_manifest.get("requiredEnv", default_cloud_env(cloud_provider))]
    optional_env = [str(entry) for entry in cloud_manifest.get("optionalEnv", [])]
    required_env_state = {name: bool(str(canonical_cloud_env.get(name, "")).strip()) for name in required_env}
    optional_env_state = {name: bool(str(canonical_cloud_env.get(name, "")).strip()) for name in optional_env}

    launch_target_state = {
        name: bool(str(canonical_cloud_env.get(name, "")).strip())
        for name in default_cloud_env(cloud_provider)
    }

    oci_cli_bin = str(canonical_cloud_env.get("OCI_CLI_BIN", "")).strip() or shutil.which("oci") or "oci"
    oci_cli_available = bool(shutil.which(oci_cli_bin) or Path(oci_cli_bin).exists())
    oci_auth_mode = "missing"
    if str(canonical_cloud_env.get("OCI_CLI_AUTH", "")).strip() == "instance_principal":
        oci_auth_mode = "instance_principal"
    elif str(canonical_cloud_env.get("OCI_CLI_CONFIG_FILE", "")).strip():
        oci_auth_mode = "config_file"
    elif all(bool(str(canonical_cloud_env.get(name, "")).strip()) for name in ("OCI_CLI_USER", "OCI_CLI_TENANCY", "OCI_CLI_FINGERPRINT", "OCI_CLI_REGION")):
        oci_auth_mode = "explicit_identity"
    oci_auth_ready = oci_auth_mode != "missing"

    hf_source = "missing"
    hf_ready = False
    hf_alias_source, hf_alias_value = first_present_env_value(effective_cloud_env, CANONICAL_ENV_ALIASES["HF_TOKEN"])
    if hf_alias_source and hf_alias_value:
        hf_ready = True
        hf_source = hf_alias_source
        canonical_cloud_env["HF_TOKEN"] = hf_alias_value
    else:
        hf_file_source, hf_file_value = read_secret_value(effective_cloud_env, "HF_TOKEN")
        if hf_file_source and hf_file_value:
            hf_ready = True
            hf_source = hf_file_source
            canonical_cloud_env["HF_TOKEN"] = hf_file_value
        elif str(canonical_cloud_env.get(HF_TOKEN_SECRET_OCID, "")).strip():
            hf_ready = True
            hf_source = HF_TOKEN_SECRET_OCID

    wandb_mode = str(canonical_cloud_env.get("WANDB_MODE", "")).strip().lower()
    wandb_source = "missing"
    wandb_ready = False
    if wandb_mode in {"offline", "disabled"}:
        wandb_ready = True
        wandb_source = f"WANDB_MODE={wandb_mode}"
    else:
        wandb_alias_source, wandb_alias_value = first_present_env_value(effective_cloud_env, CANONICAL_ENV_ALIASES["WANDB_API_KEY"])
        if wandb_alias_source and wandb_alias_value:
            wandb_ready = True
            wandb_source = wandb_alias_source
            canonical_cloud_env["WANDB_API_KEY"] = wandb_alias_value
        else:
            wandb_file_source, wandb_file_value = read_secret_value(effective_cloud_env, "WANDB_API_KEY")
            if wandb_file_source and wandb_file_value:
                wandb_ready = True
                wandb_source = wandb_file_source
                canonical_cloud_env["WANDB_API_KEY"] = wandb_file_value
            elif str(canonical_cloud_env.get(WANDB_API_KEY_SECRET_OCID, "")).strip():
                wandb_ready = True
                wandb_source = WANDB_API_KEY_SECRET_OCID

    report_to = config.get("report_to", [])
    report_to_wandb = isinstance(report_to, list) and any(str(entry).strip().lower() == "wandb" for entry in report_to)

    cloud_reasons: list[str] = []
    if cloud_enabled and cloud_mode != "skip":
        missing_env_files = [entry["path"] for entry in env_file_summaries if not entry["exists"]]
        if missing_env_files:
            cloud_reasons.append(f"Missing cloud env files: {', '.join(str(entry) for entry in missing_env_files)}")
        missing_required_env = [name for name, present in required_env_state.items() if not present]
        if missing_required_env:
            cloud_reasons.append(f"Missing cloud launch target env: {', '.join(missing_required_env)}")
        if cloud_provider == "oci":
            if not oci_cli_available:
                cloud_reasons.append(f"OCI CLI is not installed or not reachable at {oci_cli_bin}.")
            if not oci_auth_ready:
                cloud_reasons.append(
                    "OCI auth is not configured through OCI_CLI_AUTH=instance_principal, OCI_CLI_CONFIG_FILE, or explicit OCI_CLI_* identity variables."
                )
        if not hf_ready:
            cloud_reasons.append(
                "Hugging Face auth is not configured through HF_TOKEN/HUGGINGFACE_TOKEN, HF_TOKEN_FILE, or OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID."
            )
        if report_to_wandb and not wandb_ready:
            cloud_reasons.append(
                "W&B is required by the Q config but is not configured through WANDB_API_KEY, WANDB_API_KEY_FILE, OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID, or WANDB_MODE=offline."
            )
        if cloud_mode == "launch" and not cloud_launch_command:
            cloud_reasons.append("Cloud launchCommand is not configured.")
        if shutil.which("bash") is None and cloud_provider in {"oci", "custom"}:
            cloud_reasons.append("bash is not available for cloud launcher execution.")
    cloud_ready = cloud_enabled and cloud_mode != "skip" and not cloud_reasons

    cloud_execution_env = dict(effective_cloud_env)
    cloud_execution_env.update(canonical_cloud_env)
    cloud_execution_env.update(
        {
            "IMMACULATE_REPO_ROOT": str(root),
            "IMMACULATE_Q_HYBRID_SESSION_PATH": str(manifest_path),
            "IMMACULATE_Q_HYBRID_SESSION_REPO_PATH": relative_path(root, manifest_path),
            "IMMACULATE_Q_SESSION_ROOT": str(session_root),
            "IMMACULATE_Q_TRAINING_LOCK_PATH": str(training_lock_path),
            "IMMACULATE_Q_TRAINING_CONFIG_PATH": str(config_path),
            "IMMACULATE_Q_TRAINING_CONFIG_REPO_PATH": relative_path(root, config_path),
            "IMMACULATE_Q_TRAINING_MIX_MANIFEST_PATH": str(mix_manifest_path),
            "IMMACULATE_Q_TRAINING_CURATION_RUN_PATH": str(curation_run_path),
            "IMMACULATE_Q_TRAINING_DATASET_PATH": str(dataset_path),
            "IMMACULATE_Q_BENCHMARK_CORPUS_PATH": str(benchmark_corpus_path),
            "IMMACULATE_Q_BENCHMARK_CORPUS_JSONL_PATH": str(benchmark_corpus_jsonl_path or ""),
            "IMMACULATE_Q_FAILURE_CORPUS_PATH": str(failure_corpus_path),
            "IMMACULATE_Q_TRAINING_BUNDLE_ID": str(training_lock.get("bundleId", "")),
            "IMMACULATE_Q_IMMACULATE_BUNDLE_PATH": str(immaculate_bundle_output),
            "IMMACULATE_Q_CLOUD_BUNDLE_PATH": str(root / cloud_bundle["archivePath"]),
            "IMMACULATE_Q_CLOUD_BUNDLE_MANIFEST": str(root / cloud_bundle["manifestPath"]),
            "IMMACULATE_RELEASE_BUILD_ID": release_summary["buildId"],
            "IMMACULATE_RELEASE_GIT_SHA": release_summary["gitSha"],
            "IMMACULATE_Q_TRAINING_CONTROLLER_PYTHON": sys.executable,
            "GIT_REMOTE_URL": cloud_bundle["repoRemoteUrl"],
            "OCI_CLI_BIN": oci_cli_bin,
        }
    )

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sessionId": session_id,
        "manifestPath": relative_path(root, manifest_path),
        "release": release_summary,
        "q": {
            "trainingBundleId": training_lock.get("bundleId"),
            "trainingLockPath": relative_path(root, training_lock_path),
            "configPath": relative_path(root, config_path),
            "modelId": config.get("alias_name", "Q"),
            "trainDatasetPath": relative_path(root, dataset_path),
            "trainDatasetRowCount": count_jsonl_rows(dataset_path),
            "mixManifestPath": relative_path(root, mix_manifest_path),
            "curationRunId": training_lock.get("curation", {}).get("runId"),
            "benchmarkCorpusPath": relative_path(root, benchmark_corpus_path) if benchmark_corpus_path.exists() else str(benchmark_corpus_path),
            "benchmarkCorpusJsonlPath": relative_path(root, benchmark_corpus_jsonl_path) if benchmark_corpus_jsonl_path and benchmark_corpus_jsonl_path.exists() else str(benchmark_corpus_jsonl_path),
            "benchmarkCorpusRecordCount": benchmark_corpus_summary.get("recordCount", 0),
            "failureCorpusPath": relative_path(root, failure_corpus_path) if failure_corpus_path.exists() else str(failure_corpus_path),
        },
        "immaculate": {
            "bundleId": immaculate_bundle.get("bundleId"),
            "bundlePath": relative_path(root, immaculate_bundle_output),
            "signalCount": immaculate_bundle.get("summary", {}).get("signalCount"),
        },
        "cloudBundle": cloud_bundle,
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
                "mode": cloud_mode,
                "ready": cloud_ready,
                "envFiles": env_file_summaries,
                "inlineEnvKeys": sorted(cloud_inline_env.keys()) if isinstance(cloud_inline_env, dict) else [],
                "requiredEnv": required_env_state,
                "optionalEnv": optional_env_state,
                "launchTarget": launch_target_state,
                "launchCommandConfigured": bool(cloud_launch_command),
                "launchCommand": cloud_launch_command,
                "cliBin": oci_cli_bin,
                "authMode": oci_auth_mode if cloud_provider == "oci" else "n/a",
                "reasons": cloud_reasons,
                "canonicalSources": canonical_sources,
            },
            "huggingFace": {
                "ready": hf_ready,
                "source": hf_source,
            },
            "wandb": {
                "ready": wandb_ready if report_to_wandb else True,
                "source": wandb_source if report_to_wandb else "not-required",
                "entityPresent": bool(str(canonical_cloud_env.get("WANDB_ENTITY", "")).strip()),
                "projectPresent": bool(str(canonical_cloud_env.get("WANDB_PROJECT", "")).strip()),
                "mode": wandb_mode or "online",
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
            cloud_process = subprocess.Popen(cloud_launch_command, cwd=str(root), env=cloud_execution_env)
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
