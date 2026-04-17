import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


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


def find_named_file(root: Path, file_name: str) -> Path | None:
    direct = root / file_name
    if direct.exists():
        return direct
    matches = sorted(root.rglob(file_name))
    return matches[0] if matches else None


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Package a Cloudflare-ready Q LoRA adapter bundle when adapter files exist.")
    parser.add_argument("session_path", nargs="?", help="Optional positional hybrid session manifest JSON for npm wrapper compatibility.")
    parser.add_argument("--session", help="Optional hybrid session manifest JSON.")
    parser.add_argument("--adapter-dir", help="Optional explicit source directory containing adapter_config.json and adapter_model.safetensors.")
    parser.add_argument("--output-dir", help="Optional output directory for the Cloudflare-ready adapter export.")
    parser.add_argument("--check", action="store_true", help="Inspect only; do not copy files.")
    args = parser.parse_args()

    session_arg = args.session_path or args.session
    session_path = resolve_repo_path(session_arg) if session_arg else default_latest_session_path(root)
    session = load_json(session_path) if session_path and session_path.exists() else {}
    session_id = str(session.get("sessionId", "")).strip() or "standalone"

    source_dir = resolve_repo_path(args.adapter_dir)
    config_path = None
    training_lock_path = None
    if source_dir is None and isinstance(session.get("q"), dict):
        q_manifest = session["q"]
        config_path = resolve_repo_path(str(q_manifest.get("configPath", "")).strip())
        training_lock_path = resolve_repo_path(str(q_manifest.get("trainingLockPath", "")).strip())
    if source_dir is None and config_path and config_path.exists():
        config = load_json(config_path)
        source_dir = resolve_repo_path(str(config.get("output_dir", "")).strip())

    output_dir = resolve_repo_path(args.output_dir) or (root / ".training-output" / "q" / "cloudflare" / session_id / "adapter")
    report_path = output_dir.parent / "cloudflare-adapter-export.json"

    blockers: list[str] = []
    if source_dir is None:
        blockers.append("No adapter source directory is configured.")
    elif not source_dir.exists():
        blockers.append(f"Adapter source directory is missing: {relative_path(root, source_dir) or str(source_dir)}")

    adapter_config = find_named_file(source_dir, "adapter_config.json") if source_dir and source_dir.exists() else None
    adapter_weights = find_named_file(source_dir, "adapter_model.safetensors") if source_dir and source_dir.exists() else None
    if adapter_config is None:
        blockers.append("adapter_config.json is missing from the candidate adapter source.")
    if adapter_weights is None:
        blockers.append("adapter_model.safetensors is missing from the candidate adapter source.")

    export_ready = adapter_config is not None and adapter_weights is not None
    size_bytes = adapter_weights.stat().st_size if adapter_weights else 0
    if export_ready and size_bytes > 300 * 1024 * 1024:
        blockers.append("adapter_model.safetensors exceeds the Cloudflare 300MB fine-tune asset ceiling.")
        export_ready = False

    exported_paths: list[str] = []
    if export_ready and not args.check:
        output_dir.mkdir(parents=True, exist_ok=True)
        exported_config = output_dir / "adapter_config.json"
        exported_weights = output_dir / "adapter_model.safetensors"
        shutil.copy2(adapter_config, exported_config)
        shutil.copy2(adapter_weights, exported_weights)
        exported_paths = [
            relative_path(root, exported_config) or str(exported_config),
            relative_path(root, exported_weights) or str(exported_weights),
        ]

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sessionId": session_id,
        "ready": export_ready,
        "checkOnly": bool(args.check),
        "sourceDir": relative_path(root, source_dir) if source_dir else None,
        "trainingLockPath": relative_path(root, training_lock_path) if training_lock_path else None,
        "adapterConfigPath": relative_path(root, adapter_config) if adapter_config else None,
        "adapterWeightsPath": relative_path(root, adapter_weights) if adapter_weights else None,
        "weightsSizeBytes": size_bytes if adapter_weights else None,
        "weightsSizeMb": round(size_bytes / (1024 * 1024), 2) if adapter_weights else None,
        "outputDir": relative_path(root, output_dir),
        "exportedPaths": exported_paths,
        "blockers": blockers,
    }

    save_json(report_path, report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
