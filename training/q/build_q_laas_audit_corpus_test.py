import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "training" / "q" / "build_q_laas_audit_corpus.py"


def canonical_sha256(value: object) -> str:
    canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def lane(lane_id: str, training_policy: str) -> dict:
    return {
        "lane_id": lane_id,
        "export_scope": "public-redacted" if lane_id == "public" else "sealed",
        "training_policy": training_policy,
        "retention_class": "public-evidence" if lane_id == "public" else "sealed-evidence",
        "migration_id": "arobi-ledger-lane-v0.3-20260514",
    }


def manifest(records: list[dict], include_internal: bool = False) -> dict:
    return {
        "schema_version": 2,
        "migration_id": "arobi-ledger-lane-v0.3-20260514",
        "include_internal": include_internal,
        "source_total": len(records),
        "exported_total": len(records),
        "public_exported": sum(1 for record in records if record["lane"]["lane_id"] == "public"),
        "private_exported": sum(1 for record in records if record["lane"]["lane_id"] == "private"),
        "private_skipped": 0,
        "zero_zero_blocked": 0,
        "integrity_failed_blocked": 0,
        "public_reasoning_redacted": 1,
        "metadata_keys_removed": 0,
        "lane_summaries": [
            {
                "lane_id": "public",
                "export_scope": "public-redacted",
                "training_policy": "allowed-redacted",
                "retention_class": "public-evidence",
                "source_total": sum(1 for record in records if record["lane"]["lane_id"] == "public"),
                "exported_total": sum(1 for record in records if record["lane"]["lane_id"] == "public"),
                "skipped_total": 0,
                "blocked_total": 0,
                "integrity_failed_blocked": 0,
                "public_reasoning_redacted": 1,
                "metadata_keys_removed": 0,
            },
            {
                "lane_id": "private",
                "export_scope": "operator-audit",
                "training_policy": "allowed-internal",
                "retention_class": "audit-evidence",
                "source_total": 0,
                "exported_total": 0,
                "skipped_total": 0,
                "blocked_total": 0,
                "integrity_failed_blocked": 0,
                "public_reasoning_redacted": 0,
                "metadata_keys_removed": 0,
            },
            {
                "lane_id": "zero-zero",
                "export_scope": "sealed",
                "training_policy": "blocked",
                "retention_class": "sealed-evidence",
                "source_total": 0,
                "exported_total": 0,
                "skipped_total": 0,
                "blocked_total": 0,
                "integrity_failed_blocked": 0,
                "public_reasoning_redacted": 0,
                "metadata_keys_removed": 0,
            },
        ],
    }


def corpus_payload(records: list[dict], include_internal: bool = False) -> dict:
    export_manifest = manifest(records, include_internal=include_internal)
    return {
        "records": records,
        "total": len(records),
        "include_internal": include_internal,
        "manifest": export_manifest,
        "receipt": {
            "schema_version": 1,
            "receipt_id": f"qtrain-manifest-v1-{canonical_sha256(records)[:16]}",
            "generated_at": "2026-05-14T15:00:00Z",
            "include_internal": include_internal,
            "records_total": len(records),
            "records_sha256": canonical_sha256(records),
            "boundary_contract": "manifest-only-no-record-payload",
            "manifest": export_manifest,
        },
    }


def public_record() -> dict:
    return {
        "entry_id": "audit-public-vision-1",
        "timestamp": "2026-05-14T15:00:00Z",
        "block_height": 42,
        "lane": lane("public", "allowed-redacted"),
        "decision_source": "External",
        "decision_type": "ModelInference",
        "model_id": "Q",
        "model_version": "0.1.9",
        "input_summary": "Public safety vision event with aggregate human/object observations",
        "decision": "Escalate to human review without identity matching",
        "confidence": 0.82,
        "confidence_level": "High",
        "reasoning": None,
        "factors": ["non-identifying observation", "human review required"],
        "ethics_validated": True,
        "subsystems": ["laas", "q-vision"],
        "network_context": "public",
        "latency_ms": 18.5,
        "integrity_verified": True,
        "entry_hash": "abc123",
        "metadata": {
            "modality": "vision",
            "vision_task": "safety_event_review",
            "object_count": "2",
            "person_count": "1",
            "body_language_signal": "distress-cue",
            "vision_privacy_policy": "no_persistent_identity",
        },
    }


def private_record() -> dict:
    record = public_record()
    record["entry_id"] = "audit-private-1"
    record["lane"] = lane("private", "allowed-internal")
    record["reasoning"] = "Internal operator evidence is allowed only when include-internal is explicit."
    return record


class BuildQLaaSAuditCorpusCliTest(unittest.TestCase):
    def test_cli_builds_training_rows_from_verified_public_corpus(self) -> None:
        with tempfile.TemporaryDirectory(prefix="q-laas-corpus-") as temp_dir:
            temp = Path(temp_dir)
            corpus_path = temp / "corpus.json"
            output_path = temp / "q-laas-audit-corpus.jsonl"
            manifest_path = temp / "q-laas-audit-corpus.manifest.json"
            corpus_path.write_text(json.dumps(corpus_payload([public_record()]), indent=2), encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--corpus-file",
                    str(corpus_path),
                    "--output",
                    str(output_path),
                    "--manifest-output",
                    str(manifest_path),
                ],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["accepted"])
            self.assertEqual(payload["rows"], 1)
            row = json.loads(output_path.read_text(encoding="utf-8").strip())
            self.assertEqual(row["source_id"], "laas-audit:audit-public-vision-1")
            self.assertIn("Arobi LaaS audited decision", row["text"])
            self.assertIn("distress-cue", row["text"])
            self.assertNotIn("face", row["text"].lower())
            generated_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(generated_manifest["receipt"]["recordsTotal"], 1)
            self.assertEqual(generated_manifest["safety"]["zeroZeroRecordsRejected"], 0)

    def test_cli_fails_closed_when_export_contains_zero_zero_record(self) -> None:
        bad_record = public_record()
        bad_record["entry_id"] = "audit-zero-zero-1"
        bad_record["lane"] = lane("zero-zero", "blocked")
        with tempfile.TemporaryDirectory(prefix="q-laas-corpus-block-") as temp_dir:
            temp = Path(temp_dir)
            corpus_path = temp / "corpus.json"
            corpus_path.write_text(json.dumps(corpus_payload([bad_record]), indent=2), encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--corpus-file", str(corpus_path), "--output", str(temp / "out.jsonl")],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("zero-zero", result.stderr)

    def test_cli_fails_closed_when_receipt_hash_does_not_match_records(self) -> None:
        payload = corpus_payload([public_record()])
        payload["receipt"]["records_sha256"] = "0" * 64
        with tempfile.TemporaryDirectory(prefix="q-laas-corpus-hash-") as temp_dir:
            temp = Path(temp_dir)
            corpus_path = temp / "corpus.json"
            corpus_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--corpus-file", str(corpus_path), "--output", str(temp / "out.jsonl")],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("records_sha256", result.stderr)

    def test_cli_fails_closed_on_sensitive_vision_metadata(self) -> None:
        bad_record = public_record()
        bad_record["metadata"]["face_embedding"] = "embedding_vector: [0.1,0.2]"
        with tempfile.TemporaryDirectory(prefix="q-laas-corpus-sensitive-") as temp_dir:
            temp = Path(temp_dir)
            corpus_path = temp / "corpus.json"
            corpus_path.write_text(json.dumps(corpus_payload([bad_record]), indent=2), encoding="utf-8")

            result = subprocess.run(
                [sys.executable, str(SCRIPT), "--corpus-file", str(corpus_path), "--output", str(temp / "out.jsonl")],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("sensitive metadata key", result.stderr)

    def test_cli_fails_closed_on_person_risk_labels(self) -> None:
        bad_record = private_record()
        bad_record["metadata"]["body_language_signal"] = "hostile_person"
        with tempfile.TemporaryDirectory(prefix="q-laas-corpus-risk-") as temp_dir:
            temp = Path(temp_dir)
            corpus_path = temp / "corpus.json"
            corpus_path.write_text(json.dumps(corpus_payload([bad_record], include_internal=True), indent=2), encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--corpus-file",
                    str(corpus_path),
                    "--include-internal",
                    "--output",
                    str(temp / "out.jsonl"),
                ],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("person-risk label", result.stderr)

    def test_cli_requires_explicit_include_internal_for_private_records(self) -> None:
        record = private_record()
        with tempfile.TemporaryDirectory(prefix="q-laas-corpus-internal-") as temp_dir:
            temp = Path(temp_dir)
            corpus_path = temp / "corpus.json"
            output_path = temp / "out.jsonl"
            corpus_path.write_text(json.dumps(corpus_payload([record], include_internal=True), indent=2), encoding="utf-8")

            blocked = subprocess.run(
                [sys.executable, str(SCRIPT), "--corpus-file", str(corpus_path), "--output", str(output_path)],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(blocked.returncode, 0)
            self.assertIn("include_internal", blocked.stderr)

            accepted = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--corpus-file",
                    str(corpus_path),
                    "--include-internal",
                    "--output",
                    str(output_path),
                ],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(accepted.returncode, 0, accepted.stderr)
            row = json.loads(output_path.read_text(encoding="utf-8").strip())
            self.assertEqual(row["metadata"]["training_policy"], "allowed-internal")


if __name__ == "__main__":
    unittest.main()
