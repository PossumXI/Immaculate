import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ENV_LINE_PATTERN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")
HF_ENV_ALIASES = ("HF_TOKEN", "HUGGINGFACE_TOKEN", "HUGGINFACE_ACCESS_TOKEN")


def truthy_env(name: str) -> bool:
    return str(os.getenv(name, "")).strip().lower() in {"1", "true", "yes", "on"}


def usable_npm_value(name: str) -> str:
    value = str(os.getenv(name, "")).strip()
    if value.lower() in {"", "true", "false"}:
        return ""
    return value


def normalize_cli_argv(argv: list[str]) -> list[str]:
    if any(token == "--session" or token.startswith("--session=") for token in argv[1:]):
        return argv

    normalized = [argv[0]]
    positionals = [token for token in argv[1:] if not token.startswith("--")]
    session_value = usable_npm_value("npm_config_session") or (positionals[0] if positionals else "")
    env_file_value = usable_npm_value("npm_config_env_file") or (positionals[1] if len(positionals) > 1 else "")

    if session_value:
        normalized.extend(["--session", session_value])
    if env_file_value:
        normalized.extend(["--env-file", env_file_value])
    if "--check" in argv[1:] or truthy_env("npm_config_check"):
        normalized.append("--check")
    if "--smoke-launch" in argv[1:] or truthy_env("npm_config_smoke_launch"):
        normalized.append("--smoke-launch")
    if "--launch" in argv[1:] or truthy_env("npm_config_launch"):
        normalized.append("--launch")
    return normalized


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def resolve_repo_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    candidate = Path(path_value).expanduser()
    if candidate.is_absolute():
        return candidate.resolve(strict=False)
    return (repo_root() / candidate).resolve(strict=False)


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def save_json(path_value: Path, payload: dict) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def save_markdown(path_value: Path, content: str) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(content, encoding="utf-8")


def strip_optional_quotes(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in {"'", '"'}:
        return text[1:-1]
    return text


def load_env_file(path_value: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path_value.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = ENV_LINE_PATTERN.match(raw_line)
        if not match:
            continue
        values[match.group(1).strip()] = strip_optional_quotes(match.group(2).strip())
    return values


def normalize_env(env_files: list[Path], inline_env: dict[str, str] | None = None) -> dict[str, str]:
    merged: dict[str, str] = {}
    for env_file in env_files:
        if env_file.exists():
            merged.update(load_env_file(env_file))
    if inline_env:
        merged.update({str(key): str(value) for key, value in inline_env.items()})
    return merged


def first_present_env_value(env: dict[str, str], names: tuple[str, ...]) -> tuple[str | None, str | None]:
    for name in names:
        value = str(env.get(name, "")).strip()
        if value:
            return name, value
    return None, None


def canonical_hf_token_source(source: str | None) -> str | None:
    if source in HF_ENV_ALIASES:
        return "HF_TOKEN"
    return source


def locate_hf_cli(root: Path, env: dict[str, str]) -> str:
    explicit = str(env.get("HF_CLI_BIN", "")).strip()
    if explicit and Path(explicit).exists():
        return explicit
    for base in (root, root.parent):
        local = base / ".tools" / "foundry-venv" / "Scripts" / "hf.exe"
        if local.exists():
            return str(local)
        local_posix = base / ".tools" / "foundry-venv" / "bin" / "hf"
        if local_posix.exists():
            return str(local_posix)
    return "hf"


def run_command(command: list[str], env: dict[str, str]) -> tuple[int, str, str]:
    result = subprocess.run(command, check=False, capture_output=True, text=True, env=env)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def parse_whoami(stdout: str) -> str | None:
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if line.startswith("user="):
            return line.split("=", 1)[1].strip()
    return None


def parse_hardware(stdout: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for raw_line in stdout.splitlines():
        line = raw_line.rstrip()
        if not line or line.startswith("NAME") or set(line.replace(" ", "")) == {"-"}:
            continue
        parts = [part for part in re.split(r"\s{2,}", line.strip()) if part]
        if len(parts) < 6:
            continue
        rows.append(
            {
                "name": parts[0],
                "prettyName": parts[1],
                "cpu": parts[2],
                "ram": parts[3],
                "accelerator": parts[4],
                "costPerMin": parts[5],
                "costPerHour": parts[6] if len(parts) >= 7 else "",
            }
        )
    return rows


def build_release_summary(root: Path) -> dict:
    package = load_json(root / "package.json")
    git_sha = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(root), capture_output=True, text=True, check=False).stdout.strip()
    git_short_sha = subprocess.run(["git", "rev-parse", "--short=7", "HEAD"], cwd=str(root), capture_output=True, text=True, check=False).stdout.strip()
    return {
        "packageVersion": package.get("version", "0.0.0"),
        "gitSha": git_sha,
        "gitShortSha": git_short_sha,
        "buildId": f"{package.get('version', '0.0.0')}+{git_short_sha}",
    }


def render_markdown(report: dict) -> str:
    staged = report.get("stagedBundle", {})
    smoke = report.get("smokeLaunch", {})
    launch = report.get("launch", {})
    hardware = report.get("hardware", [])
    gpu_names = ", ".join(entry.get("name", "") for entry in hardware if "N/A" not in str(entry.get("accelerator", ""))) or "none"
    return "\n".join(
        [
            "# HF Jobs Training",
            "",
            "This page records the real Hugging Face Jobs workaround path for the active Q and Immaculate cloud bundle.",
            "",
            f"- Generated: `{report.get('generatedAt', 'n/a')}`",
            f"- Release: `{report.get('release', {}).get('buildId', 'n/a')}`",
            f"- Session id: `{report.get('sessionId', 'n/a')}`",
            f"- Authenticated user: `{report.get('auth', {}).get('user', 'n/a')}`",
            f"- HF CLI path: `{report.get('auth', {}).get('hfCliBin', 'n/a')}`",
            "",
            "## Bundle Staging",
            "",
            f"- Dataset repo: `{staged.get('repoId', 'n/a')}`",
            f"- Archive path: `{staged.get('archiveRepoPath', 'n/a')}`",
            f"- Manifest path: `{staged.get('manifestRepoPath', 'n/a')}`",
            f"- Bundle staged: `{staged.get('staged', False)}`",
            "",
            "## Jobs Surface",
            "",
            f"- Hardware flavors visible: `{len(hardware)}`",
            f"- GPU-capable flavors visible: `{gpu_names}`",
            f"- Existing jobs visible: `{report.get('jobsVisibleCount', 'n/a')}`",
            f"- Job image: `{launch.get('image', 'n/a')}`",
            f"- Launch mode: `{launch.get('jobMode', 'n/a')}`",
            f"- Training bootstrap: `{launch.get('bootstrapMode', 'n/a')}`",
            "",
            "## Smoke Launch",
            "",
            f"- Attempted: `{smoke.get('attempted', False)}`",
            f"- Ready: `{smoke.get('ready', False)}`",
            f"- Flavor: `{smoke.get('flavor', 'n/a')}`",
            f"- Timeout: `{smoke.get('timeout', 'n/a')}`",
            f"- Job id: `{smoke.get('jobId') or 'n/a'}`",
            f"- Blocker: {smoke.get('blocker', 'n/a')}",
            "",
            "## Truth Boundary",
            "",
            "- This path proves Hugging Face Jobs auth, hardware visibility, and bundle staging separately from OCI.",
            "- A successful dataset upload does not claim a cloud training run happened.",
            "- In train mode the remote runner bootstraps the tracked Python training stack before it invokes the Q trainer.",
            "- A failed smoke launch is recorded as a billing or provider blocker, not papered over as cloud readiness.",
        ]
    ) + "\n"


def main() -> None:
    root = repo_root()
    sys.argv = normalize_cli_argv(sys.argv)
    parser = argparse.ArgumentParser(description="Stage and optionally launch the active Q hybrid bundle on Hugging Face Jobs.")
    parser.add_argument("--session", required=True, help="Path to the hybrid session manifest JSON.")
    parser.add_argument("--env-file", action="append", default=[], help="Optional env file(s) to load.")
    parser.add_argument("--check", action="store_true", help="Validate HF Jobs auth and stage the bundle without launching.")
    parser.add_argument("--smoke-launch", action="store_true", help="Attempt a tiny detached CPU job to validate cloud execution.")
    parser.add_argument("--launch", action="store_true", help="Launch the remote cloud job for the session bundle.")
    args = parser.parse_args()

    session_path = resolve_repo_path(args.session)
    if session_path is None or not session_path.exists():
        raise FileNotFoundError(f"Session manifest not found: {args.session}")

    session = load_json(session_path)
    manifest_pointer = str(session.get("manifestPath", "")).strip() if isinstance(session, dict) else ""
    if manifest_pointer and "cloudBundle" not in session:
        pointed_manifest = resolve_repo_path(manifest_pointer)
        if pointed_manifest is None or not pointed_manifest.exists():
            raise FileNotFoundError(f"Hybrid session manifest pointer is invalid: {manifest_pointer}")
        session_path = pointed_manifest
        session = load_json(session_path)
    session_id = str(session.get("sessionId", "")).strip() or "unknown-session"
    cloud = session.get("cloud", {}) if isinstance(session.get("cloud"), dict) else {}
    inline_env = cloud.get("inlineEnv", {}) if isinstance(cloud, dict) else {}
    env_files = [path for raw in args.env_file for path in [resolve_repo_path(raw)] if isinstance(path, Path)]
    effective_env = normalize_env(env_files, inline_env if isinstance(inline_env, dict) else {})
    token_source, token_value = first_present_env_value(effective_env, HF_ENV_ALIASES)
    if not token_value:
        raise ValueError("HF token is missing from env files. Provide HF_TOKEN, HUGGINGFACE_TOKEN, or HUGGINFACE_ACCESS_TOKEN.")

    launch_env = dict(os.environ)
    launch_env["HF_TOKEN"] = token_value
    hf_cli = locate_hf_cli(root, effective_env)

    auth_code, auth_stdout, auth_stderr = run_command([hf_cli, "auth", "whoami"], launch_env)
    auth_user = parse_whoami(auth_stdout) if auth_code == 0 else None

    hw_code, hw_stdout, hw_stderr = run_command([hf_cli, "jobs", "hardware"], launch_env)
    hardware = parse_hardware(hw_stdout) if hw_code == 0 else []

    ps_code, ps_stdout, ps_stderr = run_command([hf_cli, "jobs", "ps"], launch_env)
    jobs_visible_count = 0 if "No jobs found" in ps_stdout else max(0, len([line for line in ps_stdout.splitlines() if line.strip()]))

    release = build_release_summary(root)
    cloud_bundle = session.get("cloudBundle", {}) if isinstance(session.get("cloudBundle"), dict) else {}
    bundle_manifest_pointer = str(cloud_bundle.get("manifestPath", "")).strip()
    if bundle_manifest_pointer:
        bundle_manifest_path = resolve_repo_path(bundle_manifest_pointer)
    else:
        bundle_manifest_path = session_path.parent / "cloud-bundle" / "bundle-manifest.json"
    if bundle_manifest_path is None:
        raise FileNotFoundError("Cloud bundle manifest path could not be resolved.")
    cloud_bundle_root = bundle_manifest_path.parent
    bundle_manifest = load_json(bundle_manifest_path)
    archive_relative = str(bundle_manifest.get("archive", {}).get("path", "")).strip() or str(next(cloud_bundle_root.glob("*.tar.gz")).name)
    archive_path = resolve_repo_path(archive_relative) or next(cloud_bundle_root.glob("*.tar.gz"))
    repo_archive_path = f"sessions/{session_id}/{archive_path.name}"
    repo_manifest_path = f"sessions/{session_id}/bundle-manifest.json"

    repo_id = str(effective_env.get("HF_BUNDLE_REPO", "")).strip()
    if not repo_id:
        if not auth_user:
            raise ValueError("HF bundle repo is not configured and authenticated user could not be discovered.")
        repo_id = f"{auth_user}/immaculate-q-cloud-bundles"

    create_code, create_stdout, create_stderr = run_command(
        [hf_cli, "repo", "create", repo_id, "--type", "dataset", "--private", "--exist-ok"],
        launch_env,
    )
    upload_archive = run_command(
        [
            hf_cli,
            "upload",
            repo_id,
            str(archive_path),
            repo_archive_path,
            "--repo-type",
            "dataset",
            "--commit-message",
            f"Stage cloud bundle for {session_id}",
        ],
        launch_env,
    )
    upload_manifest = run_command(
        [
            hf_cli,
            "upload",
            repo_id,
            str(bundle_manifest_path),
            repo_manifest_path,
            "--repo-type",
            "dataset",
            "--commit-message",
            f"Stage cloud bundle manifest for {session_id}",
        ],
        launch_env,
    )

    q = session.get("q", {}) if isinstance(session.get("q"), dict) else {}
    smoke_flavor = str(effective_env.get("HF_JOB_SMOKE_FLAVOR", "cpu-basic")).strip() or "cpu-basic"
    smoke_timeout = str(effective_env.get("HF_JOB_SMOKE_TIMEOUT", "5m")).strip() or "5m"
    job_flavor = str(effective_env.get("HF_JOB_FLAVOR", "t4-small")).strip() or "t4-small"
    job_timeout = str(effective_env.get("HF_JOB_TIMEOUT", "4h")).strip() or "4h"
    job_image = str(effective_env.get("HF_JOB_IMAGE", "python:3.12")).strip() or "python:3.12"
    job_namespace = str(effective_env.get("HF_JOB_NAMESPACE", auth_user or "")).strip() or None
    job_mode = str(effective_env.get("HF_JOB_MODE", "dry-run")).strip() or "dry-run"
    bootstrap_mode = str(effective_env.get("IMMACULATE_Q_TRAINING_BOOTSTRAP", "auto")).strip() or "auto"

    smoke_attempted = bool(args.smoke_launch)
    smoke_ready = False
    smoke_blocker = None
    smoke_job_id = None
    smoke_stdout = ""
    smoke_stderr = ""
    if args.smoke_launch:
        smoke_command = [
            hf_cli,
            "jobs",
            "run",
            "-d",
            "--flavor",
            smoke_flavor,
            "--timeout",
            smoke_timeout,
            "-l",
            "project=immaculate",
            "-l",
            "lane=hf-smoke",
        ]
        if job_namespace:
            smoke_command.extend(["--namespace", job_namespace])
        smoke_command.extend([job_image, "python", "-c", "print('HF cloud path ready for Q and Immaculate')"])
        smoke_code, smoke_stdout, smoke_stderr = run_command(smoke_command, launch_env)
        if smoke_code == 0:
            smoke_ready = True
            smoke_job_id = smoke_stdout.splitlines()[-1].strip() if smoke_stdout.strip() else None
        else:
            combined = (smoke_stderr or smoke_stdout).strip()
            smoke_blocker = combined or "HF Jobs smoke launch failed."

    launch_attempted = bool(args.launch)
    launch_job_id = None
    launch_blocker = None
    launch_stdout = ""
    launch_stderr = ""
    if args.launch:
        command_text = (
            "apt-get update && "
            "apt-get install -y --no-install-recommends git ca-certificates && "
            "git clone \"$IMMACULATE_GIT_REMOTE_URL\" /workspace/repo && "
            "cd /workspace/repo && "
            "git checkout \"$IMMACULATE_GIT_SHA\" && "
            "bash deploy/hf-jobs/scripts/run-hf-cloud-session.sh"
        )
        launch_command = [
            hf_cli,
            "jobs",
            "run",
            "-d",
            "--flavor",
            job_flavor,
            "--timeout",
            job_timeout,
            "--secrets",
            "HF_TOKEN",
            "-v",
            f"hf://datasets/{repo_id}:/bundle:ro",
            "-e",
            f"IMMACULATE_GIT_REMOTE_URL={bundle_manifest.get('repo', {}).get('remoteUrl', '')}",
            "-e",
            f"IMMACULATE_GIT_SHA={bundle_manifest.get('repo', {}).get('gitSha', '')}",
            "-e",
            "IMMACULATE_REPO_ROOT=/workspace/repo",
            "-e",
            f"IMMACULATE_Q_HYBRID_SESSION_REPO_PATH={relative_path(root, session_path)}",
            "-e",
            f"IMMACULATE_Q_CONFIG_REPO_PATH={str(q.get('configPath', '')).strip()}",
            "-e",
            f"HF_BUNDLE_ARCHIVE_PATH={repo_archive_path}",
            "-e",
            f"HF_BUNDLE_MANIFEST_REPO_PATH={repo_manifest_path}",
            "-e",
            f"HF_JOB_MODE={job_mode}",
            "-e",
            f"IMMACULATE_Q_TRAINING_BOOTSTRAP={bootstrap_mode}",
        ]
        if str(effective_env.get("WANDB_API_KEY", "")).strip() and str(effective_env.get("WANDB_MODE", "")).strip().lower() not in {"offline", "disabled"}:
            launch_command.extend(["--secrets", "WANDB_API_KEY"])
        if str(effective_env.get("WANDB_MODE", "")).strip():
            launch_command.extend(["-e", f"WANDB_MODE={effective_env['WANDB_MODE']}"])
        if job_namespace:
            launch_command.extend(["--namespace", job_namespace])
        launch_command.extend([job_image, "bash", "-lc", command_text])
        launch_code, launch_stdout, launch_stderr = run_command(launch_command, launch_env)
        if launch_code == 0:
            launch_job_id = launch_stdout.splitlines()[-1].strip() if launch_stdout.strip() else None
        else:
            launch_blocker = (launch_stderr or launch_stdout).strip() or "HF Jobs launch failed."

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "release": release,
        "sessionId": session_id,
        "auth": {
            "hfCliBin": hf_cli,
            "tokenSource": canonical_hf_token_source(token_source),
            "ready": auth_code == 0,
            "user": auth_user,
            "stderr": auth_stderr or None,
        },
        "hardware": hardware,
        "jobsVisibleCount": jobs_visible_count,
        "stagedBundle": {
            "repoId": repo_id,
            "archiveRepoPath": repo_archive_path,
            "manifestRepoPath": repo_manifest_path,
            "staged": create_code == 0 and upload_archive[0] == 0 and upload_manifest[0] == 0,
            "createRepoStdout": create_stdout or None,
            "createRepoStderr": create_stderr or None,
            "uploadArchiveStdout": upload_archive[1] or None,
            "uploadArchiveStderr": upload_archive[2] or None,
            "uploadManifestStdout": upload_manifest[1] or None,
            "uploadManifestStderr": upload_manifest[2] or None,
        },
        "smokeLaunch": {
            "attempted": smoke_attempted,
            "ready": smoke_ready,
            "flavor": smoke_flavor,
            "timeout": smoke_timeout,
            "jobId": smoke_job_id,
            "blocker": smoke_blocker,
            "stdout": smoke_stdout or None,
            "stderr": smoke_stderr or None,
        },
        "launch": {
            "attempted": launch_attempted,
            "jobMode": job_mode,
            "bootstrapMode": bootstrap_mode,
            "flavor": job_flavor,
            "timeout": job_timeout,
            "image": job_image,
            "namespace": job_namespace,
            "jobId": launch_job_id,
            "blocker": launch_blocker,
            "stdout": launch_stdout or None,
            "stderr": launch_stderr or None,
        },
        "summary": {
            "provider": "hf_jobs",
            "launchReady": bool(auth_code == 0 and hardware and not smoke_blocker),
            "recommendedNextStep": (
                "Hugging Face Jobs is authenticated and the bundle is staged, but prepaid credits are insufficient for launch. Add HF credits, then rerun the same session through the HF Jobs launcher."
                if smoke_blocker and "Payment Required" in smoke_blocker
                else (
                    "Hugging Face Jobs is authenticated and hardware is visible. Launch the staged Q hybrid session when ready."
                    if auth_code == 0 and hardware
                    else "Fix HF Jobs auth or hardware visibility before treating this as a cloud lane."
                )
            ),
        },
        "output": {
            "sessionJsonPath": relative_path(root, session_path.parent / "hf-jobs-launch.json"),
            "wikiJsonPath": "docs/wiki/HF-Jobs-Training.json",
            "wikiMarkdownPath": "docs/wiki/HF-Jobs-Training.md",
        },
    }

    session_output = session_path.parent / "hf-jobs-launch.json"
    wiki_json = root / "docs" / "wiki" / "HF-Jobs-Training.json"
    wiki_md = root / "docs" / "wiki" / "HF-Jobs-Training.md"
    save_json(session_output, report)
    save_json(wiki_json, report)
    save_markdown(wiki_md, render_markdown(report))
    sys.stdout.write(json.dumps(report, indent=2) + "\n")
    if (args.smoke_launch and smoke_blocker) or (args.launch and launch_blocker):
        sys.exit(1)


if __name__ == "__main__":
    main()
