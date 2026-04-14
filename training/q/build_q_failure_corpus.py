import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_q_model(model: dict) -> bool:
    label = str(model.get("truthfulLabel", ""))
    requested = str(model.get("requestedModel", ""))
    return label.startswith("Q ") or requested.strip().lower() == "q"


def build_failure_text(source: str, task: dict) -> str:
    label = str(task.get("label", "")).strip()
    preview = str(task.get("responsePreview", "")).strip()
    failure_class = str(task.get("failureClass", "")).strip() or "unknown"
    status = str(task.get("status", "unknown")).strip() or "unknown"
    task_id = task.get("taskId") or task.get("scenarioId") or label.lower().replace(" ", "-")
    title = "Q defensive engineering failure corpus"
    tags = "q,failure-corpus,eval-seed"
    observed_heading = "OBSERVED FAILURE"
    observed_lines = [
        f"failure_class={failure_class}",
        f"status={status}",
        f"preview={preview or '[no preview]'}",
    ]
    return (
        f"{title}\n"
        f"source={source}\n"
        "language=text\n"
        f"path={source}/{task_id}\n"
        f"tags={tags}\n\n"
        "OBJECTIVE\n"
        f"{label}\n\n"
        f"{observed_heading}\n"
        + "\n".join(observed_lines)
        + "\n\n"
        "RESPONSE CONTRACT\n"
        "ROUTE: one sentence.\n"
        "REASON: one sentence.\n"
        "COMMIT: one sentence.\n"
    )


def collect_records(comparison: dict, bridgebench: dict):
    records = []
    resolved_successes = 0
    failure_counter = Counter()

    q_comparison = next((model for model in comparison.get("models", []) if normalize_q_model(model)), None)
    q_bridge = next((model for model in bridgebench.get("models", []) if normalize_q_model(model)), None)

    for source_name, model, task_key in [
        ("model-comparison", q_comparison, "tasks"),
        ("bridgebench", q_bridge, "tasks"),
    ]:
        if not model:
            continue
        for task in model.get(task_key, []):
            status = str(task.get("status", "unknown"))
            parse_success = bool(task.get("parseSuccess"))
            if status == "completed" and parse_success:
                resolved_successes += 1
                continue
            failure_class = task.get("failureClass")
            record = {
                "id": f"{source_name}:{task.get('taskId') or task.get('scenarioId')}",
                "source": source_name,
                "label": task.get("label"),
                "status": status,
                "parseSuccess": parse_success,
                "failureClass": failure_class,
                "responsePreview": task.get("responsePreview"),
                "evalOnly": True,
                "text": build_failure_text(source_name, task),
            }
            if failure_class:
                failure_counter[failure_class] += 1
            records.append(record)

    return records, resolved_successes, dict(failure_counter)


def build_intro(eval_seed_count: int, resolved_successes: int) -> str:
    if eval_seed_count > 0:
        return (
            "This page is generated from the tracked direct-Q report surfaces. "
            "It turns current failures into eval seeds first and keeps them separate "
            "from the resolved-success training path."
        )
    if resolved_successes > 0:
        return (
            "This page is generated from the tracked direct-Q report surfaces. "
            "The current live failure count is zero, so this failure-only export is empty. "
            "Resolved structured-contract rows are intentionally excluded from this surface."
        )
    return (
        "This page is generated from the tracked direct-Q report surfaces. "
        "There are currently no live failure seeds to export."
    )


def main():
    parser = argparse.ArgumentParser(description="Build Q failure corpus from live report surfaces.")
    parser.add_argument(
        "--comparison",
        default=str(repo_root() / "docs" / "wiki" / "Model-Benchmark-Comparison.json"),
        help="Path to Model-Benchmark-Comparison.json",
    )
    parser.add_argument(
        "--bridgebench",
        default=str(repo_root() / "docs" / "wiki" / "BridgeBench.json"),
        help="Path to BridgeBench.json",
    )
    parser.add_argument(
        "--output",
        default=str(repo_root() / ".training-output" / "q" / "q-failure-corpus.jsonl"),
        help="Output JSONL path",
    )
    parser.add_argument(
        "--manifest",
        default=str(repo_root() / "docs" / "wiki" / "Q-Failure-Corpus.json"),
        help="Summary manifest JSON path",
    )
    args = parser.parse_args()

    comparison = load_json(Path(args.comparison))
    bridgebench = load_json(Path(args.bridgebench))
    output_path = Path(args.output)
    manifest_path = Path(args.manifest)
    markdown_path = manifest_path.with_suffix(".md")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    records, resolved_successes, failure_counts = collect_records(comparison, bridgebench)
    eval_seed_count = len(records)

    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")

    summary = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "recordCount": len(records),
        "evalSeedCount": eval_seed_count,
        "resolvedSuccessCount": resolved_successes,
        "failureClassCounts": failure_counts,
        "sources": {
            "modelComparison": Path(args.comparison).name,
            "bridgeBench": Path(args.bridgebench).name,
        },
        "output": {
            "jsonlPath": str(output_path.relative_to(repo_root())).replace("\\", "/"),
            "manifestPath": str(manifest_path.relative_to(repo_root())).replace("\\", "/"),
            "markdownPath": str(markdown_path.relative_to(repo_root())).replace("\\", "/"),
        },
    }

    manifest_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    intro = build_intro(eval_seed_count, resolved_successes)

    markdown_path.write_text(
        "\n".join(
            [
                "# Q Failure Corpus",
                "",
                intro,
                "",
                f"- Generated: {summary['generatedAt']}",
                f"- Records: `{summary['recordCount']}`",
                f"- Eval seeds: `{summary['evalSeedCount']}`",
                f"- Resolved successes excluded: `{summary['resolvedSuccessCount']}`",
                f"- Failure classes: `{json.dumps(summary['failureClassCounts'])}`",
                f"- JSONL: `{summary['output']['jsonlPath']}`",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
