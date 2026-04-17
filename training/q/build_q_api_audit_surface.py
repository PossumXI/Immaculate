import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_audit_records(path: Path) -> list[dict]:
    if not path.exists():
        return []
    records: list[dict] = []
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


def render_markdown(summary: dict) -> str:
    latest = summary.get("latestRecord") or {}
    return "\n".join(
        [
            "# Q API Audit",
            "",
            "This page is generated from the live Q public-substrate audit spool. It is the first feedback-loop surface for real Q calls that reached the governed `/api/q/run` path.",
            "",
            f"- Generated: `{summary['generatedAt']}`",
            f"- Source file: `{summary['sourcePath']}`",
            f"- Records: `{summary['recordCount']}`",
            f"- Completed: `{summary['completedCount']}`",
            f"- Failed: `{summary['failedCount']}`",
            f"- Parse success: `{summary['parseSuccessCount']}`",
            f"- Failure classes: `{json.dumps(summary['failureClassCounts'])}`",
            f"- Current Q bundle: `{summary['qTrainingBundleId']}`",
            "",
            "## Latest Record",
            "",
            f"- Session: `{latest.get('sessionId', 'n/a')}`",
            f"- Model name: `{latest.get('modelName', 'Q')}`",
            f"- Status: `{latest.get('status', 'n/a')}`",
            f"- Failure class: `{latest.get('failureClass', 'none')}`",
            f"- Latency: `{latest.get('latencyMs', 'n/a')}` ms",
            f"- Parse success: `{latest.get('parseSuccess', 'n/a')}`",
            f"- Preview: {latest.get('responsePreview', '[none]')}",
        ]
    ) + "\n"


def main():
    root = repo_root()
    parser = argparse.ArgumentParser(description="Build Q API audit summary from the live q-api audit spool.")
    parser.add_argument(
        "--audit",
        default=str(root / ".training-output" / "q" / "q-api-audit.ndjson"),
        help="Path to the q-api audit NDJSON spool.",
    )
    parser.add_argument(
        "--training-lock",
        default=str(root / ".training-output" / "q" / "latest-training-lock.json"),
        help="Path to latest-training-lock.json.",
    )
    parser.add_argument(
        "--manifest",
        default=str(root / "docs" / "wiki" / "Q-API-Audit.json"),
        help="Output manifest path.",
    )
    args = parser.parse_args()

    audit_path = Path(args.audit)
    manifest_path = Path(args.manifest)
    markdown_path = manifest_path.with_suffix(".md")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    records = load_audit_records(audit_path)
    failure_classes = Counter()
    completed_count = 0
    failed_count = 0
    parse_success_count = 0
    for record in records:
        if bool(record.get("parseSuccess")):
            parse_success_count += 1
        if str(record.get("status", "")).strip() == "completed":
            completed_count += 1
        else:
            failed_count += 1
        failure_class = str(record.get("failureClass", "")).strip()
        if failure_class:
            failure_classes[failure_class] += 1

    bundle_id = "none generated yet"
    training_lock_path = Path(args.training_lock)
    if training_lock_path.exists():
        try:
            bundle_id = (
                str(json.loads(training_lock_path.read_text(encoding="utf-8")).get("bundleId", "")).strip()
                or bundle_id
            )
        except Exception:
            pass

    latest_record = dict(records[-1]) if records else {}
    if latest_record:
        latest_record["modelName"] = str(latest_record.get("modelName") or "Q").strip() or "Q"
        latest_record.pop("alias", None)
    summary = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourcePath": str(audit_path.relative_to(root)).replace("\\", "/") if audit_path.exists() else str(audit_path).replace("\\", "/"),
        "recordCount": len(records),
        "completedCount": completed_count,
        "failedCount": failed_count,
        "parseSuccessCount": parse_success_count,
        "failureClassCounts": dict(failure_classes),
        "qTrainingBundleId": bundle_id,
        "latestRecord": latest_record,
        "output": {
            "manifestPath": str(manifest_path.relative_to(root)).replace("\\", "/"),
            "markdownPath": str(markdown_path.relative_to(root)).replace("\\", "/"),
        },
    }

    manifest_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(summary), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
