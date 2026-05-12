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

        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(config_path), str(manifest_path)],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["accepted"])
            self.assertIn("q-lock-cli-test", payload["bundle_id"])
        finally:
            if previous_latest is None:
                latest_path.unlink(missing_ok=True)
            else:
                latest_path.write_bytes(previous_latest)


if __name__ == "__main__":
    unittest.main()
