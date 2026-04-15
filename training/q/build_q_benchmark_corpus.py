import argparse
import json
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


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


def normalize_q_model(model: dict) -> bool:
    label = str(model.get("truthfulLabel", "")).strip()
    requested = str(model.get("requestedModel", "")).strip().lower()
    actual = str(model.get("actualModel", "")).strip()
    return label == "Q" or label.startswith("Q ") or requested == "q" or actual == "Q"


def latest_training_bundle_id(root: Path) -> str:
    lock_path = root / ".training-output" / "q" / "latest-training-lock.json"
    if not lock_path.exists():
        return "none generated yet"
    try:
        payload = load_json(lock_path)
    except Exception:
        return "none generated yet"
    return str(payload.get("bundleId", "")).strip() or "none generated yet"


def harbor_context(root: Path, task_id: str, fallback_label: str) -> tuple[str, list[str]]:
    context_map = {
        "q-structured-contract": root / "benchmarks" / "harbor" / "q-structured-contract" / "incident.json",
        "immaculate-bridge-fail-closed": root / "benchmarks" / "harbor" / "immaculate-bridge-fail-closed" / "report_excerpt.json",
    }
    context_path = context_map.get(task_id)
    if context_path is None or not context_path.exists():
        return fallback_label, []
    payload = load_json(context_path)
    objective = str(payload.get("objective", "")).strip() or fallback_label
    facts = [str(entry).strip() for entry in payload.get("facts", []) if str(entry).strip()]
    return objective, facts


def build_text(record: dict) -> str:
    lines = [
        "Q benchmark-derived corpus",
        f"source={record['source_surface']}",
        "language=text",
        f"path={record['source_surface']}/{record['row_id']}",
        "tags=q,benchmark-corpus,decision-triplet",
        "",
        "OBJECTIVE",
        record["objective"],
    ]
    if record["facts"]:
        lines.extend(["", "REFERENCE FACTS", *record["facts"]])
    lines.extend(
        [
            "",
            "REFERENCE RESPONSE",
            f"ROUTE: {record['output']['route']}",
            f"REASON: {record['output']['reason']}",
            f"COMMIT: {record['output']['commit']}",
            "",
            "QUALITY",
            f"status={record['quality']['status']}",
            f"parse_success={str(record['quality']['parse_success']).lower()}",
            f"structured_field_count={record['quality']['structured_field_count']}",
            f"thinking_detected={str(record['quality']['thinking_detected']).lower()}",
            f"score={record['quality']['score']}",
        ]
    )
    return "\n".join(lines) + "\n"


def finalize_record(record: dict) -> dict:
    source_surface = str(record["source_surface"])
    row_id = str(record["row_id"])
    record["source_id"] = f"q-benchmark-{source_surface}"
    record["relative_path"] = f"{source_surface}/{row_id}"
    record["language"] = "text"
    record["tags"] = ["q", "benchmark-corpus", "decision-triplet"]
    record["provenance_record_id"] = record["id"]
    record["text"] = build_text(record)
    return record


def collect_model_records(surface_name: str, model: dict) -> list[dict]:
    records: list[dict] = []
    for task in model.get("tasks", []):
        status = str(task.get("status", "")).strip()
        parse_success = bool(task.get("parseSuccess"))
        route = str(task.get("routeSuggestion", "")).strip()
        reason = str(task.get("reasonSummary", "")).strip()
        commit = str(task.get("commitStatement", "")).strip()
        if status != "completed" or not parse_success or not route or not reason or not commit:
            continue
        row_id = str(task.get("taskId") or task.get("scenarioId") or task.get("label") or "unknown").strip()
        label = str(task.get("label", row_id)).strip() or row_id
        record = {
            "id": f"{surface_name}:{row_id}",
            "row_type": "decision_triplet",
            "source_surface": surface_name,
            "row_id": row_id,
            "label": label,
            "objective": label,
            "facts": [],
            "output": {
                "route": route,
                "reason": reason,
                "commit": commit,
            },
            "quality": {
                "status": status,
                "parse_success": parse_success,
                "structured_field_count": int(task.get("structuredFieldCount", 3) or 3),
                "thinking_detected": bool(task.get("thinkingDetected", False)),
                "score": 1.0,
            },
        }
        records.append(finalize_record(record))
    return records


def collect_harbor_records(root: Path, harbor: dict) -> list[dict]:
    records: list[dict] = []
    for task in harbor.get("tasks", []):
        q_gateway = task.get("qGateway", {})
        if not isinstance(q_gateway, dict):
            continue
        response = q_gateway.get("response", {})
        if not isinstance(response, dict):
            continue
        route = str(response.get("route", "")).strip()
        reason = str(response.get("reason", "")).strip()
        commit = str(response.get("commit", "")).strip()
        score = q_gateway.get("score")
        if score != 1 or not route or not reason or not commit:
            continue
        row_id = str(task.get("id") or task.get("label") or "unknown").strip()
        label = str(task.get("label", row_id)).strip() or row_id
        objective, facts = harbor_context(root, row_id, label)
        record = {
            "id": f"harbor-terminal-bench:{row_id}",
            "row_type": "decision_triplet",
            "source_surface": "harbor-terminal-bench",
            "row_id": row_id,
            "label": label,
            "objective": objective,
            "facts": facts,
            "output": {
                "route": route,
                "reason": reason,
                "commit": commit,
            },
            "quality": {
                "status": "completed",
                "parse_success": True,
                "structured_field_count": 3,
                "thinking_detected": False,
                "score": float(score),
            },
        }
        records.append(finalize_record(record))
    return records


def build_release_summary(root: Path) -> dict:
    package_version = load_json(root / "package.json").get("version", "0.0.0")
    git_sha = git_value(root, "rev-parse", "HEAD")
    git_short_sha = git_value(root, "rev-parse", "--short=7", "HEAD")
    return {
        "packageVersion": package_version,
        "gitSha": git_sha,
        "gitShortSha": git_short_sha,
        "buildId": f"{package_version}+{git_short_sha}",
        "qTrainingBundleId": latest_training_bundle_id(root),
    }


def build_markdown(summary: dict) -> str:
    lines = [
        "# Q Benchmark Corpus",
        "",
        "This page is generated from the tracked Q benchmark/report surfaces.",
        "It records the benchmark-derived corpus currently attached to Q. It is not a readiness gate and it does not replace the strict failure-only Q-Failure-Corpus surface.",
        "",
        f"- Generated: `{summary['generatedAt']}`",
        f"- Release: `{summary['release']['buildId']}`",
        f"- Repo commit: `{summary['release']['gitShortSha']}`",
        f"- Q training bundle: `{summary['release']['qTrainingBundleId']}`",
        f"- Records: `{summary['recordCount']}`",
        f"- Row type: `{summary['rowType']}`",
        f"- JSONL: `{summary['output']['jsonlPath']}`",
        "",
        "## Sources",
        "",
    ]
    for source_name, count in summary["sourceCounts"].items():
        source_path = summary["sources"][source_name]
        lines.append(f"- {source_name}: `{count}` via `{source_path}`")
    lines.extend(
        [
            "",
            "## Truth Boundary",
            "",
            "- This surface records successful benchmark-derived decision rows for Q so the training path can reuse tracked outputs without scraping markdown by hand.",
            "- It is intentionally complementary to Q-Failure-Corpus, which remains strict failure-only and should stay empty when the current Q benchmark lane is green.",
            "- These rows are output-side evidence from executed Q benchmarks. They help stabilize route/reason/commit behavior, but they are not a substitute for broader curation or new external truth sources.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Build Q benchmark-derived corpus from tracked report surfaces.")
    parser.add_argument(
        "--comparison",
        default=str(root / "docs" / "wiki" / "Model-Benchmark-Comparison.json"),
        help="Path to Model-Benchmark-Comparison.json",
    )
    parser.add_argument(
        "--bridgebench",
        default=str(root / "docs" / "wiki" / "BridgeBench.json"),
        help="Path to BridgeBench.json",
    )
    parser.add_argument(
        "--harbor",
        default=str(root / "docs" / "wiki" / "Harbor-Terminal-Bench.json"),
        help="Path to Harbor-Terminal-Bench.json",
    )
    parser.add_argument(
        "--output",
        default=str(root / ".training-output" / "q" / "q-benchmark-corpus.jsonl"),
        help="Output JSONL path",
    )
    parser.add_argument(
        "--manifest",
        default=str(root / "docs" / "wiki" / "Q-Benchmark-Corpus.json"),
        help="Summary manifest JSON path",
    )
    args = parser.parse_args()

    comparison_path = Path(args.comparison)
    bridgebench_path = Path(args.bridgebench)
    harbor_path = Path(args.harbor)
    output_path = Path(args.output)
    manifest_path = Path(args.manifest)
    markdown_path = manifest_path.with_suffix(".md")

    comparison = load_json(comparison_path)
    bridgebench = load_json(bridgebench_path)
    harbor = load_json(harbor_path)

    comparison_model = next((model for model in comparison.get("models", []) if normalize_q_model(model)), None)
    bridgebench_model = next((model for model in bridgebench.get("models", []) if normalize_q_model(model)), None)

    records: list[dict] = []
    if comparison_model:
        records.extend(collect_model_records("model-comparison", comparison_model))
    if bridgebench_model:
        records.extend(collect_model_records("bridgebench", bridgebench_model))
    records.extend(collect_harbor_records(root, harbor))

    source_counts = Counter(record["source_surface"] for record in records)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")

    summary = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "release": build_release_summary(root),
        "rowType": "decision_triplet",
        "recordCount": len(records),
        "sourceCounts": dict(source_counts),
        "sources": {
            "model-comparison": relative_path(root, comparison_path),
            "bridgebench": relative_path(root, bridgebench_path),
            "harbor-terminal-bench": relative_path(root, harbor_path),
        },
        "output": {
            "jsonlPath": relative_path(root, output_path),
            "manifestPath": relative_path(root, manifest_path),
            "markdownPath": relative_path(root, markdown_path),
        },
    }

    manifest_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(build_markdown(summary), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
