import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "training" / "q" / "build_q_training_lock.py"


class BuildQTrainingLockCliTest(unittest.TestCase):
    def test_positionals_work_when_npm_strips_option_names(self) -> None:
        test_root = ROOT / ".training-output" / "q" / "lock-cli-test"
        test_root.mkdir(parents=True, exist_ok=True)
        dataset_path = test_root / "dataset.jsonl"
        config_path = test_root / "config.json"
        manifest_path = test_root / "dataset.manifest.json"
        curation_run_path = test_root / "curation-run.json"
        latest_path = ROOT / ".training-output" / "q" / "latest-training-lock.json"
        previous_latest = latest_path.read_bytes() if latest_path.exists() else None

        dataset_path.write_text('{"text":"Q lock parser regression"}\n', encoding="utf-8")
        config_path.write_text(
            json.dumps(
                {
                    "run_name": "q-lock-cli-test",
                    "model_name": "Q",
                    "base_model": "Q-LINEAGE-CHECKPOINT",
                    "train_dataset_path": str(dataset_path),
                    "output_dir": str(test_root / "run"),
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        manifest_path.write_text(
            json.dumps(
                {
                    "base": {"path": str(dataset_path), "sha256": "test"},
                    "supplemental": [],
                    "output": {"path": str(dataset_path), "row_count": 1, "sha256": "test"},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        curation_run_path.write_text(
            json.dumps(
                {
                    "id": "cur-lock-cli-test",
                    "manifestId": "manifest-lock-cli-test",
                    "provenanceChainHash": "hash-lock-cli-test",
                    "outputRecordCount": 1,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(config_path), str(manifest_path), str(curation_run_path)],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["accepted"])
            self.assertIn("q-lock-cli-test", payload["bundle_id"])
            lock = json.loads(Path(payload["output"]).read_text(encoding="utf-8"))
            self.assertEqual(lock["curation"]["runId"], "cur-lock-cli-test")
            self.assertEqual(lock["curation"]["manifestId"], "manifest-lock-cli-test")
            self.assertEqual(lock["curation"]["provenanceChainHash"], "hash-lock-cli-test")
            self.assertEqual(lock["curation"]["outputRecordCount"], 1)
        finally:
            if previous_latest is None:
                latest_path.unlink(missing_ok=True)
            else:
                latest_path.write_bytes(previous_latest)

    def test_no_args_use_latest_hybrid_session_pointer(self) -> None:
        test_root = ROOT / ".training-output" / "q" / "lock-cli-default-test"
        test_root.mkdir(parents=True, exist_ok=True)
        dataset_path = test_root / "dataset.jsonl"
        config_path = test_root / "config.json"
        manifest_path = test_root / "dataset.manifest.json"
        curation_run_path = test_root / "curation-run.json"
        latest_path = ROOT / ".training-output" / "q" / "latest-training-lock.json"
        latest_session_path = ROOT / ".training-output" / "q" / "latest-hybrid-session.json"
        previous_latest = latest_path.read_bytes() if latest_path.exists() else None
        previous_latest_session = latest_session_path.read_bytes() if latest_session_path.exists() else None

        dataset_path.write_text(
            json.dumps({"messages": [{"role": "user", "content": "hello"}]}) + "\n",
            encoding="utf-8",
        )
        config_path.write_text(
            json.dumps(
                {
                    "run_name": "q-lock-default-cli-test",
                    "model_name": "Q",
                    "base_model": "test-base",
                    "train_dataset_path": str(dataset_path),
                    "output_dir": str(test_root / "run"),
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        manifest_path.write_text(
            json.dumps(
                {
                    "output": {
                        "path": str(dataset_path),
                        "row_count": 1,
                        "sha256": "manifest-output-hash",
                    },
                    "base": {"path": str(dataset_path), "sha256": "manifest-base-hash"},
                    "supplemental": [],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        curation_run_path.write_text(
            json.dumps(
                {
                    "id": "cur-lock-default-cli-test",
                    "manifestId": "manifest-lock-default-cli-test",
                    "provenanceChainHash": "hash-lock-default-cli-test",
                    "outputRecordCount": 1,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        latest_session_path.write_text(
            json.dumps(
                {
                    "q": {
                        "configPath": str(config_path.relative_to(ROOT)).replace("\\", "/"),
                        "mixManifestPath": str(manifest_path.relative_to(ROOT)).replace("\\", "/"),
                        "curationRunPath": str(curation_run_path.relative_to(ROOT)).replace("\\", "/"),
                    }
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT)],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["accepted"])
            lock = json.loads(Path(payload["output"]).read_text(encoding="utf-8"))
            self.assertEqual(lock["curation"]["runId"], "cur-lock-default-cli-test")
            self.assertEqual(lock["curation"]["manifestId"], "manifest-lock-default-cli-test")
            self.assertEqual(lock["curation"]["provenanceChainHash"], "hash-lock-default-cli-test")
            self.assertEqual(lock["curation"]["outputRecordCount"], 1)
        finally:
            if previous_latest is None:
                latest_path.unlink(missing_ok=True)
            else:
                latest_path.write_bytes(previous_latest)
            if previous_latest_session is None:
                latest_session_path.unlink(missing_ok=True)
            else:
                latest_session_path.write_bytes(previous_latest_session)


if __name__ == "__main__":
    unittest.main()
