import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def sha256_file(path_value: Path) -> str:
    digest = hashlib.sha256()
    with path_value.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8-sig"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def try_load_json(path_value: Path) -> dict | None:
    if not path_value.exists():
        return None
    try:
        return load_json(path_value)
    except Exception:
        return None


def repo_path_arg(root: Path, value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    candidate = Path(text).expanduser()
    if candidate.is_absolute():
        return str(candidate.resolve(strict=False))
    return str((root / candidate).resolve(strict=False))


def load_latest_training_lock_inputs(root: Path) -> dict[str, str | None]:
    candidates = [
        root / ".training-output" / "q" / "latest-hybrid-session.json",
        root / "docs" / "wiki" / "Q-Hybrid-Training.json",
    ]
    for candidate in candidates:
        payload = try_load_json(candidate)
        q_payload = payload.get("q") if isinstance(payload, dict) else None
        if not isinstance(q_payload, dict):
            continue
        config_arg = repo_path_arg(root, q_payload.get("configPath"))
        mix_manifest_arg = repo_path_arg(root, q_payload.get("mixManifestPath"))
        if not config_arg or not mix_manifest_arg:
            continue
        return {
            "config": config_arg,
            "mix_manifest": mix_manifest_arg,
            "curation_run": repo_path_arg(root, q_payload.get("curationRunPath")),
        }
    return {"config": None, "mix_manifest": None, "curation_run": None}


def git_value(repo_root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(repo_root),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def count_jsonl_rows(path_value: Path) -> int:
    row_count = 0
    with path_value.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            if line.strip():
                row_count += 1
    return row_count


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "positionals",
        nargs="*",
        help="Optional config, mix manifest, curation run, and output paths when npm strips option names.",
    )
    parser.add_argument("--config", help="Concrete Q LoRA config JSON path")
    parser.add_argument("--mix-manifest", help="Sidecar manifest emitted by build_q_mixture.py")
    parser.add_argument("--curation-run", help="Optional training-data run.json path for provenance linkage")
    parser.add_argument(
        "--output",
        help="Optional lock output path. Defaults to .training-output/q/locks/q-training-lock-<run-name>.json",
    )
    args = parser.parse_args()

    config_arg = args.config or (args.positionals[0] if len(args.positionals) >= 1 else None)
    mix_manifest_arg = args.mix_manifest or (args.positionals[1] if len(args.positionals) >= 2 else None)
    default_inputs = (
        load_latest_training_lock_inputs(repo_root)
        if not config_arg or not mix_manifest_arg or (not args.curation_run and len(args.positionals) < 3)
        else {"config": None, "mix_manifest": None, "curation_run": None}
    )
    config_arg = config_arg or default_inputs["config"]
    mix_manifest_arg = mix_manifest_arg or default_inputs["mix_manifest"]
    if not config_arg or not mix_manifest_arg:
        parser.error("--config and --mix-manifest are required.")

    config_path = Path(config_arg).resolve()
    mix_manifest_path = Path(mix_manifest_arg).resolve()
    curation_run_arg = (
        args.curation_run
        or (args.positionals[2] if len(args.positionals) >= 3 else None)
        or default_inputs["curation_run"]
    )
    output_arg = args.output or (args.positionals[3] if len(args.positionals) >= 4 else None)

    curation_run_path = Path(curation_run_arg).resolve() if curation_run_arg else None

    config = load_json(config_path)
    mix_manifest = load_json(mix_manifest_path)
    curation_run = load_json(curation_run_path) if curation_run_path else None

    dataset_path = Path(config["train_dataset_path"]).resolve()
    lock_root = repo_root / ".training-output" / "q" / "locks"
    lock_root.mkdir(parents=True, exist_ok=True)
    output_path = (
        Path(output_arg).resolve()
        if output_arg
        else lock_root / f"q-training-lock-{str(config['run_name']).strip()}.json"
    )

    git_sha = git_value(repo_root, "rev-parse", "HEAD")
    git_short_sha = git_value(repo_root, "rev-parse", "--short=7", "HEAD")
    package_json = load_json(repo_root / "package.json")
    package_version = str(package_json.get("version", "0.0.0"))
    dataset_hash = sha256_file(dataset_path)
    config_hash = sha256_file(config_path)
    mix_manifest_hash = sha256_file(mix_manifest_path)
    bundle_id = f"{config['run_name']}-{git_short_sha}-{dataset_hash[:8]}"
    model_name = str(config.get("model_name") or "Q").strip()

    lock = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "lockVersion": 1,
        "bundleId": bundle_id,
        "repo": {
            "packageVersion": package_version,
            "gitSha": git_sha,
            "gitShortSha": git_short_sha,
        },
        "run": {
            "runName": config["run_name"],
            "modelName": model_name,
            "baseModel": config.get("base_model"),
            "trainDatasetPath": str(dataset_path),
            "trainDatasetSha256": dataset_hash,
            "trainDatasetRowCount": count_jsonl_rows(dataset_path),
            "outputDir": config.get("output_dir"),
            "configPath": str(config_path),
            "configSha256": config_hash,
        },
        "mixManifest": {
            "path": str(mix_manifest_path),
            "sha256": mix_manifest_hash,
            "outputPath": mix_manifest.get("output", {}).get("path"),
            "outputRowCount": mix_manifest.get("output", {}).get("row_count"),
            "outputSha256": mix_manifest.get("output", {}).get("sha256"),
            "basePath": mix_manifest.get("base", {}).get("path"),
            "baseSha256": mix_manifest.get("base", {}).get("sha256"),
            "supplemental": mix_manifest.get("supplemental", []),
        },
        "curation": {
            "runPath": str(curation_run_path) if curation_run_path else None,
            "runId": curation_run.get("id") if curation_run else None,
            "manifestId": curation_run.get("manifestId") if curation_run else None,
            "provenanceChainHash": curation_run.get("provenanceChainHash") if curation_run else None,
            "outputRecordCount": curation_run.get("outputRecordCount") if curation_run else None,
        },
    }

    output_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    latest_path = repo_root / ".training-output" / "q" / "latest-training-lock.json"
    latest_path.parent.mkdir(parents=True, exist_ok=True)
    latest_path.write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "accepted": True,
                "bundle_id": bundle_id,
                "output": str(output_path),
                "latest": str(latest_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
