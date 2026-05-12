import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "training" / "immaculate" / "build_immaculate_training_bundle.py"


class BuildImmaculateTrainingBundleCliTest(unittest.TestCase):
    def test_positionals_work_when_npm_strips_output_option_name(self) -> None:
        test_root = ROOT / ".training-output" / "immaculate" / "bundle-cli-test"
        test_root.mkdir(parents=True, exist_ok=True)
        output_path = test_root / "bundle.json"
        latest_path = ROOT / ".training-output" / "immaculate" / "latest-training-bundle.json"
        previous_latest = latest_path.read_bytes() if latest_path.exists() else None

        try:
            result = subprocess.run(
                [sys.executable, str(SCRIPT), str(output_path)],
                cwd=str(ROOT),
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["accepted"])
            self.assertEqual(Path(payload["output"]), output_path.resolve())
            self.assertTrue(output_path.exists())
        finally:
            if previous_latest is None:
                latest_path.unlink(missing_ok=True)
            else:
                latest_path.write_bytes(previous_latest)


if __name__ == "__main__":
    unittest.main()
