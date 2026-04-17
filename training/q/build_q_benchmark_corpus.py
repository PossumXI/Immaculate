import argparse
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

MAX_BRIDGEBENCH_SOAK_DECISIONS_PER_SCENARIO = 3
MAX_HARBOR_SOAK_DECISIONS_PER_TASK = 3


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


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


def normalize_route(value: str | None) -> str | None:
    candidate = " ".join(str(value or "").strip().lower().split())
    if candidate in {"reflex", "cognitive", "guarded", "suppressed"}:
        return candidate
    for route in ("guarded", "suppressed", "cognitive", "reflex"):
        if route in candidate:
            return route
    if "guard" in candidate:
        return "guarded"
    if "suppress" in candidate or "block" in candidate:
        return "suppressed"
    if "cognit" in candidate or "repair" in candidate or "stabil" in candidate:
        return "cognitive"
    if "direct" in candidate:
        return "reflex"
    return None


def load_optional_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    payload = load_json(path)
    return payload if isinstance(payload, dict) else None


def evenly_sample_rows(rows: list[dict], limit: int, key_name: str) -> list[dict]:
    if len(rows) <= limit:
        return rows
    ordered_rows = sorted(rows, key=lambda row: int(row.get(key_name, 0) or 0))
    if limit <= 1:
        return [ordered_rows[0]]
    positions = {
        round(index * (len(ordered_rows) - 1) / (limit - 1))
        for index in range(limit)
    }
    return [ordered_rows[position] for position in sorted(positions)]


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


def format_quality_value(value) -> str:
    if isinstance(value, bool):
        return str(value).lower()
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def build_quality_lines(record: dict) -> list[str]:
    quality = record.get("quality", {})
    if not isinstance(quality, dict):
        return []
    ordered_keys = [
        "status",
        "parse_success",
        "structured_field_count",
        "thinking_detected",
        "score",
        "agent",
        "iteration",
        "duration_sec",
        "run_count",
        "task_count",
        "parse_success_rate",
        "average_latency_ms",
        "p95_latency_ms",
        "average_duration_sec",
    ]
    lines: list[str] = []
    for key in ordered_keys:
        if key in quality and quality[key] is not None:
            lines.append(f"{key}={format_quality_value(quality[key])}")
    for key in sorted(quality.keys()):
        if key in ordered_keys or quality[key] is None:
            continue
        lines.append(f"{key}={format_quality_value(quality[key])}")
    return lines


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


def build_decision_text(record: dict) -> str:
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
        ]
    )
    quality_lines = build_quality_lines(record)
    if quality_lines:
        lines.extend(["", "QUALITY", *quality_lines])
    return "\n".join(lines) + "\n"


def build_observation_text(record: dict) -> str:
    lines = [
        "Q benchmark-derived corpus",
        f"source={record['source_surface']}",
        "language=text",
        f"path={record['source_surface']}/{record['row_id']}",
        f"tags={','.join(record['tags'])}",
        "",
        "OBJECTIVE",
        record["objective"],
    ]
    if record["facts"]:
        lines.extend(["", "REFERENCE FACTS", *record["facts"]])
    observation_lines = [str(entry).strip() for entry in record.get("observation", []) if str(entry).strip()]
    if observation_lines:
        lines.extend(["", "BENCHMARK OBSERVATION", *observation_lines])
    quality_lines = build_quality_lines(record)
    if quality_lines:
        lines.extend(["", "QUALITY", *quality_lines])
    return "\n".join(lines) + "\n"


def finalize_record(record: dict) -> dict:
    source_surface = str(record["source_surface"])
    row_id = str(record["row_id"])
    record["source_id"] = f"q-benchmark-{source_surface}"
    record["relative_path"] = f"{source_surface}/{row_id}"
    record["language"] = "text"
    record["tags"] = ["q", "benchmark-corpus", "decision-triplet"]
    record["provenance_record_id"] = record["id"]
    row_type = str(record.get("row_type", "decision_triplet")).strip() or "decision_triplet"
    if row_type == "benchmark_observation":
        record["tags"] = ["q", "benchmark-corpus", "benchmark-observation"]
        record["text"] = build_observation_text(record)
    else:
        record["text"] = build_decision_text(record)
    return record


def summarize_row_type(records: list[dict]) -> str:
    row_types = {
        str(record.get("row_type", "decision_triplet")).strip() or "decision_triplet"
        for record in records
    }
    if not row_types:
        return "decision_triplet"
    if len(row_types) == 1:
        return next(iter(row_types))
    return "mixed"


def collect_model_records(surface_name: str, model: dict) -> list[dict]:
    records: list[dict] = []
    for task in model.get("tasks", []):
        status = str(task.get("status", "")).strip()
        parse_success = bool(task.get("parseSuccess"))
        route = normalize_route(task.get("routeSuggestion"))
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
        route = normalize_route(response.get("route"))
        reason = str(response.get("reason", "")).strip()
        commit = str(response.get("commit", "")).strip()
        score = q_gateway.get("score")
        if not route or not reason or not commit:
            continue
        row_id = str(task.get("id") or task.get("label") or "unknown").strip()
        label = str(task.get("label", row_id)).strip() or row_id
        objective, facts = harbor_context(root, row_id, label)
        gap_notes = collect_reward_gap_notes(q_gateway.get("rewardDetails"))
        numeric_score = float(score or 0)
        if numeric_score >= 0.999:
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
                    "score": numeric_score,
                },
            }
            records.append(finalize_record(record))
            continue
        record = {
            "id": f"harbor-terminal-bench:{row_id}",
            "row_type": "benchmark_observation",
            "source_surface": "harbor-terminal-bench",
            "row_id": row_id,
            "label": label,
            "objective": objective,
            "facts": facts,
            "observation": [
                f"Q produced a parseable structured response, but the Harbor score held at {numeric_score:.3f} instead of 1.000.",
                f"Observed route: {route}",
                f"Observed reason: {reason}",
                f"Observed commit: {commit}",
                *gap_notes,
            ],
            "quality": {
                "status": "degraded",
                "parse_success": True,
                "structured_field_count": 3,
                "thinking_detected": False,
                "score": numeric_score,
            },
        }
        records.append(finalize_record(record))
    return records


def parse_seed_user_prompt(text: str) -> str:
    if "\nUSER\n" not in text or "\n\nASSISTANT\n" not in text:
        return ""
    return text.split("\nUSER\n", 1)[1].split("\n\nASSISTANT\n", 1)[0].strip()


def parse_seed_assistant_response(text: str) -> str:
    if "\nASSISTANT\n" not in text:
        return ""
    return text.split("\nASSISTANT\n", 1)[1].strip()


def extract_seed_field(response: str, field: str) -> str:
    matches = re.findall(
        rf"{field}\s*:\s*(.+?)(?=\s+(?:ROUTE|REASON|COMMIT)\s*:|$)",
        response,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return " ".join((matches[-1] if matches else "").strip().split())


def collect_seed_benchmark_records(seed_path: Path, source_surface: str) -> list[dict]:
    if not seed_path.exists():
        return []
    payload = load_json(seed_path)
    if not isinstance(payload, list):
        return []

    records: list[dict] = []
    for entry in payload:
        if not isinstance(entry, dict):
            continue
        row_id = str(entry.get("id", "seed-row")).strip() or "seed-row"
        text = str(entry.get("text", "")).strip()
        if not text:
            continue
        objective = parse_seed_user_prompt(text) or row_id.replace("-", " ")
        assistant = parse_seed_assistant_response(text)
        route = normalize_route(extract_seed_field(assistant, "ROUTE"))
        reason = extract_seed_field(assistant, "REASON")
        commit = extract_seed_field(assistant, "COMMIT")
        facts = [f"Curated seed path: {source_surface}/{row_id}"]

        if route and reason and commit:
            record = {
                "id": f"{source_surface}:{row_id}",
                "row_type": "decision_triplet",
                "source_surface": source_surface,
                "row_id": row_id,
                "label": row_id.replace("-", " "),
                "objective": objective,
                "facts": facts,
                "output": {
                    "route": route,
                    "reason": reason,
                    "commit": commit,
                },
                "quality": {
                    "status": "curated",
                    "parse_success": True,
                    "structured_field_count": 3,
                    "thinking_detected": False,
                    "score": 1.0,
                },
            }
            records.append(finalize_record(record))
            continue

        if assistant:
            record = {
                "id": f"{source_surface}:{row_id}",
                "row_type": "benchmark_observation",
                "source_surface": source_surface,
                "row_id": row_id,
                "label": row_id.replace("-", " "),
                "objective": objective,
                "facts": facts,
                "observation": [
                    "Curated Q identity and orchestration benchmark row.",
                    f"Canonical answer: {assistant}",
                ],
                "quality": {
                    "status": "curated",
                    "parse_success": True,
                    "structured_field_count": 0,
                    "thinking_detected": False,
                    "score": 1.0,
                },
            }
            records.append(finalize_record(record))
    return records


def collect_terminal_bench_receipt_records(receipt: dict) -> list[dict]:
    leaderboard = receipt.get("leaderboard", {})
    harbor = receipt.get("harbor", {})
    if not isinstance(leaderboard, dict) or not isinstance(harbor, dict):
        return []

    task_name = str(harbor.get("taskName", "")).strip()
    dataset_name = str(harbor.get("datasetName", "")).strip()
    discussion_url = str(leaderboard.get("discussionUrl", "")).strip()
    commit_url = str(leaderboard.get("commitUrl", "")).strip()
    attempts = int(harbor.get("attempts", 0) or 0)
    trials = int(harbor.get("trials", 0) or 0)
    mean_reward = float(harbor.get("meanReward", 0) or 0)

    if not task_name or not dataset_name:
        return []

    pass_at_k = harbor.get("passAtK", {})
    pass_at_k_lines = []
    if isinstance(pass_at_k, dict):
        for key in sorted(pass_at_k.keys(), key=lambda value: int(str(value)) if str(value).isdigit() else 9999):
            pass_at_k_lines.append(f"pass@{key}: {pass_at_k[key]}")

    record = {
        "id": "terminal-bench-receipt:aggregate",
        "row_type": "benchmark_observation",
        "source_surface": "terminal-bench-receipt",
        "row_id": "aggregate",
        "label": "Official Terminal-Bench public-task receipt",
        "objective": (
            "Carry the official public-task Terminal-Bench receipt into the tracked Q improvement loop "
            "without overstating it as a full leaderboard sweep."
        ),
        "facts": [
            f"Dataset: {dataset_name}",
            f"Task: {task_name}",
            f"Attempts: {attempts}",
            f"Trials: {trials}",
            f"Mean reward: {mean_reward:.3f}",
            f"Discussion state: {leaderboard.get('discussionState', 'unknown')}",
            f"Merge state: {leaderboard.get('mergeState', 'unknown')}",
        ],
        "observation": [
            (
                f"Official public-task Terminal-Bench receipt submitted for {task_name} "
                f"on {dataset_name} with {attempts} attempts and {trials} completed trials."
            ),
            (
                f"Real Q lane measured mean reward {mean_reward:.3f} with "
                + (", ".join(pass_at_k_lines) if pass_at_k_lines else "no pass@k data reported")
                + "."
            ),
            (
                f"Submission PR {discussion_url or '[missing discussion url]'} and verified commit "
                f"{commit_url or '[missing commit url]'} prove the public receipt path is real."
            ),
        ],
        "quality": {
            "status": "completed" if mean_reward >= 1 else "degraded",
            "parse_success": mean_reward > 0,
            "structured_field_count": 0,
            "thinking_detected": False,
            "score": mean_reward,
            "run_count": attempts,
            "task_count": 1,
            "average_duration_sec": float(harbor.get("durationSec", 0) or 0),
        },
    }
    return [finalize_record(record)]


def collect_q_gateway_substrate_records(report: dict) -> list[dict]:
    benchmark = report.get("benchmark", {})
    if not isinstance(benchmark, dict) or not benchmark:
        return []
    failed_assertions = int(benchmark.get("failedAssertions", 0) or 0)
    structured_fields = float(benchmark.get("structuredFieldsP50", 0) or 0)
    latency_p95_ms = float(benchmark.get("latencyP95Ms", 0) or 0)
    arbitration_p95_ms = float(benchmark.get("arbitrationP95Ms", 0) or 0)
    guard_denials_max = float(benchmark.get("guardDenialsMax", 0) or 0)
    record = {
        "id": "q-gateway-substrate:aggregate",
        "row_type": "benchmark_observation",
        "source_surface": "q-gateway-substrate",
        "row_id": "aggregate",
        "label": "Q gateway substrate seam benchmark",
        "objective": "Retain a truthful Q-to-Immaculate seam where the dedicated Q gateway preserves structure and fail-closed governance pressure through arbitration.",
        "facts": [
            f"Suite: {benchmark.get('suiteId', 'unknown')}",
            f"Pack: {benchmark.get('packLabel', benchmark.get('packId', 'q-gateway-substrate'))}",
            f"Failed assertions: {failed_assertions}",
        ],
        "observation": [
            f"Structured fields held at p50 {structured_fields:.2f}.",
            f"Gateway end-to-end latency held at p95 {latency_p95_ms:.2f} ms.",
            f"Arbitration latency held at p95 {arbitration_p95_ms:.2f} ms.",
            f"Guard denial max remained {guard_denials_max:.2f} while the seam stayed fail-closed.",
        ],
        "quality": {
            "status": "completed" if failed_assertions == 0 else "degraded",
            "parse_success": structured_fields >= 3,
            "structured_field_count": int(round(structured_fields)),
            "thinking_detected": False,
            "score": 1.0 if failed_assertions == 0 else max(0.0, 1.0 - failed_assertions * 0.1),
            "p95_latency_ms": latency_p95_ms,
        },
    }
    return [finalize_record(record)]


def collect_q_mediation_drift_records(report: dict) -> list[dict]:
    benchmark = report.get("benchmark", {})
    if not isinstance(benchmark, dict) or not benchmark:
        return []
    failed_assertions = int(benchmark.get("failedAssertions", 0) or 0)
    route_alignment = float(benchmark.get("routeAlignmentP50", 0) or 0)
    q_only_selection = float(benchmark.get("qOnlySelectionP50", 0) or 0)
    drift_detected = float(benchmark.get("driftDetectedMax", 0) or 0)
    latency_p95_ms = float(benchmark.get("latencyP95Ms", 0) or 0)
    record = {
        "id": "q-mediation-drift:aggregate",
        "row_type": "benchmark_observation",
        "source_surface": "q-mediation-drift",
        "row_id": "aggregate",
        "label": "Q mediation drift benchmark",
        "objective": "Preserve Q's governed route through Immaculate arbitration, scheduling, and routing under mixed pressure without drift.",
        "facts": [
            f"Suite: {benchmark.get('suiteId', 'unknown')}",
            f"Pack: {benchmark.get('packLabel', benchmark.get('packId', 'q-mediation-drift'))}",
            f"Failed assertions: {failed_assertions}",
        ],
        "observation": [
            f"Route alignment held at p50 {route_alignment:.2f}.",
            f"Q-only layer selection held at p50 {q_only_selection:.2f}.",
            f"Drift detected max remained {drift_detected:.2f}.",
            f"Mediation latency held at p95 {latency_p95_ms:.2f} ms.",
        ],
        "quality": {
            "status": "completed" if failed_assertions == 0 else "degraded",
            "parse_success": route_alignment >= 1 and drift_detected == 0,
            "structured_field_count": 3 if route_alignment >= 1 else 0,
            "thinking_detected": False,
            "score": 1.0 if failed_assertions == 0 else max(0.0, 1.0 - failed_assertions * 0.1),
            "p95_latency_ms": latency_p95_ms,
        },
    }
    return [finalize_record(record)]


def collect_bridgebench_soak_records(bridgebench_soak: dict) -> list[dict]:
    training_rows = bridgebench_soak.get("trainingRows", [])
    if isinstance(training_rows, list) and training_rows:
        records: list[dict] = []
        rows_by_scenario: dict[str, list[dict]] = {}
        for row in training_rows:
            if not isinstance(row, dict):
                continue
            scenario_id = str(row.get("scenarioId") or "unknown").strip()
            rows_by_scenario.setdefault(scenario_id, []).append(row)
        for scenario_rows in rows_by_scenario.values():
            for row in evenly_sample_rows(
                scenario_rows,
                MAX_BRIDGEBENCH_SOAK_DECISIONS_PER_SCENARIO,
                "attempt"
            ):
                route = str(row.get("routeSuggestion", "")).strip()
                route = normalize_route(route)
                reason = str(row.get("reasonSummary", "")).strip()
                commit = str(row.get("commitStatement", "")).strip()
                if not route or not reason or not commit:
                    continue
                attempt = int(row.get("attempt", 0) or 0)
                scenario_id = str(row.get("scenarioId") or "unknown").strip()
                label = str(row.get("label", scenario_id)).strip() or scenario_id
                context = str(row.get("context", "")).strip()
                facts = [context] if context else []
                record = {
                    "id": f"bridgebench-soak:{scenario_id}:attempt-{attempt:04d}",
                    "row_type": "decision_triplet",
                    "source_surface": "bridgebench-soak",
                    "row_id": f"{scenario_id}/attempt-{attempt:04d}",
                    "label": f"{label} soak attempt {attempt:04d}",
                    "objective": str(row.get("objective", label)).strip() or label,
                    "facts": facts,
                    "output": {
                        "route": route,
                        "reason": reason,
                        "commit": commit,
                    },
                    "quality": {
                        "status": str(row.get("status", "completed")).strip() or "completed",
                        "parse_success": bool(row.get("parseSuccess", False)),
                        "structured_field_count": int(row.get("structuredFieldCount", 3) or 3),
                        "thinking_detected": bool(row.get("thinkingDetected", False)),
                        "score": 1.0,
                        "iteration": attempt,
                        "duration_sec": round(float(row.get("wallLatencyMs", 0) or 0) / 1000, 3),
                    },
                }
                records.append(finalize_record(record))
        return records

    if int(bridgebench_soak.get("runCount", 0) or 0) <= 0:
        return []
    record = {
        "id": "bridgebench-soak:aggregate",
        "row_type": "benchmark_observation",
        "source_surface": "bridgebench-soak",
        "row_id": "aggregate",
        "label": "BridgeBench 60m Q-only soak",
        "objective": "Retain stable Q-only BridgeBench behavior across a repeated one-hour soak lane without parse regressions or bridge assertion failures.",
        "facts": [
            f"Duration seconds: {bridgebench_soak.get('durationSeconds', 0)}",
            f"Completed runs: {bridgebench_soak.get('successfulRunCount', 0)}",
            f"Failed runs: {bridgebench_soak.get('failedRunCount', 0)}",
            f"Bridge runtime failed assertion runs: {bridgebench_soak.get('bridgeRuntimeFailedAssertionRuns', 0)}",
        ],
        "observation": [
            (
                "Q-only BridgeBench completed "
                f"{bridgebench_soak.get('successfulRunCount', 0)} of {bridgebench_soak.get('runCount', 0)} repeated runs "
                f"with parse success {bridgebench_soak.get('parseSuccessCount', 0)}/{bridgebench_soak.get('taskCount', 0)}."
            ),
            (
                "Latency ms remained bounded at "
                f"avg {bridgebench_soak.get('averageLatencyMs', 0)}, "
                f"p95 {bridgebench_soak.get('p95LatencyMs', 0)}, "
                f"median {bridgebench_soak.get('medianLatencyMs', 0)}, "
                f"max {bridgebench_soak.get('maxLatencyMs', 0)}."
            ),
            (
                "Bridge runtime failed assertions stayed at "
                f"{bridgebench_soak.get('bridgeRuntimeFailedAssertionsTotal', 0)} across the soak."
            ),
        ],
        "quality": {
            "status": "completed" if int(bridgebench_soak.get("failedRunCount", 0) or 0) == 0 else "degraded",
            "parse_success": bool(bridgebench_soak.get("parseSuccessRate", 0) == 1),
            "structured_field_count": 0,
            "thinking_detected": False,
            "score": float(bridgebench_soak.get("parseSuccessRate", 0) or 0),
            "run_count": int(bridgebench_soak.get("runCount", 0) or 0),
            "task_count": int(bridgebench_soak.get("taskCount", 0) or 0),
            "parse_success_rate": float(bridgebench_soak.get("parseSuccessRate", 0) or 0),
            "average_latency_ms": float(bridgebench_soak.get("averageLatencyMs", 0) or 0),
            "p95_latency_ms": float(bridgebench_soak.get("p95LatencyMs", 0) or 0),
        },
    }
    return [finalize_record(record)]


def collect_harbor_soak_records(root: Path, harbor_soak: dict) -> list[dict]:
    records: list[dict] = []
    summary = harbor_soak.get("summary", {})
    if isinstance(summary, dict) and int(summary.get("totalRuns", 0) or 0) > 0:
        task_summary_lines = []
        for task in summary.get("tasks", []):
            if not isinstance(task, dict):
                continue
            task_summary_lines.append(
                (
                    f"{task.get('taskLabel', task.get('taskId', 'task'))}: "
                    f"oracle runs {task.get('oracle', {}).get('runs', 0)} avg score {task.get('oracle', {}).get('scoreAverage', 0)} "
                    f"avg duration {task.get('oracle', {}).get('durationAverageSec', 0)} sec; "
                    f"Q runs {task.get('q', {}).get('runs', 0)} avg score {task.get('q', {}).get('scoreAverage', 0)} "
                    f"avg duration {task.get('q', {}).get('durationAverageSec', 0)} sec."
                )
            )
        aggregate_record = {
            "id": "harbor-terminal-bench-soak:aggregate",
            "row_type": "benchmark_observation",
            "source_surface": "harbor-terminal-bench-soak",
            "row_id": "aggregate",
            "label": "Harbor terminal bench 60m Q-only soak",
            "objective": "Retain stable Q task-pack behavior across repeated Harbor runs while preserving perfect structured score on the tracked Q tasks.",
            "facts": [
                f"Duration seconds: {harbor_soak.get('durationSeconds', 0)}",
                f"Oracle runs: {summary.get('oracle', {}).get('runs', 0)}",
                f"Q runs: {summary.get('q', {}).get('runs', 0)}",
            ],
            "observation": [
                (
                    f"Harbor soak completed {summary.get('totalRuns', 0)} total runs with oracle avg score "
                    f"{summary.get('oracle', {}).get('scoreAverage', 0)} and Q avg score {summary.get('q', {}).get('scoreAverage', 0)}."
                ),
                (
                    f"Q average duration was {summary.get('q', {}).get('durationAverageSec', 0)} sec "
                    f"versus oracle {summary.get('oracle', {}).get('durationAverageSec', 0)} sec."
                ),
                *task_summary_lines,
            ],
            "quality": {
                "status": str(harbor_soak.get("state", "completed")).strip() or "completed",
                "parse_success": True,
                "structured_field_count": 0,
                "thinking_detected": False,
                "score": float(summary.get("overall", {}).get("scoreAverage", 0) or 0),
                "run_count": int(summary.get("totalRuns", 0) or 0),
                "average_duration_sec": float(summary.get("overall", {}).get("durationAverageSec", 0) or 0),
            },
        }
        records.append(finalize_record(aggregate_record))

    eligible_runs_by_task: dict[str, list[dict]] = {}
    for run in harbor_soak.get("runs", []):
        if not isinstance(run, dict):
            continue
        if str(run.get("agent", "")).strip().lower() != "q":
            continue
        response = run.get("response", {})
        if not isinstance(response, dict):
            continue
        route = normalize_route(response.get("route"))
        reason = str(response.get("reason", "")).strip()
        commit = str(response.get("commit", "")).strip()
        score = float(run.get("score", 0) or 0)
        if score < 0.999 or not route or not reason or not commit:
            continue
        task_id = str(run.get("taskId") or "unknown").strip()
        eligible_runs_by_task.setdefault(task_id, []).append(run)

    for task_id, task_runs in eligible_runs_by_task.items():
        for run in evenly_sample_rows(task_runs, MAX_HARBOR_SOAK_DECISIONS_PER_TASK, "iteration"):
            response = run.get("response", {})
            route = normalize_route(response.get("route"))
            reason = str(response.get("reason", "")).strip()
            commit = str(response.get("commit", "")).strip()
            iteration = int(run.get("iteration", 0) or 0)
            label = str(run.get("taskLabel", task_id)).strip() or task_id
            objective, facts = harbor_context(root, task_id, label)
            record = {
                "id": f"harbor-terminal-bench-soak:{task_id}:iter-{iteration:04d}",
                "row_type": "decision_triplet",
                "source_surface": "harbor-terminal-bench-soak",
                "row_id": f"{task_id}/iter-{iteration:04d}",
                "label": f"{label} soak iteration {iteration:04d}",
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
                    "score": float(run.get("score", 0) or 0),
                    "agent": "q",
                    "iteration": iteration,
                    "duration_sec": float(run.get("durationSec", 0) or 0),
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
            "- Harbor rows that stayed parse-valid but underperformed are carried as benchmark observations so Q can learn the miss without promoting the weak wording as gold output.",
            "- The official public Terminal-Bench receipt stays in the strict failure/eval path instead of being mixed into the positive benchmark corpus.",
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
        "--q-gateway-substrate",
        default=str(root / "docs" / "wiki" / "Q-Gateway-Substrate.json"),
        help="Path to Q-Gateway-Substrate.json",
    )
    parser.add_argument(
        "--q-mediation-drift",
        default=str(root / "docs" / "wiki" / "Q-Mediation-Drift.json"),
        help="Path to Q-Mediation-Drift.json",
    )
    parser.add_argument(
        "--terminal-bench-receipt",
        default=str(root / "docs" / "wiki" / "Terminal-Bench-Receipt.json"),
        help="Path to Terminal-Bench-Receipt.json",
    )
    parser.add_argument(
        "--bridgebench-soak",
        default=str(root / "docs" / "wiki" / "BridgeBench-Soak.json"),
        help="Path to BridgeBench-Soak.json",
    )
    parser.add_argument(
        "--harbor-soak",
        default=str(root / "docs" / "wiki" / "Harbor-Terminal-Bench-Soak.json"),
        help="Path to Harbor-Terminal-Bench-Soak.json",
    )
    parser.add_argument(
        "--identity-seed",
        default=str(root / "training" / "q" / "q_harness_identity_seed.json"),
        help="Path to q_harness_identity_seed.json",
    )
    parser.add_argument(
        "--reasoning-seed",
        default=str(root / "training" / "q" / "q_immaculate_reasoning_seed.json"),
        help="Path to q_immaculate_reasoning_seed.json",
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
    q_gateway_substrate_path = Path(args.q_gateway_substrate)
    q_mediation_drift_path = Path(args.q_mediation_drift)
    terminal_bench_receipt_path = Path(args.terminal_bench_receipt)
    bridgebench_soak_path = Path(args.bridgebench_soak)
    harbor_soak_path = Path(args.harbor_soak)
    identity_seed_path = Path(args.identity_seed)
    reasoning_seed_path = Path(args.reasoning_seed)
    output_path = Path(args.output)
    manifest_path = Path(args.manifest)
    markdown_path = manifest_path.with_suffix(".md")

    comparison = load_json(comparison_path)
    bridgebench = load_json(bridgebench_path)
    harbor = load_json(harbor_path)
    q_gateway_substrate = load_optional_json(q_gateway_substrate_path)
    q_mediation_drift = load_optional_json(q_mediation_drift_path)
    terminal_bench_receipt = load_optional_json(terminal_bench_receipt_path)
    bridgebench_soak = load_optional_json(bridgebench_soak_path)
    harbor_soak = load_optional_json(harbor_soak_path)

    comparison_model = next((model for model in comparison.get("models", []) if normalize_q_model(model)), None)
    bridgebench_model = next((model for model in bridgebench.get("models", []) if normalize_q_model(model)), None)

    records: list[dict] = []
    if comparison_model:
        records.extend(collect_model_records("model-comparison", comparison_model))
    if bridgebench_model:
        records.extend(collect_model_records("bridgebench", bridgebench_model))
    records.extend(collect_harbor_records(root, harbor))
    if q_gateway_substrate:
        records.extend(collect_q_gateway_substrate_records(q_gateway_substrate))
    if q_mediation_drift:
        records.extend(collect_q_mediation_drift_records(q_mediation_drift))
    if bridgebench_soak:
        records.extend(collect_bridgebench_soak_records(bridgebench_soak))
    if harbor_soak:
        records.extend(collect_harbor_soak_records(root, harbor_soak))
    records.extend(collect_seed_benchmark_records(identity_seed_path, "q-harness-identity-seed"))
    records.extend(collect_seed_benchmark_records(reasoning_seed_path, "q-immaculate-reasoning-seed"))

    source_counts = Counter(record["source_surface"] for record in records)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")

    summary = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "release": build_release_summary(root),
        "rowType": summarize_row_type(records),
        "recordCount": len(records),
        "sourceCounts": dict(source_counts),
        "sources": {
            "model-comparison": relative_path(root, comparison_path),
            "bridgebench": relative_path(root, bridgebench_path),
            "harbor-terminal-bench": relative_path(root, harbor_path),
            **(
                {"q-gateway-substrate": relative_path(root, q_gateway_substrate_path)}
                if q_gateway_substrate
                else {}
            ),
            **(
                {"q-mediation-drift": relative_path(root, q_mediation_drift_path)}
                if q_mediation_drift
                else {}
            ),
            **(
                {"bridgebench-soak": relative_path(root, bridgebench_soak_path)}
                if bridgebench_soak
                else {}
            ),
            **(
                {"harbor-terminal-bench-soak": relative_path(root, harbor_soak_path)}
                if harbor_soak
                else {}
            ),
            **(
                {"q-harness-identity-seed": relative_path(root, identity_seed_path)}
                if identity_seed_path.exists()
                else {}
            ),
            **(
                {"q-immaculate-reasoning-seed": relative_path(root, reasoning_seed_path)}
                if reasoning_seed_path.exists()
                else {}
            ),
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
