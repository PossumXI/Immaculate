import argparse
from datetime import datetime, timezone
import json
import os
import sys
from pathlib import Path


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


try:
    import wandb  # type: ignore
except Exception as exc:  # pragma: no cover - import path validation
    fail(f"Unable to import wandb: {exc}")


def load_report(report_path: Path) -> dict:
    try:
        return json.loads(report_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"Benchmark report not found: {report_path}")
    except json.JSONDecodeError as exc:
        fail(f"Benchmark report is invalid JSON: {exc}")


def coerce_mode(value: str) -> str:
    return value if value in {"online", "offline", "disabled"} else "online"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def benchmark_status_json_path() -> Path:
    return repo_root() / "docs" / "wiki" / "Benchmark-Status.json"


def benchmark_status_markdown_path() -> Path:
    return repo_root() / "docs" / "wiki" / "Benchmark-Status.md"


def build_metrics(report: dict) -> dict:
    metrics = {
        "benchmark/failed_assertions": sum(
            1 for assertion in report.get("assertions", []) if assertion.get("status") == "fail"
        ),
        "benchmark/total_assertions": len(report.get("assertions", [])),
        "benchmark/checkpoint_count": report.get("checkpointCount", 0),
        "benchmark/tick_interval_ms": report.get("tickIntervalMs", 0),
        "benchmark/total_ticks": report.get("totalTicks", 0),
        "benchmark/planned_duration_ms": report.get("plannedDurationMs", 0),
        "benchmark/total_duration_ms": report.get("totalDurationMs", 0),
        "benchmark/recovered": 1 if report.get("recovered") else 0,
        "benchmark/integrity_finding_count": report.get("integrity", {}).get("findingCount", 0),
    }

    for series in report.get("series", []):
        prefix = f"series/{series.get('id', 'unknown')}"
        metrics[f"{prefix}/min"] = series.get("min", 0)
        metrics[f"{prefix}/p50"] = series.get("p50", 0)
        metrics[f"{prefix}/p95"] = series.get("p95", 0)
        metrics[f"{prefix}/p99"] = series.get("p99", 0)
        metrics[f"{prefix}/p999"] = series.get("p999", 0)
        metrics[f"{prefix}/average"] = series.get("average", 0)
        metrics[f"{prefix}/max"] = series.get("max", 0)

    comparison = report.get("comparison") or {}
    metrics["benchmark/comparison_improved_count"] = comparison.get("improvedCount", 0)
    metrics["benchmark/comparison_regressed_count"] = comparison.get("regressedCount", 0)
    metrics["benchmark/comparison_unchanged_count"] = comparison.get("unchangedCount", 0)
    return metrics


def log_tables(run, report: dict) -> None:
    assertions_table = wandb.Table(columns=["assertion", "status", "target", "actual", "detail"])
    for assertion in report.get("assertions", []):
        assertions_table.add_data(
            assertion.get("label", ""),
            assertion.get("status", ""),
            assertion.get("target", ""),
            assertion.get("actual", ""),
            assertion.get("detail", ""),
        )
    run.log({"benchmark/assertions_table": assertions_table})

    progress_table = wandb.Table(columns=["bucket", "item"])
    for item in report.get("progress", {}).get("completed", []):
        progress_table.add_data("completed", item)
    for item in report.get("progress", {}).get("remaining", []):
        progress_table.add_data("remaining", item)
    run.log({"benchmark/progress_table": progress_table})

    comparison = report.get("comparison") or {}
    deltas = comparison.get("deltas") or []
    if deltas:
        delta_table = wandb.Table(columns=["series", "before", "after", "delta", "percent_delta", "trend"])
        for delta in deltas:
            delta_table.add_data(
                delta.get("label", ""),
                delta.get("before", 0),
                delta.get("after", 0),
                delta.get("delta", 0),
                delta.get("percentDelta", 0),
                delta.get("trend", ""),
            )
        run.log({"benchmark/comparison_table": delta_table})


def attach_artifact(run, report: dict, report_json: Path, report_markdown: Path) -> tuple[str, str]:
    attribution = report.get("attribution", {}) or {}
    hardware = report.get("hardwareContext", {}) or {}
    artifact_name = f"immaculate-{report.get('suiteId', 'benchmark')}"
    artifact_type = "benchmark-report"
    artifact = wandb.Artifact(
        artifact_name,
        type=artifact_type,
        metadata={
            "suite_id": report.get("suiteId"),
            "pack_id": report.get("packId"),
            "pack_label": report.get("packLabel"),
            "run_kind": report.get("runKind"),
            "generated_at": report.get("generatedAt"),
            "planned_duration_ms": report.get("plannedDurationMs"),
            "total_duration_ms": report.get("totalDurationMs"),
            "integrity_status": report.get("integrity", {}).get("status"),
            "recovery_mode": report.get("recoveryMode"),
            "owner": attribution.get("owner"),
            "role": attribution.get("role"),
            "website": attribution.get("website"),
            "contributions": attribution.get("contributions") or [],
            "hardware": hardware,
        },
    )
    artifact.add_file(str(report_json))
    if report_markdown.exists():
        artifact.add_file(str(report_markdown))
    run.log_artifact(artifact)
    return artifact_name, artifact_type


def build_status_entry(
    report: dict,
    entity: str,
    project: str,
    run_url: str | None,
    artifact_name: str,
    artifact_type: str,
) -> dict:
    assertions = report.get("assertions", []) or []
    failed_assertions = sum(1 for assertion in assertions if assertion.get("status") == "fail")
    attribution = report.get("attribution", {}) or {}
    return {
        "suiteId": report.get("suiteId"),
        "packId": report.get("packId"),
        "packLabel": report.get("packLabel"),
        "runKind": report.get("runKind"),
        "generatedAt": report.get("generatedAt"),
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "entity": entity,
        "project": project,
        "projectUrl": f"https://wandb.ai/{entity}/{project}",
        "runUrl": run_url,
        "artifactName": artifact_name,
        "artifactType": artifact_type,
        "integrityStatus": report.get("integrity", {}).get("status"),
        "recoveryMode": report.get("recoveryMode"),
        "plannedDurationMs": report.get("plannedDurationMs"),
        "failedAssertions": failed_assertions,
        "totalAssertions": len(assertions),
        "totalDurationMs": report.get("totalDurationMs"),
        "hardwareContext": report.get("hardwareContext"),
        "owner": attribution.get("owner"),
        "role": attribution.get("role"),
        "website": attribution.get("website"),
    }


def render_status_markdown(status: dict) -> str:
    publications = status.get("publications", {}) or {}
    entries = list(publications.values())
    entries.sort(key=lambda entry: str(entry.get("generatedAt") or ""), reverse=True)
    lines = [
        "# Benchmark Status",
        "",
        "This page is the tracked public benchmark surface for Immaculate.",
        "",
        f"- W&B project: {status.get('projectUrl')}",
        f"- Owner: {status.get('owner')}",
        f"- Role: {status.get('role')}",
        f"- Website: {status.get('website')}",
        f"- Updated: {status.get('updatedAt')}",
        "",
        "Raw benchmark ledgers remain generated runtime artifacts under `benchmarks/` and stay out of git.",
        "This page only carries the public summary and links for the latest published run per pack.",
        "",
        "## Latest Public Runs By Pack",
        "",
    ]
    if not entries:
        lines.extend(
            [
                "No public benchmark runs have been published yet.",
                "",
                "Project page: https://wandb.ai/PossumX/immaculate",
            ]
        )
        return "\n".join(lines).rstrip() + "\n"

    for entry in entries:
        lines.extend(
            [
                f"### {entry.get('packLabel') or entry.get('packId') or 'Unknown Pack'}",
                "",
                f"- Suite: `{entry.get('suiteId')}`",
                f"- Generated: `{entry.get('generatedAt')}`",
                f"- Published: `{entry.get('publishedAt')}`",
                f"- Assertions: `{max((entry.get('totalAssertions') or 0) - (entry.get('failedAssertions') or 0), 0)}/{entry.get('totalAssertions') or 0}` passed",
                f"- Run kind: `{entry.get('runKind')}`",
                f"- Integrity: `{entry.get('integrityStatus')}`",
                f"- Recovery mode: `{entry.get('recoveryMode')}`",
                f"- Planned duration: `{entry.get('plannedDurationMs')}` ms",
                f"- Wall-clock duration: `{entry.get('totalDurationMs')}` ms",
                f"- Hardware: `{json.dumps(entry.get('hardwareContext') or {}, separators=(',', ':'))}`",
                f"- W&B run: {entry.get('runUrl') or 'not available'}",
                f"- W&B artifact: `{entry.get('artifactName')}` (`{entry.get('artifactType')}`)",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def update_benchmark_status(
    report: dict,
    entity: str,
    project: str,
    run_url: str | None,
    artifact_name: str,
    artifact_type: str,
) -> tuple[Path, Path]:
    json_path = benchmark_status_json_path()
    markdown_path = benchmark_status_markdown_path()
    json_path.parent.mkdir(parents=True, exist_ok=True)
    existing: dict = {}
    if json_path.exists():
        try:
            existing = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            existing = {}

    publications = existing.get("publications", {}) if isinstance(existing, dict) else {}
    if not isinstance(publications, dict):
        publications = {}

    entry = build_status_entry(report, entity, project, run_url, artifact_name, artifact_type)
    pack_key = str(entry.get("packId") or entry.get("suiteId") or "unknown")
    publications[pack_key] = entry
    attribution = report.get("attribution", {}) or {}
    status = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "entity": entity,
        "project": project,
        "projectUrl": f"https://wandb.ai/{entity}/{project}",
        "owner": attribution.get("owner"),
        "role": attribution.get("role"),
        "website": attribution.get("website"),
        "publications": publications,
    }
    json_path.write_text(f"{json.dumps(status, indent=2)}\n", encoding="utf-8")
    markdown_path.write_text(render_status_markdown(status), encoding="utf-8")
    return markdown_path, json_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish an Immaculate benchmark report to Weights & Biases.")
    parser.add_argument("--report-json", required=True)
    parser.add_argument("--report-markdown", required=True)
    parser.add_argument("--entity", required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--mode", default="online")
    args = parser.parse_args()

    mode = coerce_mode(args.mode)
    if mode == "disabled":
        fail("W&B mode is disabled.")

    report_json = Path(args.report_json).resolve()
    report_markdown = Path(args.report_markdown).resolve()
    report = load_report(report_json)

    run_name = report.get("suiteId") or "immaculate-benchmark"
    tags = [
        "immaculate",
        "benchmark",
        str(report.get("packId", "unknown")),
        str(report.get("recoveryMode", "unknown")),
        str(report.get("integrity", {}).get("status", "unknown")),
    ]

    config = {
        "suite_id": report.get("suiteId"),
        "pack_id": report.get("packId"),
        "pack_label": report.get("packLabel"),
        "run_kind": report.get("runKind"),
        "generated_at": report.get("generatedAt"),
        "recovery_mode": report.get("recoveryMode"),
        "integrity_status": report.get("integrity", {}).get("status"),
        "planned_duration_ms": report.get("plannedDurationMs"),
        "wall_clock_duration_ms": report.get("totalDurationMs"),
        "stage": report.get("progress", {}).get("stage"),
        "hardware_context": report.get("hardwareContext"),
        "owner": report.get("attribution", {}).get("owner"),
        "role": report.get("attribution", {}).get("role"),
        "website": report.get("attribution", {}).get("website"),
    }

    run = wandb.init(
        entity=args.entity,
        project=args.project,
        name=run_name,
        job_type="benchmark-publication",
        tags=tags,
        config=config,
        mode=mode,
    )
    if run is None:
        fail("wandb.init returned no run.")

    run.summary["benchmark/summary_text"] = report.get("summary", "")
    run.summary["benchmark/run_kind"] = report.get("runKind", "")
    run.summary["benchmark/current_stage"] = report.get("progress", {}).get("stage", "")
    run.summary["benchmark/integrity_status"] = report.get("integrity", {}).get("status", "")
    run.summary["benchmark/planned_duration_ms"] = report.get("plannedDurationMs", 0)
    run.summary["benchmark/wall_clock_duration_ms"] = report.get("totalDurationMs", 0)
    run.summary["benchmark/failed_assertions"] = sum(
        1 for assertion in report.get("assertions", []) if assertion.get("status") == "fail"
    )
    run.summary["benchmark/owner"] = report.get("attribution", {}).get("owner", "")
    run.summary["benchmark/role"] = report.get("attribution", {}).get("role", "")
    run.summary["benchmark/website"] = report.get("attribution", {}).get("website", "")
    run.summary["benchmark/project_url"] = f"https://wandb.ai/{args.entity}/{args.project}"
    run.summary["benchmark/hardware"] = json.dumps(report.get("hardwareContext", {}), separators=(",", ":"))

    run.log(build_metrics(report))
    log_tables(run, report)
    artifact_name, artifact_type = attach_artifact(run, report, report_json, report_markdown)
    local_run_dir = str(getattr(run, "dir", "")) or None
    run_url = getattr(run, "url", None)
    benchmark_status_path, benchmark_status_json = update_benchmark_status(
        report, args.entity, args.project, run_url, artifact_name, artifact_type
    )
    run.finish()

    print(
        json.dumps(
            {
                "mode": mode,
                "entity": args.entity,
                "project": args.project,
                "runName": run_name,
                "suiteId": report.get("suiteId"),
                "packId": report.get("packId"),
                "url": run_url,
                "projectUrl": f"https://wandb.ai/{args.entity}/{args.project}",
                "artifactName": artifact_name,
                "artifactType": artifact_type,
                "benchmarkStatusPath": str(benchmark_status_path),
                "benchmarkStatusJsonPath": str(benchmark_status_json),
                "localRunDir": local_run_dir,
            }
        )
    )


if __name__ == "__main__":
    main()
