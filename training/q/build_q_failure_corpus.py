import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_optional_json(path: Path):
    if not path.exists():
        return None
    payload = load_json(path)
    return payload if isinstance(payload, dict) else None


def load_optional_ndjson(path: Path):
    if not path.exists():
        return []
    records = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            records.append(payload)
    return records


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


def length_bucket(value: str) -> str:
    length = len(value.strip())
    if length == 0:
        return "empty"
    if length <= 64:
        return "short"
    if length <= 512:
        return "medium"
    if length <= 2048:
        return "long"
    return "oversized"


def latency_bucket(value: object) -> str:
    try:
        latency_ms = float(value or 0)
    except (TypeError, ValueError):
        return "unknown"
    if latency_ms <= 0:
        return "none"
    if latency_ms < 1000:
        return "subsecond"
    if latency_ms < 10000:
        return "fast"
    if latency_ms < 60000:
        return "slow"
    return "timeout-class"


def q_api_failure_note(failure_class: str) -> str:
    if failure_class == "missing_prompt":
        return "The request reached the governed Q API without any usable prompt text."
    if failure_class == "prompt_too_large":
        return "The request exceeded the bounded prompt/context ceiling before Q inference could start."
    if failure_class == "transport_timeout":
        return "The Q upstream transport timed out before a structured route/reason/commit answer returned."
    return "The governed Q API request failed before producing a valid structured response."


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
        "ROUTE: reflex, cognitive, guarded, or suppressed.\n"
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
        "ROUTE: reflex, cognitive, guarded, or suppressed.\n"
        "REASON: one sentence.\n"
        "COMMIT: one sentence.\n"
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
    lines.extend(["", "OBSERVED FAILURE", *observed_lines, "", "RESPONSE CONTRACT", "ROUTE: reflex, cognitive, guarded, or suppressed.", "REASON: one sentence.", "COMMIT: one sentence."])
    return "\n".join(lines) + "\n"


def build_q_gateway_substrate_failure_text(report: dict, assertion: dict | None, scenario: dict | None) -> str:
    suite_id = str(report.get("benchmark", {}).get("suiteId", "q-gateway-substrate")).strip() or "q-gateway-substrate"
    label = str(report.get("benchmark", {}).get("packLabel", "Q Gateway Substrate")).strip() or "Q Gateway Substrate"
    parts = [
        "Q defensive engineering failure corpus",
        "source=q-gateway-substrate",
        "language=text",
        f"path=q-gateway-substrate/{suite_id}",
        "tags=q,failure-corpus,eval-seed,q-gateway-substrate",
        "",
        "OBJECTIVE",
        f"{label} seam review",
        "",
        "OBSERVED FAILURE",
    ]
    if assertion:
        parts.extend(
            [
                f"failure_class=q_gateway_substrate_assertion_failed:{str(assertion.get('id', 'unknown')).strip() or 'unknown'}",
                f"status={str(assertion.get('status', 'unknown')).strip() or 'unknown'}",
                f"preview={str(assertion.get('actual', '')).strip() or '[no actual summary]'}",
                f"target={str(assertion.get('target', '')).strip() or '[no target summary]'}",
            ]
        )
    if scenario:
        parts.extend(
            [
                f"scenario={str(scenario.get('id', 'unknown')).strip() or 'unknown'}",
                f"parse_success={str(bool(scenario.get('parseSuccess'))).lower()}",
                f"structured_fields={int(scenario.get('structuredFieldCount', 0) or 0)}",
                f"scenario_preview={str(scenario.get('responsePreview', '')).strip() or '[no preview]'}",
            ]
        )
    parts.extend(
        [
            "",
            "RESPONSE CONTRACT",
            "ROUTE: reflex, cognitive, guarded, or suppressed.",
            "REASON: one sentence.",
            "COMMIT: one sentence.",
        ]
    )
    return "\n".join(parts) + "\n"


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
            f"score_delta={max(0.0, 1.0 - score):.3f}",
            f"programmatic_score={float(q_gateway.get('programmaticScore', 0) or 0):.3f}",
            f"llm_judge_score={float(q_gateway.get('llmJudgeScore', 0) or 0):.3f}",
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


def build_q_api_failure_text(record: dict) -> str:
    objective = str(record.get("objective", "")).strip() or "Q API routed task"
    context_preview = str(record.get("contextPreview", "")).strip()
    failure_class = str(record.get("failureClass", "")).strip() or "unknown"
    status = str(record.get("status", "unknown")).strip() or "unknown"
    session_id = str(record.get("sessionId", "q-api-session")).strip() or "q-api-session"
    preview = str(record.get("responsePreview", "")).strip() or "[no preview]"
    route = str(record.get("routeSuggestion", "")).strip()
    reason = str(record.get("reasonSummary", "")).strip()
    commit = str(record.get("commitStatement", "")).strip()
    principal = record.get("principal", {})
    principal_kind = (
        str(principal.get("kind", "")).strip()
        if isinstance(principal, dict)
        else "unknown"
    ) or "unknown"
    latency_ms = int(record.get("latencyMs", 0) or 0)
    observed_lines = [
        f"failure_class={failure_class}",
        f"status={status}",
        f"parse_success={str(bool(record.get('parseSuccess'))).lower()}",
        f"principal_kind={principal_kind}",
        f"latency_ms={latency_ms}",
        f"latency_bucket={latency_bucket(latency_ms)}",
        f"objective_length_bucket={length_bucket(objective)}",
        f"context_length_bucket={length_bucket(context_preview)}",
        f"failure_note={q_api_failure_note(failure_class)}",
        f"preview={preview}",
    ]
    if route:
        observed_lines.append(f"route={route}")
    if reason:
        observed_lines.append(f"reason={reason}")
    if commit:
        observed_lines.append(f"commit={commit}")
    return (
        "Q defensive engineering failure corpus\n"
        "source=q-api-live\n"
        "language=text\n"
        f"path=q-api-live/{session_id}\n"
        "tags=q,failure-corpus,eval-seed,q-api-live\n\n"
        "OBJECTIVE\n"
        f"{objective}\n\n"
        "OBSERVED FAILURE\n"
        + "\n".join(observed_lines)
        + "\n\n"
        "RESPONSE CONTRACT\n"
        "ROUTE: reflex, cognitive, guarded, or suppressed.\n"
        "REASON: one sentence.\n"
        "COMMIT: one sentence.\n"
    )


def build_q_mediation_drift_failure_text(report: dict, assertion: dict | None) -> str:
    benchmark = report.get("benchmark", {})
    suite_id = str(benchmark.get("suiteId", "q-mediation-drift")).strip() or "q-mediation-drift"
    label = str(benchmark.get("packLabel", "Q Mediation Drift")).strip() or "Q Mediation Drift"
    parts = [
        "Q defensive engineering failure corpus",
        "source=q-mediation-drift",
        "language=text",
        f"path=q-mediation-drift/{suite_id}",
        "tags=q,failure-corpus,eval-seed,q-mediation-drift",
        "",
        "OBJECTIVE",
        f"{label} seam review",
        "",
        "OBSERVED FAILURE",
    ]
    if assertion:
        parts.extend(
            [
                f"failure_class=q_mediation_drift_assertion_failed:{str(assertion.get('id', 'unknown')).strip() or 'unknown'}",
                f"status={str(assertion.get('status', 'unknown')).strip() or 'unknown'}",
                f"preview={str(assertion.get('actual', '')).strip() or '[no actual summary]'}",
                f"target={str(assertion.get('target', '')).strip() or '[no target summary]'}",
            ]
        )
    parts.extend(
        [
            "",
            "RESPONSE CONTRACT",
            "ROUTE: reflex, cognitive, guarded, or suppressed.",
            "REASON: one sentence.",
            "COMMIT: one sentence.",
        ]
    )
    return "\n".join(parts) + "\n"


def collect_q_api_audit_records(records: list[dict]):
    collected = []
    resolved_successes = 0
    failure_counter = Counter()
    seen_failure_keys: set[tuple[str, str, str, str, str, str, str]] = set()
    for record in records:
        status = str(record.get("status", "unknown")).strip() or "unknown"
        parse_success = bool(record.get("parseSuccess"))
        route = str(record.get("routeSuggestion", "")).strip()
        reason = str(record.get("reasonSummary", "")).strip()
        commit = str(record.get("commitStatement", "")).strip()
        if status == "completed" and parse_success and route and reason and commit:
            resolved_successes += 1
            continue
        failure_class = str(record.get("failureClass", "")).strip() or "q_api_live_failure"
        dedupe_key = (
            failure_class,
            str(record.get("objective", "")).strip(),
            str(record.get("contextPreview", "")).strip(),
            str(record.get("responsePreview", "")).strip(),
            route,
            reason,
            commit,
        )
        if dedupe_key in seen_failure_keys:
            continue
        seen_failure_keys.add(dedupe_key)
        failure_counter[failure_class] += 1
        collected.append(
            {
                "id": f"q-api-live:{str(record.get('executionId') or record.get('sessionId') or 'unknown').strip()}",
                "source": "q-api-live",
                "label": f"Q API live failure: {str(record.get('objective', 'Q API request')).strip() or 'Q API request'}",
                "status": status,
                "parseSuccess": parse_success,
                "failureClass": failure_class,
                "responsePreview": str(record.get("responsePreview", "")).strip(),
                "evalOnly": True,
                "text": build_q_api_failure_text(record),
            }
        )
    return collected, resolved_successes, dict(failure_counter)


def collect_q_gateway_substrate_records(report: dict | None):
    if not isinstance(report, dict):
        return []
    benchmark = report.get("benchmark", {})
    if not isinstance(benchmark, dict):
        return []
    if int(benchmark.get("failedAssertions", 0) or 0) <= 0:
        return []
    assertion = next(
        (
            entry
            for entry in report.get("assertions", [])
            if isinstance(entry, dict) and str(entry.get("status", "")).strip() == "fail"
        ),
        None,
    )
    return [
        {
            "id": f"q-gateway-substrate:{str(benchmark.get('suiteId', 'unknown')).strip() or 'unknown'}",
            "source": "q-gateway-substrate",
            "label": f"Q gateway substrate failure: {str(benchmark.get('packLabel', 'Q Gateway Substrate')).strip() or 'Q Gateway Substrate'}",
            "status": "failed",
            "parseSuccess": False,
            "failureClass": f"q_gateway_substrate_assertion_failed:{str(assertion.get('id', 'unknown')).strip() if isinstance(assertion, dict) else 'unknown'}",
            "responsePreview": str(assertion.get("actual", "")).strip() if isinstance(assertion, dict) else "",
            "evalOnly": True,
            "text": build_q_gateway_substrate_failure_text(report, assertion, None),
        }
    ]


def collect_q_mediation_drift_records(report: dict | None):
    if not isinstance(report, dict):
        return []
    benchmark = report.get("benchmark", {})
    if not isinstance(benchmark, dict):
        return []
    if int(benchmark.get("failedAssertions", 0) or 0) <= 0:
        return []
    assertion = next(
        (
            entry
            for entry in report.get("assertions", [])
            if isinstance(entry, dict) and str(entry.get("status", "")).strip() == "fail"
        ),
        None,
    )
    return [
        {
            "id": f"q-mediation-drift:{str(benchmark.get('suiteId', 'unknown')).strip() or 'unknown'}",
            "source": "q-mediation-drift",
            "label": f"Q mediation drift failure: {str(benchmark.get('packLabel', 'Q Mediation Drift')).strip() or 'Q Mediation Drift'}",
            "status": "failed",
            "parseSuccess": False,
            "failureClass": f"q_mediation_drift_assertion_failed:{str(assertion.get('id', 'unknown')).strip() if isinstance(assertion, dict) else 'unknown'}",
            "responsePreview": str(assertion.get("actual", "")).strip() if isinstance(assertion, dict) else "",
            "evalOnly": True,
            "text": build_q_mediation_drift_failure_text(report, assertion),
        }
    ]


def collect_records(
    root: Path,
    comparison: dict,
    bridgebench: dict,
    q_gateway_substrate: dict | None,
    q_mediation_drift: dict | None,
    q_api_audit: list[dict],
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

    substrate_records = collect_q_gateway_substrate_records(q_gateway_substrate)
    records.extend(substrate_records)
    for record in substrate_records:
        failure_class = record.get("failureClass")
        if failure_class:
            failure_counter[str(failure_class)] += 1

    mediation_drift_records = collect_q_mediation_drift_records(q_mediation_drift)
    records.extend(mediation_drift_records)
    for record in mediation_drift_records:
        failure_class = record.get("failureClass")
        if failure_class:
            failure_counter[str(failure_class)] += 1

    q_api_records, q_api_resolved_successes, q_api_failure_counts = collect_q_api_audit_records(q_api_audit)
    records.extend(q_api_records)
    resolved_successes += q_api_resolved_successes
    for failure_class, count in q_api_failure_counts.items():
        failure_counter[failure_class] += count

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
            "This page is generated from the tracked direct-Q report surfaces and the live Q API audit spool. "
            "It turns current failures into eval seeds first and keeps them separate "
            "from the resolved-success training path."
        )
    if resolved_successes > 0:
        return (
            "This page is generated from the tracked direct-Q report surfaces and the live Q API audit spool. "
            "The current live failure count is zero, so this failure-only export is empty. "
            "Resolved structured-contract rows are intentionally excluded from this surface."
        )
    return (
        "This page is generated from the tracked direct-Q report surfaces and the live Q API audit spool. "
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
        "--q-gateway-substrate",
        default=str(repo_root() / "docs" / "wiki" / "Q-Gateway-Substrate.json"),
        help="Path to Q-Gateway-Substrate.json",
    )
    parser.add_argument(
        "--q-mediation-drift",
        default=str(repo_root() / "docs" / "wiki" / "Q-Mediation-Drift.json"),
        help="Path to Q-Mediation-Drift.json",
    )
    parser.add_argument(
        "--q-api-audit",
        default=str(repo_root() / ".training-output" / "q" / "q-api-audit.ndjson"),
        help="Path to the live q-api audit NDJSON spool.",
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
    q_gateway_substrate = load_optional_json(Path(args.q_gateway_substrate))
    q_mediation_drift = load_optional_json(Path(args.q_mediation_drift))
    q_api_audit = load_optional_ndjson(Path(args.q_api_audit))
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
        q_gateway_substrate,
        q_mediation_drift,
        q_api_audit,
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
            "qGatewaySubstrate": Path(args.q_gateway_substrate).name if q_gateway_substrate else None,
            "qMediationDrift": Path(args.q_mediation_drift).name if q_mediation_drift else None,
            "qApiAudit": Path(args.q_api_audit).name if q_api_audit else None,
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
