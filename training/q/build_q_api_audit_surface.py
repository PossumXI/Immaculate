import argparse
import json
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
    latest = summary.get("latestSuccessfulRecord") or {}
    return "\n".join(
        [
            "# Q API Audit",
            "",
            "This page is generated from the live Q public-substrate audit spool. It summarizes the latest successful governed Q calls that reached the real `/api/q/run` path.",
            "",
            f"- Generated: `{summary['generatedAt']}`",
            f"- Source file: `{summary['sourcePath']}`",
            f"- Records: `{summary['recordCount']}`",
            f"- Successful governed calls: `{summary['successfulRecordCount']}`",
            f"- Successful parse-complete calls: `{summary['successfulParseCount']}`",
            f"- Decision traces linked: `{summary['decisionTraceCount']}`",
            f"- Current Q bundle: `{summary['qTrainingBundleId']}`",
            "",
            "## Latest Successful Record",
            "",
            f"- Session: `{latest.get('sessionId', 'n/a')}`",
            f"- Decision trace: `{latest.get('decisionTraceId', 'n/a')}`",
            f"- Trace hash: `{latest.get('decisionTraceHash', 'n/a')}`",
            f"- Policy digest: `{latest.get('policyDigest', 'n/a')}`",
            f"- Evidence digest: `{latest.get('evidenceDigest', 'n/a')}`",
            f"- Model name: `{latest.get('modelName', 'Q')}`",
            f"- Release build: `{latest.get('releaseBuildId', 'n/a')}`",
            f"- Training bundle: `{latest.get('trainingBundleId', 'n/a')}`",
            f"- Status: `{latest.get('status', 'n/a')}`",
            f"- Latency: `{latest.get('latencyMs', 'n/a')}` ms",
            f"- Parse success: `{latest.get('parseSuccess', 'n/a')}`",
            f"- Governance pressure: `{latest.get('governancePressure', 'n/a')}`",
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
    successful_records: list[dict] = []
    successful_parse_count = 0
    decision_trace_count = 0
    for record in records:
        if str(record.get("decisionTraceId", "")).strip():
            decision_trace_count += 1
        if str(record.get("status", "")).strip() == "completed":
            successful_records.append(record)
            if bool(record.get("parseSuccess")):
                successful_parse_count += 1

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

    latest_successful_record = dict(successful_records[-1]) if successful_records else {}
    if latest_successful_record:
        latest_successful_record["modelName"] = (
            str(latest_successful_record.get("modelName") or "Q").strip() or "Q"
        )
        latest_successful_record.pop("alias", None)
    summary = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "sourcePath": str(audit_path.relative_to(root)).replace("\\", "/") if audit_path.exists() else str(audit_path).replace("\\", "/"),
        "recordCount": len(records),
        "successfulRecordCount": len(successful_records),
        "successfulParseCount": successful_parse_count,
        "decisionTraceCount": decision_trace_count,
        "qTrainingBundleId": bundle_id,
        "latestSuccessfulRecord": latest_successful_record,
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
