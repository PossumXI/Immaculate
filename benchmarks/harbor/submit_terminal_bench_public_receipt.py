from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from huggingface_hub import HfApi


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JOB_DIR = REPO_ROOT / ".runtime" / "terminal-bench-jobs" / "q-terminal-bench-public-generic-smoke-v32"
DEFAULT_STAGE_ROOT = REPO_ROOT / ".runtime" / "terminal-bench-submission"
DEFAULT_OUTPUT_PATH = DEFAULT_STAGE_ROOT / "latest-public-receipt-submission.json"
DEFAULT_REPO_ID = "TruLumecreator/terminal-bench-2-leaderboard"
DEFAULT_SUBMISSION_DIR = "Immaculate__Q"

SECRET_KEYS = {"api_key", "authorization", "access_token", "bearer_token"}
Q_KEY_PATTERN = re.compile(r"qk\.qkey-[A-Za-z0-9._-]+")
ABSOLUTE_WINDOWS_PATH_PATTERN = re.compile(r"[A-Za-z]:\\\\Users\\\\Knight\\\\[^\"'\s]+")


@dataclass
class SubmissionMetadata:
    agent_url: str = "https://github.com/PossumXI/Immaculate"
    agent_display_name: str = "Immaculate"
    agent_org_display_name: str = "Arobi Technology Alliance"
    model_name: str = "Q"
    model_provider: str = "Gemma 4"
    model_display_name: str = "Q"
    model_org_display_name: str = "Arobi Technology Alliance"

    def to_yaml(self) -> str:
        return "\n".join(
            [
                f"agent_url: {self.agent_url}",
                f'agent_display_name: "{self.agent_display_name}"',
                f'agent_org_display_name: "{self.agent_org_display_name}"',
                "",
                "models:",
                f"  - model_name: {self.model_name}",
                f"    model_provider: {self.model_provider}",
                f'    model_display_name: "{self.model_display_name}"',
                f'    model_org_display_name: "{self.model_org_display_name}"',
                "",
            ]
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage and submit a sanitized Terminal-Bench public receipt.")
    parser.add_argument("--job-dir", default=str(DEFAULT_JOB_DIR), help="Path to the Harbor job directory to submit.")
    parser.add_argument(
        "--repo-id",
        default=DEFAULT_REPO_ID,
        help="Hugging Face dataset repo to commit to. Defaults to the duplicated fork.",
    )
    parser.add_argument(
        "--submission-dir",
        default=DEFAULT_SUBMISSION_DIR,
        help="Submission directory name under submissions/terminal-bench/2.0/",
    )
    parser.add_argument(
        "--run-label",
        default=datetime.now(timezone.utc).strftime("%Y-%m-%d__%H-%M-%S"),
        help="Timestamp-style run folder label to create under the submission directory.",
    )
    parser.add_argument(
        "--stage-root",
        default=str(DEFAULT_STAGE_ROOT),
        help="Local staging root for the sanitized package.",
    )
    parser.add_argument(
        "--output-path",
        default=str(DEFAULT_OUTPUT_PATH),
        help="JSON output path for the submission receipt details.",
    )
    parser.add_argument(
        "--title",
        default="Submit Immaculate Q public Terminal-Bench win",
        help="PR/discussion title to open on the duplicated leaderboard repo.",
    )
    parser.add_argument("--description", default="", help="Optional PR/discussion description.")
    parser.add_argument("--check", action="store_true", help="Stage and validate only; do not upload.")
    return parser.parse_args()


def load_token() -> str:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    if not token:
        raise RuntimeError("HF_TOKEN or HUGGING_FACE_HUB_TOKEN is required.")
    return token


def sanitize_scalar(value: str) -> str:
    redacted = Q_KEY_PATTERN.sub("[redacted-q-api-key]", value)
    redacted = ABSOLUTE_WINDOWS_PATH_PATTERN.sub("[redacted-local-path]", redacted)
    if redacted.startswith("http://127.0.0.1:") or redacted.startswith("https://127.0.0.1:"):
        return "[redacted-local-endpoint]"
    return redacted


def sanitize_json_like(payload: Any) -> Any:
    if isinstance(payload, dict):
        sanitized: dict[str, Any] = {}
        for key, value in payload.items():
            if key in SECRET_KEYS:
                sanitized[key] = "[redacted]"
                continue
            sanitized[key] = sanitize_json_like(value)
        return sanitized
    if isinstance(payload, list):
        return [sanitize_json_like(item) for item in payload]
    if isinstance(payload, str):
        return sanitize_scalar(payload)
    return payload


def sanitize_text(payload: str) -> str:
    return sanitize_scalar(payload)


def copy_sanitized_tree(source_dir: Path, target_dir: Path) -> None:
    for source_path in sorted(source_dir.rglob("*")):
        relative_path = source_path.relative_to(source_dir)
        target_path = target_dir / relative_path
        if source_path.is_dir():
            target_path.mkdir(parents=True, exist_ok=True)
            continue
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if source_path.suffix.lower() == ".json":
            data = json.loads(source_path.read_text(encoding="utf-8"))
            target_path.write_text(json.dumps(sanitize_json_like(data), indent=2) + "\n", encoding="utf-8")
            continue
        if source_path.suffix.lower() in {".txt", ".log", ".md", ".js", ".ts", ".sh"}:
            target_path.write_text(sanitize_text(source_path.read_text(encoding="utf-8", errors="ignore")), encoding="utf-8")
            continue
        shutil.copy2(source_path, target_path)


def validate_no_secret_markers(stage_dir: Path) -> None:
    violations: list[str] = []
    for file_path in stage_dir.rglob("*"):
        if not file_path.is_file():
            continue
        try:
            payload = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "qk.qkey-" in payload:
            violations.append(str(file_path))
        if "api_key" in payload and "[redacted]" not in payload and "[redacted-q-api-key]" not in payload:
            violations.append(str(file_path))
    if violations:
        joined = "\n".join(sorted(set(violations)))
        raise RuntimeError(f"Secret-like content remains in staged package:\n{joined}")


def build_stage(job_dir: Path, stage_root: Path, submission_dir_name: str, run_label: str) -> tuple[Path, Path]:
    submission_root = stage_root / submission_dir_name
    if submission_root.exists():
        shutil.rmtree(submission_root)
    run_stage_dir = submission_root / run_label
    run_stage_dir.mkdir(parents=True, exist_ok=True)
    copy_sanitized_tree(job_dir, run_stage_dir)
    metadata = SubmissionMetadata()
    (submission_root / "metadata.yaml").write_text(metadata.to_yaml(), encoding="utf-8")
    validate_no_secret_markers(submission_root)
    return submission_root, run_stage_dir


def main() -> None:
    args = parse_args()
    job_dir = Path(args.job_dir).resolve()
    if not job_dir.exists():
        raise FileNotFoundError(f"Job directory not found: {job_dir}")

    stage_root = Path(args.stage_root).resolve()
    output_path = Path(args.output_path).resolve()
    submission_root, run_stage_dir = build_stage(job_dir, stage_root, args.submission_dir, args.run_label)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "jobDir": str(job_dir),
        "repoId": args.repo_id,
        "submissionDir": args.submission_dir,
        "runLabel": args.run_label,
        "stageRoot": str(submission_root),
        "runStageDir": str(run_stage_dir),
        "pathInRepo": f"submissions/terminal-bench/2.0/{args.submission_dir}",
        "uploaded": False,
    }

    if not args.check:
        token = load_token()
        api = HfApi(token=token)
        commit = api.upload_folder(
            repo_id=args.repo_id,
            repo_type="dataset",
            folder_path=submission_root,
            path_in_repo=payload["pathInRepo"],
            commit_message=f"Add {args.submission_dir} Terminal-Bench public-task win",
            commit_description=args.description
            or "Add a sanitized 5/5 Harbor win for terminal-bench/make-mips-interpreter using the Q-only Immaculate path.",
            create_pr=True,
        )
        payload["uploaded"] = True
        payload["commitOid"] = getattr(commit, "oid", None)
        payload["commitUrl"] = getattr(commit, "commit_url", None)
        payload["pullRequestUrl"] = getattr(commit, "pr_url", None)
        payload["pullRequestNum"] = getattr(commit, "pr_revision", None)
        payload["hfRepoUrl"] = f"https://huggingface.co/datasets/{args.repo_id}"
        pr_url = str(payload.get("pullRequestUrl") or "")
        if not pr_url:
            discussion = api.create_pull_request(
                repo_id=args.repo_id,
                title=args.title,
                description=args.description or "Public Terminal-Bench Q win submission.",
                repo_type="dataset",
            )
            payload["pullRequestUrl"] = discussion.url
            payload["discussionNum"] = discussion.num
            pr_url = discussion.url
        if "terminal-bench-2-leaderboard/discussions/" not in pr_url:
            raise RuntimeError(f"Submission did not return a leaderboard discussion URL: {pr_url}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
