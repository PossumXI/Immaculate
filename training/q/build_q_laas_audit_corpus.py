import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / ".training-output" / "q" / "q-laas-audit-corpus.jsonl"

SENSITIVE_METADATA_KEY_FRAGMENTS = (
    "api_key",
    "apikey",
    "authorization",
    "bearer",
    "biometric",
    "embedding",
    "face",
    "facial",
    "image_path",
    "license-plate",
    "license_plate",
    "name",
    "password",
    "person_id",
    "plate",
    "raw_frame",
    "raw_image",
    "secret",
    "subject",
    "token",
    "tracking",
    "video_path",
    "watchlist",
)

SENSITIVE_METADATA_VALUE_FRAGMENTS = (
    "api_key=",
    "bearer ",
    "biometric",
    "embedding_vector",
    "face_embedding",
    "facial-recognition",
    "facial_recognition",
    "license plate",
    "license-plate",
    "license_plate",
    "person_id",
    "secret=",
    "tracking_id",
    "watchlist",
)

BLOCKED_PERSON_RISK_LABELS = (
    "bad_actor",
    "criminal",
    "hostile_person",
    "suspect",
    "target_person",
)

FORBIDDEN_RECORD_FIELDS = (
    "action",
    "clearance",
    "input_data",
    "requester",
    "signature",
)


class CorpusError(Exception):
    pass


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise CorpusError(f"{path} is not valid JSON: {exc}") from exc


def http_get_json(url: str, api_token: str | None, timeout: float) -> Any:
    headers = {
        "Accept": "application/json",
        "User-Agent": "immaculate-q-laas-audit-corpus/1.0",
    }
    if api_token:
        headers["Authorization"] = f"Bearer {api_token}"
        headers["x-arobi-access-token"] = api_token

    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise CorpusError(f"failed to fetch {url}: HTTP {exc.code} {detail}") from exc
    except urllib.error.URLError as exc:
        raise CorpusError(f"failed to fetch {url}: {exc.reason}") from exc

    try:
        return json.loads(body.decode("utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise CorpusError(f"{url} returned non-JSON data: {exc}") from exc


def training_route_url(base_url: str, path: str, include_internal: bool) -> str:
    base = base_url.rstrip("/")
    query = urllib.parse.urlencode({"include_internal": "true"}) if include_internal else ""
    return f"{base}{path}{'?' + query if query else ''}"


def fetch_laas_payload(base_url: str, include_internal: bool, api_token: str | None, timeout: float) -> tuple[dict, dict, dict]:
    manifest_url = training_route_url(base_url, "/api/v1/audit/training-corpus/manifest", include_internal)
    corpus_url = training_route_url(base_url, "/api/v1/audit/training-corpus", include_internal)
    manifest_receipt = http_get_json(manifest_url, api_token=api_token, timeout=timeout)
    payload = http_get_json(corpus_url, api_token=api_token, timeout=timeout)
    return payload, manifest_receipt, {"kind": "http", "manifest": manifest_url, "corpus": corpus_url}


def extract_manifest_receipt(payload: Any) -> dict:
    if isinstance(payload, dict) and isinstance(payload.get("receipt"), dict):
        return payload["receipt"]
    if isinstance(payload, dict) and "records_sha256" in payload:
        return payload
    raise CorpusError("manifest response did not include a Q training receipt")


def manifest_counter(manifest: dict, key: str) -> int:
    value = manifest.get(key, 0)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    raise CorpusError(f"manifest.{key} must be an integer")


def lane_summary(manifest: dict, lane_id: str) -> dict:
    summaries = manifest.get("lane_summaries")
    if not isinstance(summaries, list):
        raise CorpusError("manifest.lane_summaries must be present")
    for summary in summaries:
        if isinstance(summary, dict) and str(summary.get("lane_id", "")).lower() == lane_id:
            return summary
    raise CorpusError(f"manifest.lane_summaries is missing {lane_id}")


def record_lane(record: dict) -> dict:
    lane = record.get("lane")
    if not isinstance(lane, dict):
        raise CorpusError(f"record {record.get('entry_id', '<unknown>')} is missing lane policy")
    return lane


def validate_metadata(metadata: Any, *, public_redacted: bool, entry_id: str) -> dict[str, str]:
    if metadata is None:
        return {}
    if not isinstance(metadata, dict):
        raise CorpusError(f"record {entry_id} metadata must be an object")

    cleaned: dict[str, str] = {}
    for raw_key, raw_value in metadata.items():
        key = str(raw_key)
        value = str(raw_value)
        key_lower = key.lower()
        value_lower = value.lower()
        if any(fragment in key_lower for fragment in SENSITIVE_METADATA_KEY_FRAGMENTS):
            raise CorpusError(f"record {entry_id} contains sensitive metadata key {key}")
        if any(fragment in value_lower for fragment in SENSITIVE_METADATA_VALUE_FRAGMENTS):
            raise CorpusError(f"record {entry_id} contains sensitive metadata value in {key}")
        if any(fragment in value_lower for fragment in BLOCKED_PERSON_RISK_LABELS):
            raise CorpusError(f"record {entry_id} contains person-risk label in {key}")
        cleaned[key] = value
    return cleaned


def validate_records(records: Any, *, include_internal: bool) -> tuple[list[dict], int]:
    if not isinstance(records, list):
        raise CorpusError("training corpus response records must be a list")

    validated: list[dict] = []
    zero_zero_rejected = 0
    for raw_record in records:
        if not isinstance(raw_record, dict):
            raise CorpusError("training corpus records must be objects")

        entry_id = str(raw_record.get("entry_id") or "<unknown>")
        for field in FORBIDDEN_RECORD_FIELDS:
            if field in raw_record:
                raise CorpusError(f"record {entry_id} contains forbidden export field {field}")

        lane = record_lane(raw_record)
        lane_id = str(lane.get("lane_id", "")).strip().lower()
        training_policy = str(lane.get("training_policy", "")).strip().lower()
        if lane_id in {"00", "zero-zero", "private-00"} or training_policy == "blocked":
            zero_zero_rejected += 1
            raise CorpusError(f"record {entry_id} belongs to zero-zero or blocked lane")
        if training_policy == "allowed-internal" and not include_internal:
            raise CorpusError(f"record {entry_id} is internal but include_internal was not requested")
        if training_policy not in {"allowed-redacted", "allowed-internal"}:
            raise CorpusError(f"record {entry_id} has unsupported training policy {training_policy}")
        if raw_record.get("integrity_verified") is not True:
            raise CorpusError(f"record {entry_id} is not integrity verified")

        public_redacted = training_policy == "allowed-redacted"
        reasoning = raw_record.get("reasoning")
        if public_redacted and reasoning not in (None, ""):
            raise CorpusError(f"public record {entry_id} still contains reasoning")

        cleaned = dict(raw_record)
        cleaned["metadata"] = validate_metadata(
            raw_record.get("metadata", {}),
            public_redacted=public_redacted,
            entry_id=entry_id,
        )
        validated.append(cleaned)

    return validated, zero_zero_rejected


def validate_payload(payload: Any, manifest_receipt_payload: Any | None, *, include_internal: bool) -> tuple[list[dict], dict, dict, int]:
    if not isinstance(payload, dict):
        raise CorpusError("training corpus response must be a JSON object")

    records, zero_zero_rejected = validate_records(payload.get("records"), include_internal=include_internal)
    receipt = extract_manifest_receipt(payload)
    manifest_receipt = extract_manifest_receipt(manifest_receipt_payload) if manifest_receipt_payload is not None else None
    manifest = payload.get("manifest") or receipt.get("manifest")
    if not isinstance(manifest, dict):
        raise CorpusError("training corpus response is missing manifest")

    if manifest_receipt is not None:
        for key in ("records_sha256", "records_total", "include_internal"):
            if manifest_receipt.get(key) != receipt.get(key):
                raise CorpusError(f"manifest receipt {key} does not match corpus receipt")

    expected_hash = canonical_sha256(records)
    if receipt.get("records_sha256") != expected_hash:
        raise CorpusError("receipt records_sha256 does not match canonical sanitized records")
    if int(receipt.get("records_total", -1)) != len(records):
        raise CorpusError("receipt records_total does not match record count")
    if manifest_counter(manifest, "exported_total") != len(records):
        raise CorpusError("manifest exported_total does not match record count")
    if bool(receipt.get("include_internal", False)) != bool(include_internal):
        raise CorpusError("receipt include_internal does not match requested mode")
    if bool(manifest.get("include_internal", False)) != bool(include_internal):
        raise CorpusError("manifest include_internal does not match requested mode")

    zero_zero = lane_summary(manifest, "zero-zero")
    if int(zero_zero.get("exported_total", 0)) != 0:
        raise CorpusError("zero-zero lane summary exported records into the training corpus")

    boundary = str(receipt.get("boundary_contract", ""))
    if "manifest" not in boundary:
        raise CorpusError("receipt boundary_contract is not a manifest-derived contract")

    return records, receipt, manifest, zero_zero_rejected


def compact_metadata(metadata: dict[str, str]) -> str:
    if not metadata:
        return "none"
    return "; ".join(f"{key}={metadata[key]}" for key in sorted(metadata))


def compact_list(value: Any) -> str:
    if isinstance(value, list):
        return "; ".join(str(item) for item in value if str(item).strip()) or "none"
    if value is None:
        return "none"
    return str(value)


def render_record_text(record: dict) -> str:
    lane = record_lane(record)
    metadata = validate_metadata(
        record.get("metadata", {}),
        public_redacted=str(lane.get("training_policy", "")).lower() == "allowed-redacted",
        entry_id=str(record.get("entry_id") or "<unknown>"),
    )
    reasoning = record.get("reasoning")
    reasoning_line = ""
    if reasoning:
        reasoning_line = f"\n- internal reasoning: {str(reasoning).strip()}"

    return (
        "Arobi LaaS audited decision for Q training.\n"
        f"- entry: {record.get('entry_id')}\n"
        f"- lane: {lane.get('lane_id')} / {lane.get('training_policy')} / {lane.get('export_scope')}\n"
        f"- source: {record.get('decision_source')} / {record.get('decision_type')}\n"
        f"- model: {record.get('model_id')} {record.get('model_version')}\n"
        f"- input summary: {record.get('input_summary')}\n"
        f"- decision: {record.get('decision')}\n"
        f"- confidence: {record.get('confidence')} ({record.get('confidence_level')})\n"
        f"- factors: {compact_list(record.get('factors'))}\n"
        f"- subsystems: {compact_list(record.get('subsystems'))}\n"
        f"- metadata: {compact_metadata(metadata)}"
        f"{reasoning_line}\n"
        "- Q lesson: use this only as governed audit evidence, respect the lane policy, preserve uncertainty, and escalate human-subject safety observations for review without inferring persistent identity or cross-session tracking."
    )


def build_rows(records: list[dict], receipt: dict) -> list[dict]:
    rows: list[dict] = []
    for record in records:
        lane = record_lane(record)
        entry_id = str(record.get("entry_id") or "unknown")
        lane_id = str(lane.get("lane_id") or "unknown")
        training_policy = str(lane.get("training_policy") or "unknown")
        rows.append(
            {
                "text": render_record_text(record),
                "source_id": f"laas-audit:{entry_id}",
                "relative_path": f"arobi-network:/api/v1/audit/training-corpus#{entry_id}",
                "language": "text",
                "tags": [
                    "q",
                    "laas",
                    "audit",
                    "arobi-network",
                    lane_id,
                    training_policy,
                    "receipt-verified",
                ],
                "provenance_record_id": record.get("entry_hash") or entry_id,
                "metadata": {
                    "entry_id": entry_id,
                    "lane_id": lane_id,
                    "training_policy": training_policy,
                    "receipt_id": receipt.get("receipt_id"),
                    "records_sha256": receipt.get("records_sha256"),
                    "migration_id": lane.get("migration_id"),
                },
            }
        )
    return rows


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")


def write_manifest(
    path: Path,
    *,
    source: dict,
    output_path: Path,
    rows: list[dict],
    receipt: dict,
    manifest: dict,
    zero_zero_rejected: int,
) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    output_sha = sha256_file(output_path)
    result = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": source,
        "includeInternal": bool(receipt.get("include_internal", False)),
        "receipt": {
            "id": receipt.get("receipt_id"),
            "recordsTotal": receipt.get("records_total"),
            "recordsSha256": receipt.get("records_sha256"),
            "boundaryContract": receipt.get("boundary_contract"),
            "migrationId": manifest.get("migration_id"),
        },
        "arobiManifest": manifest,
        "output": {
            "path": str(output_path.relative_to(ROOT)).replace("\\", "/")
            if output_path.is_relative_to(ROOT)
            else str(output_path),
            "rowCount": len(rows),
            "sha256": output_sha,
        },
        "safety": {
            "zeroZeroRecordsRejected": zero_zero_rejected,
            "zeroZeroExported": int(lane_summary(manifest, "zero-zero").get("exported_total", 0)),
            "blockedRecordFields": list(FORBIDDEN_RECORD_FIELDS),
            "sensitiveMetadataPolicy": "fail-closed",
        },
    }
    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Q supplemental corpus from Arobi LaaS governed training-corpus receipts."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--base-url", help="Arobi Network base URL, for example http://127.0.0.1:3030")
    source.add_argument("--corpus-file", help="Local JSON response from /api/v1/audit/training-corpus")
    parser.add_argument("--manifest-file", help="Optional local JSON response from /api/v1/audit/training-corpus/manifest")
    parser.add_argument("--api-token", default=os.getenv("AROBI_API_TOKEN"), help="Arobi API token. Defaults to AROBI_API_TOKEN.")
    parser.add_argument("--include-internal", action="store_true", help="Include private allowed-internal records from LaaS.")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP timeout in seconds.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output Q supplemental JSONL path.")
    parser.add_argument("--manifest-output", help="Output manifest path. Defaults to <output stem>.manifest.json.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output)
    manifest_output_path = (
        Path(args.manifest_output)
        if args.manifest_output
        else output_path.with_name(f"{output_path.stem}.manifest.json")
    )

    try:
        if args.base_url:
            payload, manifest_receipt, source = fetch_laas_payload(
                args.base_url,
                include_internal=args.include_internal,
                api_token=args.api_token,
                timeout=args.timeout,
            )
        else:
            corpus_path = Path(args.corpus_file)
            payload = load_json(corpus_path)
            manifest_receipt = load_json(Path(args.manifest_file)) if args.manifest_file else None
            source = {
                "kind": "file",
                "corpus": str(corpus_path),
                "manifest": str(args.manifest_file) if args.manifest_file else None,
            }

        records, receipt, manifest, zero_zero_rejected = validate_payload(
            payload,
            manifest_receipt,
            include_internal=args.include_internal,
        )
        rows = build_rows(records, receipt)
        write_jsonl(output_path, rows)
        generated_manifest = write_manifest(
            manifest_output_path,
            source=source,
            output_path=output_path,
            rows=rows,
            receipt=receipt,
            manifest=manifest,
            zero_zero_rejected=zero_zero_rejected,
        )
    except CorpusError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print(
        json.dumps(
            {
                "accepted": True,
                "rows": len(rows),
                "output": str(output_path),
                "manifest_output": str(manifest_output_path),
                "records_sha256": receipt.get("records_sha256"),
                "output_sha256": generated_manifest["output"]["sha256"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
