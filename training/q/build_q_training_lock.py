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
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


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
    with path_value.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row_count += 1
    return row_count


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Concrete Q LoRA config JSON path")
    parser.add_argument("--mix-manifest", required=True, help="Sidecar manifest emitted by build_q_mixture.py")
    parser.add_argument("--curation-run", help="Optional training-data run.json path for provenance linkage")
    parser.add_argument(
        "--output",
        help="Optional lock output path. Defaults to .training-output/q/locks/q-training-lock-<run-name>.json",
    )
    args = parser.parse_args()

    config_path = Path(args.config).resolve()
    mix_manifest_path = Path(args.mix_manifest).resolve()
    curation_run_path = Path(args.curation_run).resolve() if args.curation_run else None
    repo_root = Path(__file__).resolve().parents[2]

    config = load_json(config_path)
    mix_manifest = load_json(mix_manifest_path)
    curation_run = load_json(curation_run_path) if curation_run_path else None

    dataset_path = Path(config["train_dataset_path"]).resolve()
    lock_root = repo_root / ".training-output" / "q" / "locks"
    lock_root.mkdir(parents=True, exist_ok=True)
    output_path = (
        Path(args.output).resolve()
        if args.output
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
            "aliasName": config.get("alias_name"),
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
