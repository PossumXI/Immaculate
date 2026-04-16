import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path_value: Path) -> dict[str, Any]:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def save_json(path_value: Path, payload: dict[str, Any]) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def save_markdown(path_value: Path, content: str) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(content, encoding="utf-8")


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


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


def sha256_file(path_value: Path) -> str:
    digest = sha256()
    with path_value.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def count_jsonl_rows(path_value: Path) -> int:
    row_count = 0
    with path_value.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row_count += 1
    return row_count


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


def materialize_json_surface(script_path: Path, *args: str) -> None:
    subprocess.run([sys.executable, str(script_path), *args], cwd=str(repo_root()), check=True)


def normalize_path_text(root: Path, path_value: str | None) -> str | None:
    if not path_value:
        return None
    candidate = resolve_repo_path(path_value)
    if candidate is None:
        return None
    return relative_path(root, candidate)


def split_bench_version(name: str) -> tuple[str, int]:
    marker = "-bench-v"
    if marker not in name:
        return name, 0
    stem, version_text = name.rsplit(marker, 1)
    try:
        return stem, int(version_text)
    except ValueError:
        return name, 0


def next_bench_name(name: str) -> str:
    stem, version = split_bench_version(name)
    if version <= 0:
        return f"{name}-bench-v1"
    return f"{stem}-bench-v{version + 1}"


def swap_bench_suffix(path_value: Path, new_suffix: str) -> Path:
    parent = path_value.parent
    suffix = "".join(path_value.suffixes)
    stem = path_value.name[: -len(suffix)] if suffix else path_value.name
    base_stem, _ = split_bench_version(stem)
    return parent / f"{base_stem}-bench-v{new_suffix}{suffix}" if new_suffix.isdigit() else parent / f"{base_stem}{new_suffix}{suffix}"


def build_versioned_file_name(path_value: Path, run_name: str) -> Path:
    suffix = "".join(path_value.suffixes)
    stem = path_value.name[: -len(suffix)] if suffix else path_value.name
    base_stem, _ = split_bench_version(stem)
    if "-bench-v" in run_name:
        run_suffix = run_name[run_name.rfind("-bench-v") :]
    else:
        run_suffix = ""
    if run_suffix:
        return path_value.parent / f"{base_stem}{run_suffix}{suffix}"
    return path_value.parent / f"{base_stem}{suffix}"


def derive_output_dir(output_dir: str | None, run_name: str) -> str:
    current = Path(output_dir or ".training-output/q/runs")
    if current.name:
        parent = current.parent
    else:
        parent = current
    return str((parent / run_name).as_posix())


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Q Benchmark Promotion",
        "",
        "This page is generated from the tracked Q training state.",
        "It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.",
        "",
        f"- Generated: `{summary['generatedAt']}`",
        f"- Status: `{summary['status']}`",
        f"- Release: `{summary['release']['buildId']}`",
        f"- Repo commit: `{summary['release']['gitShortSha']}`",
        f"- Benchmark corpus JSONL: `{summary['benchmarkCorpus']['jsonlPath']}`",
        f"- Benchmark corpus SHA-256: `{summary['benchmarkCorpus']['sha256']}`",
        f"- Benchmark corpus rows: `{summary['benchmarkCorpus']['rowCount']}`",
        f"- Active Q bundle: `{summary['active']['bundleId']}`",
        f"- Active run: `{summary['active']['runName']}`",
        f"- Active session: `{summary['active']['sessionId']}`",
        "",
        "## Promotion State",
        "",
        f"- Benchmark corpus already in active mix: `{summary['active']['benchmarkCorpusIncluded']}`",
        f"- Active mix rows: `{summary['active']['trainDatasetRowCount']}`",
        f"- Active mix manifest: `{summary['active']['mixManifestPath']}`",
        f"- Active session manifest: `{summary['active']['sessionManifestPath']}`",
        f"- Next candidate run name: `{summary['candidate']['runName']}`",
        f"- Next candidate session id: `{summary['candidate']['sessionId']}`",
    ]
    promotion = summary.get("promotion")
    if isinstance(promotion, dict):
        lines.extend(
            [
                "",
                "## Latest Promotion",
                "",
                f"- Promoted bundle: `{promotion['bundleId']}`",
                f"- Promoted run: `{promotion['runName']}`",
                f"- Promoted session: `{promotion['sessionId']}`",
                f"- Dataset rows: `{promotion['trainDatasetRowCount']}`",
                f"- Mix manifest: `{promotion['mixManifestPath']}`",
                f"- Config: `{promotion['configPath']}`",
                f"- Lock: `{promotion['lockPath']}`",
            ]
        )
    lines.extend(
        [
            "",
            "## Truth Boundary",
            "",
            "- A promoted state means the benchmark corpus has been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.",
            "- An already-current state means the active Q bundle already carries the current benchmark corpus hash, so the repo should not fabricate a new bench version just to look active.",
            "- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Promote the benchmark corpus into the next Q training lineage when needed.")
    parser.add_argument("--force", action="store_true", help="Create the next bench lineage even if the active lock already carries the current benchmark corpus.")
    parser.add_argument(
        "--benchmark-jsonl",
        default=str(root / ".training-output" / "q" / "q-benchmark-corpus.jsonl"),
        help="Benchmark corpus JSONL path",
    )
    parser.add_argument(
        "--benchmark-manifest",
        default=str(root / "docs" / "wiki" / "Q-Benchmark-Corpus.json"),
        help="Benchmark corpus manifest path",
    )
    parser.add_argument(
        "--latest-lock",
        default=str(root / ".training-output" / "q" / "latest-training-lock.json"),
        help="Latest Q training lock path",
    )
    parser.add_argument(
        "--latest-session",
        default=str(root / ".training-output" / "q" / "latest-hybrid-session.json"),
        help="Latest hybrid session summary path",
    )
    parser.add_argument(
        "--manifest-output",
        default=str(root / "docs" / "wiki" / "Q-Benchmark-Promotion.json"),
        help="Promotion summary manifest path",
    )
    args = parser.parse_args()

    benchmark_jsonl_path = Path(args.benchmark_jsonl).resolve()
    benchmark_manifest_path = Path(args.benchmark_manifest).resolve()
    latest_lock_path = Path(args.latest_lock).resolve()
    latest_session_path = Path(args.latest_session).resolve()
    output_manifest_path = Path(args.manifest_output).resolve()
    output_markdown_path = output_manifest_path.with_suffix(".md")

    if not benchmark_jsonl_path.exists():
        raise ValueError("Benchmark corpus JSONL does not exist.")
    if not latest_lock_path.exists():
        raise ValueError("Latest training lock does not exist.")
    if not latest_session_path.exists():
        raise ValueError("Latest hybrid session summary does not exist.")

    benchmark_manifest = load_json(benchmark_manifest_path) if benchmark_manifest_path.exists() else {}
    benchmark_sha = sha256_file(benchmark_jsonl_path)
    benchmark_row_count = count_jsonl_rows(benchmark_jsonl_path)
    latest_lock = load_json(latest_lock_path)
    latest_session = load_json(latest_session_path)

    current_config_path = Path(str(latest_lock["run"]["configPath"])).resolve()
    current_mix_manifest_path = Path(str(latest_lock["mixManifest"]["path"])).resolve()
    current_config = load_json(current_config_path)
    current_mix_manifest = load_json(current_mix_manifest_path)

    current_supplemental = current_mix_manifest.get("supplemental", [])
    benchmark_rel_path = relative_path(root, benchmark_jsonl_path)
    benchmark_included = False
    benchmark_sha_match = False
    supplemental_paths: list[Path] = []
    current_base_path = resolve_repo_path(str(current_mix_manifest.get("base", {}).get("path", "")).strip())
    if current_base_path is not None and relative_path(root, current_base_path) == benchmark_rel_path:
        benchmark_included = True
        benchmark_sha_match = sha256_file(current_base_path) == benchmark_sha
    for entry in current_supplemental:
        if not isinstance(entry, dict):
            continue
        path_text = str(entry.get("path", "")).strip()
        supplemental_path = resolve_repo_path(path_text)
        if supplemental_path is None:
            continue
        supplemental_paths.append(supplemental_path)
        if relative_path(root, supplemental_path) == benchmark_rel_path:
            benchmark_included = True
            benchmark_sha_match = str(entry.get("sha256", "")).strip() == benchmark_sha

    active_session_manifest_path = resolve_repo_path(str(latest_session.get("manifestPath", "")).strip())
    if active_session_manifest_path is None or not active_session_manifest_path.exists():
        raise ValueError("Active session manifest path is missing.")
    active_session_manifest = load_json(active_session_manifest_path)

    active_run_name = str(current_config.get("run_name", "")).strip()
    next_run_name = next_bench_name(active_run_name)
    active_session_id = str(latest_session.get("sessionId", "")).strip()
    next_session_id = next_bench_name(active_session_id)

    release = {
        "packageVersion": load_json(root / "package.json").get("version", "0.0.0"),
        "gitSha": git_value(root, "rev-parse", "HEAD"),
        "gitShortSha": git_value(root, "rev-parse", "--short=7", "HEAD"),
    }
    release["buildId"] = f"{release['packageVersion']}+{release['gitShortSha']}"

    summary: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": "already-current" if benchmark_included and benchmark_sha_match and not args.force else "promoted",
        "release": release,
        "benchmarkCorpus": {
            "jsonlPath": relative_path(root, benchmark_jsonl_path),
            "manifestPath": relative_path(root, benchmark_manifest_path) if benchmark_manifest_path.exists() else None,
            "sha256": benchmark_sha,
            "rowCount": benchmark_row_count,
            "manifestRecordCount": benchmark_manifest.get("recordCount"),
        },
        "active": {
            "bundleId": latest_lock.get("bundleId"),
            "runName": active_run_name,
            "sessionId": active_session_id,
            "benchmarkCorpusIncluded": benchmark_included and benchmark_sha_match,
            "trainDatasetRowCount": latest_lock.get("run", {}).get("trainDatasetRowCount"),
            "mixManifestPath": relative_path(root, current_mix_manifest_path),
            "sessionManifestPath": relative_path(root, active_session_manifest_path),
        },
        "candidate": {
            "runName": next_run_name,
            "sessionId": next_session_id,
        },
        "output": {
            "manifestPath": relative_path(root, output_manifest_path),
            "markdownPath": relative_path(root, output_markdown_path),
        },
    }

    if summary["status"] == "already-current":
        save_json(output_manifest_path, summary)
        save_markdown(output_markdown_path, render_markdown(summary))
        print(json.dumps(summary, indent=2))
        return

    base_dataset_path = resolve_repo_path(str(current_mix_manifest.get("base", {}).get("path", "")).strip())
    if base_dataset_path is None or not base_dataset_path.exists():
        raise ValueError("Base dataset path could not be resolved from the current mix manifest.")

    promotion_run_name = next_run_name
    new_mix_output_path = build_versioned_file_name(Path(str(current_config["train_dataset_path"])), promotion_run_name)
    new_mix_manifest_path = build_versioned_file_name(current_mix_manifest_path, promotion_run_name)
    new_config_path = build_versioned_file_name(current_config_path, promotion_run_name)
    new_session_root = root / ".training-output" / "q" / "sessions" / next_session_id
    new_session_manifest_path = new_session_root / "hybrid-session.manifest.json"
    new_oci_env_path = new_session_root / "oci-cloud.env"

    new_mix_output_path = resolve_repo_path(str(new_mix_output_path).replace("\\", "/")) or new_mix_output_path
    new_mix_manifest_path = resolve_repo_path(str(new_mix_manifest_path).replace("\\", "/")) or new_mix_manifest_path
    new_config_path = resolve_repo_path(str(new_config_path).replace("\\", "/")) or new_config_path

    deduped_supplemental: list[Path] = []
    seen_rel_paths: set[str] = set()
    for supplemental_path in supplemental_paths + [benchmark_jsonl_path]:
        rel = relative_path(root, supplemental_path)
        if rel in seen_rel_paths:
            continue
        seen_rel_paths.add(rel)
        deduped_supplemental.append(supplemental_path)

    mixture_command = [
        sys.executable,
        str(root / "training" / "q" / "build_q_mixture.py"),
        "--base",
        str(base_dataset_path),
    ]
    for supplemental_path in deduped_supplemental:
        mixture_command.extend(["--supplemental", str(supplemental_path)])
    mixture_command.extend(
        [
            "--output",
            str(new_mix_output_path),
            "--manifest-output",
            str(new_mix_manifest_path),
        ]
    )
    subprocess.run(mixture_command, cwd=str(root), check=True)

    new_config = dict(current_config)
    new_config["run_name"] = promotion_run_name
    new_config["train_dataset_path"] = relative_path(root, new_mix_output_path)
    new_config["output_dir"] = derive_output_dir(str(current_config.get("output_dir", "")), promotion_run_name)
    new_config["training_lock_path"] = ".training-output/q/latest-training-lock.json"
    save_json(new_config_path, new_config)

    current_curation_run_path = resolve_repo_path(str(active_session_manifest.get("q", {}).get("curationRunPath", "")).strip())
    if current_curation_run_path is None:
        current_curation_run_path = resolve_repo_path(str(latest_lock.get("curation", {}).get("runPath", "")).strip())

    lock_command = [
        sys.executable,
        str(root / "training" / "q" / "build_q_training_lock.py"),
        "--config",
        str(new_config_path),
        "--mix-manifest",
        str(new_mix_manifest_path),
    ]
    if current_curation_run_path is not None:
        lock_command.extend(["--curation-run", str(current_curation_run_path)])
    subprocess.run(lock_command, cwd=str(root), check=True)

    new_session_root.mkdir(parents=True, exist_ok=True)
    previous_oci_env = active_session_manifest_path.parent / "oci-cloud.env"
    if previous_oci_env.exists():
        shutil.copy2(previous_oci_env, new_oci_env_path)

    new_session_manifest = json.loads(json.dumps(active_session_manifest))
    new_session_manifest["sessionId"] = next_session_id
    q_manifest = new_session_manifest.setdefault("q", {})
    q_manifest["trainingLockPath"] = ".training-output/q/latest-training-lock.json"
    q_manifest["configPath"] = relative_path(root, new_config_path)
    q_manifest["mixManifestPath"] = relative_path(root, new_mix_manifest_path)
    if current_curation_run_path is not None:
        q_manifest["curationRunPath"] = relative_path(root, current_curation_run_path)
    q_manifest["benchmarkCorpusPath"] = relative_path(root, benchmark_manifest_path) if benchmark_manifest_path.exists() else "docs/wiki/Q-Benchmark-Corpus.json"
    q_manifest["benchmarkCorpusJsonlPath"] = relative_path(root, benchmark_jsonl_path)

    immaculate_manifest = new_session_manifest.setdefault("immaculate", {})
    immaculate_manifest["bundleOutputPath"] = f".training-output/immaculate/immaculate-training-bundle-{next_session_id}.json"

    cloud_manifest = new_session_manifest.setdefault("cloud", {})
    env_files = cloud_manifest.get("envFilePath", [])
    if isinstance(env_files, list):
        normalized_env_files = []
        for entry in env_files:
            entry_text = str(entry).strip()
            if entry_text.endswith("/oci-cloud.env") or entry_text.endswith("\\oci-cloud.env"):
                normalized_env_files.append(relative_path(root, new_oci_env_path))
            else:
                normalized_env_files.append(entry_text)
        cloud_manifest["envFilePath"] = normalized_env_files
    launch_command = cloud_manifest.get("launchCommand", [])
    if isinstance(launch_command, list):
        normalized_command: list[str] = []
        for entry in launch_command:
            entry_text = str(entry)
            if "hybrid-session.manifest.json" in entry_text and ".training-output/q/sessions/" in entry_text:
                normalized_command.append(relative_path(root, new_session_manifest_path))
            elif entry_text.endswith("/oci-cloud.env") or entry_text.endswith("\\oci-cloud.env"):
                normalized_command.append(relative_path(root, new_oci_env_path))
            else:
                normalized_command.append(entry_text)
        cloud_manifest["launchCommand"] = normalized_command

    artifacts = new_session_manifest.setdefault("artifacts", {})
    artifacts["sessionRoot"] = relative_path(root, new_session_root)
    artifacts["wikiJsonPath"] = "docs/wiki/Q-Hybrid-Training.json"
    artifacts["wikiMarkdownPath"] = "docs/wiki/Q-Hybrid-Training.md"
    save_json(new_session_manifest_path, new_session_manifest)

    doctor_command = [
        sys.executable,
        str(root / "training" / "q" / "run_q_training_session.py"),
        "--doctor",
        "--session",
        str(new_session_manifest_path),
    ]
    subprocess.run(doctor_command, cwd=str(root), check=True)

    refreshed_lock = load_json(root / ".training-output" / "q" / "latest-training-lock.json")
    refreshed_session = load_json(root / ".training-output" / "q" / "latest-hybrid-session.json")

    summary["promotion"] = {
        "bundleId": refreshed_lock.get("bundleId"),
        "runName": refreshed_lock.get("run", {}).get("runName"),
        "sessionId": refreshed_session.get("sessionId"),
        "trainDatasetRowCount": refreshed_lock.get("run", {}).get("trainDatasetRowCount"),
        "mixManifestPath": relative_path(root, new_mix_manifest_path),
        "configPath": relative_path(root, new_config_path),
        "lockPath": relative_path(root, root / ".training-output" / "q" / "latest-training-lock.json"),
    }
    summary["active"] = {
        "bundleId": refreshed_lock.get("bundleId"),
        "runName": refreshed_lock.get("run", {}).get("runName"),
        "sessionId": refreshed_session.get("sessionId"),
        "benchmarkCorpusIncluded": True,
        "trainDatasetRowCount": refreshed_lock.get("run", {}).get("trainDatasetRowCount"),
        "mixManifestPath": relative_path(root, new_mix_manifest_path),
        "sessionManifestPath": relative_path(root, new_session_manifest_path),
    }
    refreshed_run_name = str(refreshed_lock.get("run", {}).get("runName", "")).strip() or promotion_run_name
    refreshed_session_id = str(refreshed_session.get("sessionId", "")).strip() or next_session_id
    summary["candidate"] = {
        "runName": next_bench_name(refreshed_run_name),
        "sessionId": next_bench_name(refreshed_session_id),
    }

    save_json(output_manifest_path, summary)
    save_markdown(output_markdown_path, render_markdown(summary))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
