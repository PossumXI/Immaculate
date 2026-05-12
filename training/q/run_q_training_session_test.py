import json
import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "training" / "q" / "run_q_training_session.py"
SPEC = importlib.util.spec_from_file_location("run_q_training_session", SCRIPT)
assert SPEC and SPEC.loader
run_q_training_session = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(run_q_training_session)


class RunQTrainingSessionCliTest(unittest.TestCase):
    def test_doctor_without_session_reports_not_configured(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--doctor"],
            cwd=str(ROOT),
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "session-required")
        self.assertFalse(payload["ready"])
        self.assertFalse(payload["session"]["provided"])

    def test_launch_without_session_still_fails_closed(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--launch"],
            cwd=str(ROOT),
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--session is required when --launch is used", result.stderr)

    def test_disabled_local_lane_does_not_probe_python_modules(self) -> None:
        self.assertFalse(
            run_q_training_session.should_probe_local_dependencies(
                local_enabled=False,
                local_mode="disabled",
                local_python_present=True,
            )
        )
        self.assertTrue(
            run_q_training_session.should_probe_local_dependencies(
                local_enabled=True,
                local_mode="dry-run",
                local_python_present=True,
            )
        )


if __name__ == "__main__":
    unittest.main()
