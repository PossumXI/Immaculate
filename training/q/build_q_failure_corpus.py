import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_optional_json(path: Path):
    if not path.exists():
        return None
    payload = load_json(path)
    return payload if isinstance(payload, dict) else None


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


def collect_reward_gap_notes(reward_details: dict | None) -> list[str]:
    if not isinstance(reward_details, dict):
        return []
    notes: list[str] = []
    seen: set[tuple[str, str, str]] = set()
    for entry in reward_details.get("reward", []):
        if not isinstance(entry, dict):
            continue
        kind = str(entry.get("kind", "unknown")).strip() or "unknown"
        for criterion in entry.get("criteria", []):
            if not isinstance(criterion, dict):
                continue
            raw_value = criterion.get("value")
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            if value >= 0.999:
                continue
            description = " ".join(str(criterion.get("description", "")).strip().split())
            reasoning = " ".join(str(criterion.get("reasoning", "")).strip().split())
            if not description:
                description = str(criterion.get("name", "criterion")).strip() or "criterion"
            note_key = (kind, description, reasoning)
            if note_key in seen:
                continue
            seen.add(note_key)
            if reasoning:
                notes.append(f"{kind}: {description} -> {reasoning}")
            else:
                notes.append(f"{kind}: {description} -> scored {value:.3f}")
    return notes


def normalize_q_model(model: dict) -> bool:
    label = str(model.get("truthfulLabel", "")).strip()
    requested = str(model.get("requestedModel", ""))
    return label == "Q" or label.startswith("Q ") or requested.strip().lower() == "q"


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


def build_terminal_bench_failure_text(receipt: dict) -> str:
    leaderboard = receipt.get("leaderboard", {})
    harbor = receipt.get("harbor", {})
    task_name = str(harbor.get("taskName", "terminal-bench-task")).strip() or "terminal-bench-task"
    preview = (
        f"mean_reward={float(harbor.get('meanReward', 0) or 0):.3f}; "
        f"trials={int(harbor.get('trials', 0) or 0)}; "
        f"discussion={str(leaderboard.get('discussionUrl', '')).strip() or '[missing discussion url]'}"
    )


def build_harbor_failure_text(
    task: dict,
    objective: str,
    facts: list[str],
    observed_lines: list[str]
) -> str:
    label = str(task.get("label", "")).strip()
    task_id = str(task.get("id") or label.lower().replace(" ", "-")).strip()
    lines = [
        "Q defensive engineering failure corpus",
        "source=harbor-terminal-bench",
        "language=text",
        f"path=harbor-terminal-bench/{task_id}",
        "tags=q,failure-corpus,eval-seed,harbor-underperformance",
        "",
        "OBJECTIVE",
        objective or label,
    ]
    if facts:
        lines.extend(["", "REFERENCE FACTS", *facts])
    lines.extend(["", "OBSERVED FAILURE", *observed_lines, "", "RESPONSE CONTRACT", "ROUTE: one sentence.", "REASON: one sentence.", "COMMIT: one sentence."])
    return "\n".join(lines) + "\n"
    return (
        "Q defensive engineering failure corpus\n"
        "source=terminal-bench-receipt\n"
        "language=text\n"
        f"path=terminal-bench-receipt/{task_name}\n"
        "tags=q,failure-corpus,eval-seed,terminal-bench-public-receipt\n\n"
        "OBJECTIVE\n"
        f"{task_name}\n\n"
        "OBSERVED FAILURE\n"
        "failure_class=terminal_bench_public_task_underperforming\n"
        "status=official-receipt\n"
        f"preview={preview}\n\n"
        "RESPONSE CONTRACT\n"
        "ROUTE: one sentence.\n"
        "REASON: one sentence.\n"
        "COMMIT: one sentence.\n"
    )


def collect_terminal_bench_receipt_records(receipt: dict):
    leaderboard = receipt.get("leaderboard", {})
    harbor = receipt.get("harbor", {})
    if not isinstance(leaderboard, dict) or not isinstance(harbor, dict):
        return []
    task_name = str(harbor.get("taskName", "")).strip()
    dataset_name = str(harbor.get("datasetName", "")).strip()
    mean_reward = float(harbor.get("meanReward", 0) or 0)
    if not task_name or not dataset_name or mean_reward >= 1:
        return []
    trials = int(harbor.get("trials", 0) or 0)
    preview = (
        f"dataset={dataset_name}; mean_reward={mean_reward:.3f}; trials={trials}; "
        f"discussion={str(leaderboard.get('discussionUrl', '')).strip() or '[missing discussion url]'}"
    )
    return [
        {
            "id": f"terminal-bench-receipt:{task_name}",
            "source": "terminal-bench-receipt",
            "label": f"Official Terminal-Bench receipt: {task_name}",
            "status": "official-receipt",
            "parseSuccess": False,
            "failureClass": "terminal_bench_public_task_underperforming",
            "responsePreview": preview,
            "evalOnly": True,
            "text": build_terminal_bench_failure_text(receipt),
        }
    ]


def collect_harbor_records(root: Path, harbor: dict):
    records = []
    for task in harbor.get("tasks", []):
        if not isinstance(task, dict):
            continue
        q_gateway = task.get("qGateway", {})
        if not isinstance(q_gateway, dict):
            continue
        score = float(q_gateway.get("score", 0) or 0)
        if score >= 0.999:
            continue
        response = q_gateway.get("response", {})
        if not isinstance(response, dict):
            response = {}
        route = str(response.get("route", "")).strip()
        reason = str(response.get("reason", "")).strip()
        commit = str(response.get("commit", "")).strip()
        row_id = str(task.get("id") or task.get("label") or "unknown").strip()
        label = str(task.get("label", row_id)).strip() or row_id
        objective, facts = harbor_context(root, row_id, label)
        gap_notes = collect_reward_gap_notes(q_gateway.get("rewardDetails"))
        observed_lines = [
            "failure_class=harbor_structured_underperforming",
            "status=completed_but_under_target",
            f"score={score:.3f}",
            f"preview=route={route or '[missing]'}; reason={reason or '[missing]'}; commit={commit or '[missing]'}",
            *gap_notes,
        ]
        records.append(
            {
                "id": f"harbor-terminal-bench:{row_id}",
                "source": "harbor-terminal-bench",
                "label": f"Harbor underperformance: {label}",
                "status": "completed_but_under_target",
                "parseSuccess": bool(route and reason and commit),
                "failureClass": "harbor_structured_underperforming",
                "responsePreview": "; ".join(observed_lines[:4]),
                "evalOnly": True,
                "text": build_harbor_failure_text(task, objective, facts, observed_lines),
            }
        )
    return records


def collect_records(
    root: Path,
    comparison: dict,
    bridgebench: dict,
    terminal_bench_receipt: dict | None,
    harbor: dict | None
):
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

    if terminal_bench_receipt:
        receipt_records = collect_terminal_bench_receipt_records(terminal_bench_receipt)
        records.extend(receipt_records)
        for record in receipt_records:
            failure_class = record.get("failureClass")
            if failure_class:
                failure_counter[str(failure_class)] += 1

    if harbor:
        harbor_records = collect_harbor_records(root, harbor)
        records.extend(harbor_records)
        for record in harbor_records:
            failure_class = record.get("failureClass")
            if failure_class:
                failure_counter[str(failure_class)] += 1

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
    root = repo_root()
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
        "--terminal-bench-receipt",
        default=str(repo_root() / "docs" / "wiki" / "Terminal-Bench-Receipt.json"),
        help="Path to Terminal-Bench-Receipt.json",
    )
    parser.add_argument(
        "--harbor",
        default=str(repo_root() / "docs" / "wiki" / "Harbor-Terminal-Bench.json"),
        help="Path to Harbor-Terminal-Bench.json",
    )
    parser.add_argument(
        "--manifest",
        default=str(repo_root() / "docs" / "wiki" / "Q-Failure-Corpus.json"),
        help="Summary manifest JSON path",
    )
    args = parser.parse_args()

    comparison = load_json(Path(args.comparison))
    bridgebench = load_json(Path(args.bridgebench))
    terminal_bench_receipt = load_optional_json(Path(args.terminal_bench_receipt))
    harbor = load_optional_json(Path(args.harbor))
    output_path = Path(args.output)
    manifest_path = Path(args.manifest)
    markdown_path = manifest_path.with_suffix(".md")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    records, resolved_successes, failure_counts = collect_records(
        root,
        comparison,
        bridgebench,
        terminal_bench_receipt,
        harbor
    )
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
            "terminalBenchReceipt": Path(args.terminal_bench_receipt).name if terminal_bench_receipt else None,
            "harborTerminalBench": Path(args.harbor).name if harbor else None,
        },
        "output": {
            "jsonlPath": str(output_path.relative_to(root)).replace("\\", "/"),
            "manifestPath": str(manifest_path.relative_to(root)).replace("\\", "/"),
            "markdownPath": str(markdown_path.relative_to(root)).replace("\\", "/"),
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
