import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ENV_LINE_PATTERN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")
CLOUDFLARE_ENV_ALIASES: dict[str, tuple[str, ...]] = {
    "CLOUDFLARE_ACCOUNT_ID": ("CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"),
    "CLOUDFLARE_API_TOKEN": ("CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"),
    "CLOUDFLARE_AI_GATEWAY_ID": ("CLOUDFLARE_AI_GATEWAY_ID", "CF_AI_GATEWAY_ID"),
    "CLOUDFLARE_Q_WORKER_URL": ("CLOUDFLARE_Q_WORKER_URL",),
    "CLOUDFLARE_Q_BASE_MODEL": ("CLOUDFLARE_Q_BASE_MODEL",),
    "CLOUDFLARE_Q_LORA_NAME": ("CLOUDFLARE_Q_LORA_NAME",),
    "CLOUDFLARE_Q_WORKER_API_KEY": ("CLOUDFLARE_Q_WORKER_API_KEY",),
    "CLOUDFLARE_ADAPTER_SOURCE_DIR": ("CLOUDFLARE_ADAPTER_SOURCE_DIR",),
    "CLOUDFLARE_ADAPTER_EXPORT_DIR": ("CLOUDFLARE_ADAPTER_EXPORT_DIR",),
    "CLOUDFLARE_EVAL_BUNDLE_PATH": ("CLOUDFLARE_EVAL_BUNDLE_PATH",),
}


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_latest_session_path(root: Path) -> Path | None:
    candidate = root / ".training-output" / "q" / "latest-hybrid-session.json"
    return candidate if candidate.exists() else None


def rebase_repo_owned_path(root: Path, candidate: Path) -> Path:
    resolved = candidate.expanduser().resolve(strict=False)
    try:
        resolved.relative_to(root.resolve())
        return resolved
    except ValueError:
        pass
    repo_markers = (".training-output", "training", "docs", "deploy", "benchmarks")
    parts = list(resolved.parts)
    for marker in repo_markers:
        if marker not in parts:
            continue
        marker_index = parts.index(marker)
        return (root / Path(*parts[marker_index:])).resolve(strict=False)
    return resolved


def resolve_repo_path(path_value: str | None) -> Path | None:
    if not path_value:
        return None
    candidate = Path(path_value).expanduser()
    if candidate.is_absolute():
        return rebase_repo_owned_path(repo_root(), candidate)
    return (repo_root() / candidate).resolve(strict=False)


def relative_path(root: Path, path_value: Path | None) -> str | None:
    if path_value is None:
        return None
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


def normalize_env(env_files: list[Path]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for env_file in env_files:
        if env_file.exists():
            merged.update(load_env_file(env_file))
    return merged


def canonical_env_values(env: dict[str, str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for canonical_name, aliases in CLOUDFLARE_ENV_ALIASES.items():
        for alias in aliases:
            candidate = str(env.get(alias, "")).strip()
            if candidate:
                values[canonical_name] = candidate
                break
    return values


def fetch_json(url: str, headers: dict[str, str] | None = None, timeout: int = 15) -> tuple[int, dict | None, str | None]:
    request = urllib.request.Request(url, headers=headers or {}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload_text = response.read().decode("utf-8").strip()
            payload = json.loads(payload_text) if payload_text else None
            return response.status, payload if isinstance(payload, dict) else None, None
    except urllib.error.HTTPError as error:
        payload_text = error.read().decode("utf-8").strip()
        try:
            payload = json.loads(payload_text) if payload_text else None
        except json.JSONDecodeError:
            payload = None
        return error.code, payload if isinstance(payload, dict) else None, str(error)
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        return 0, None, str(error)


def git_value(root: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=str(root), check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def build_release(root: Path) -> dict:
    package = load_json(root / "package.json")
    git_short_sha = git_value(root, "rev-parse", "--short=7", "HEAD")
    return {
        "packageVersion": package.get("version", "0.0.0"),
        "gitSha": git_value(root, "rev-parse", "HEAD"),
        "gitShortSha": git_short_sha,
        "buildId": f"{package.get('version', '0.0.0')}+{git_short_sha}",
    }


def run_command(command: list[str], cwd: Path, env: dict[str, str] | None = None) -> tuple[int, str, str]:
    process_env = dict(os.environ)
    if env:
        process_env.update(env)
    executable = command[0]
    resolved = shutil.which(executable)
    if resolved is None and os.name == "nt" and not executable.lower().endswith(".cmd"):
        resolved = shutil.which(f"{executable}.cmd")
    if resolved:
        command = [resolved, *command[1:]]
    result = subprocess.run(command, cwd=str(cwd), check=False, capture_output=True, text=True, env=process_env)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def render_markdown(report: dict) -> str:
    adapter = report.get("adapter", {})
    eval_bundle = report.get("evalBundle", {})
    worker = report.get("worker", {})
    gateway = report.get("gateway", {})
    readiness = report.get("readiness", {})
    health = report.get("health", {})
    smoke = report.get("smoke", {})
    summary = report.get("summary", {})
    def show(value: object) -> object:
        if value in (None, ""):
            return "n/a"
        if isinstance(value, (dict, list)):
            return json.dumps(value, sort_keys=True)
        return value
    return "\n".join(
        [
            "# Cloudflare Q Inference",
            "",
            "This page records the Cloudflare deploy and evaluation lane for Q-only inference.",
            "",
            f"- Generated: `{report.get('generatedAt', 'n/a')}`",
            f"- Release: `{report.get('release', {}).get('buildId', 'n/a')}`",
            f"- Session id: `{report.get('sessionId', 'n/a')}`",
            f"- Session path: `{show(report.get('sessionPath'))}`",
            f"- Status: `{summary.get('status', 'unknown')}`",
            f"- Worker config: `{worker.get('wranglerConfigPath', 'n/a')}`",
            f"- Worker typecheck ready: `{worker.get('typecheckReady')}`",
            "",
            "## Readiness",
            "",
            f"- Auth ready: `{readiness.get('authReady')}`",
            f"- Adapter ready: `{readiness.get('adapterReady')}`",
            f"- Worker ready: `{readiness.get('workerReady')}`",
            f"- Eval bundle ready: `{readiness.get('evalBundleReady')}`",
            f"- Smoke ready: `{readiness.get('smokeReady')}`",
            f"- Recommended next step: {summary.get('recommendedNextStep') or 'n/a'}",
            "",
            "## Cloudflare Auth",
            "",
            f"- Account id ready: `{report.get('auth', {}).get('accountIdReady')}`",
            f"- API token ready: `{report.get('auth', {}).get('apiTokenReady')}`",
            f"- Gateway id: `{gateway.get('gatewayId', 'default')}`",
            f"- Gateway compat URL: `{show(gateway.get('compatUrl'))}`",
            f"- Auth header: `{gateway.get('authHeader', 'cf-aig-authorization: Bearer <token>')}`",
            "",
            "## Adapter Export",
            "",
            f"- Ready: `{adapter.get('ready')}`",
            f"- Source dir: `{show(adapter.get('sourceDir'))}`",
            f"- Output dir: `{show(adapter.get('outputDir'))}`",
            f"- Adapter config: `{show(adapter.get('adapterConfigPath'))}`",
            f"- Adapter weights: `{show(adapter.get('adapterWeightsPath'))}`",
            f"- Weights size MB: `{show(adapter.get('weightsSizeMb'))}`",
            *[f"- Adapter blocker: {blocker}" for blocker in adapter.get("blockers", [])],
            "",
            "## Eval Bundle",
            "",
            f"- Ready: `{eval_bundle.get('ready')}`",
            f"- Record count: `{eval_bundle.get('recordCount', 'n/a')}`",
            f"- Available source rows: `{eval_bundle.get('availableRecordCount', 'n/a')}`",
            f"- JSONL path: `{show(eval_bundle.get('jsonlPath'))}`",
            f"- Manifest path: `{show(eval_bundle.get('manifestPath'))}`",
            f"- Source surface counts: `{show(eval_bundle.get('sourceSurfaceCounts'))}`",
            f"- Selection group counts: `{show(eval_bundle.get('selectionGroupCounts'))}`",
            "",
            "## Worker And Gateway",
            "",
            f"- Worker package path: `{worker.get('packagePath', 'n/a')}`",
            f"- Deploy script: `{show(worker.get('deployScriptPath'))}`",
            f"- Worker URL configured: `{worker.get('workerUrlReady')}`",
            f"- Worker URL: `{show(worker.get('workerUrl'))}`",
            f"- Base model configured: `{worker.get('baseModelReady')}`",
            f"- LoRA name configured: `{worker.get('loraReady')}`",
            f"- Worker health attempted: `{health.get('attempted')}`",
            f"- Worker health ready: `{health.get('ready')}`",
            f"- Worker health status: `{show(health.get('status'))}`",
            f"- Worker health payload: `{show(health.get('payload'))}`",
            f"- Worker health blocker: {health.get('blocker') or 'n/a'}",
            "",
            "## Smoke Eval",
            "",
            f"- Attempted: `{smoke.get('attempted')}`",
            f"- Ready: `{smoke.get('ready')}`",
            f"- Evaluated rows: `{smoke.get('evaluatedRows', 0)}`",
            f"- Blocker: {smoke.get('blocker') or 'n/a'}",
            "",
            "## Truth Boundary",
            "",
            "- This lane treats Cloudflare as a Q inference and evaluation plane, not the heavy training backend.",
            "- The worker serves only the public Q identity and rejects other model labels.",
            "- A Cloudflare deploy is not claimed until account auth, a Cloudflare-ready adapter bundle, and worker deployment all exist together.",
            "- AI Gateway is used for logging and evaluation metadata around the Q worker path instead of pretending Cloudflare is the source of the Q fine-tune itself.",
        ]
    ) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Prepare and report the Cloudflare Q inference lane for the active hybrid session.")
    parser.add_argument("session_path", nargs="?", help="Optional positional hybrid session manifest JSON for npm wrapper compatibility.")
    parser.add_argument("env_files_positional", nargs="*", help="Optional positional env files for npm wrapper compatibility.")
    parser.add_argument("--session", help="Hybrid session manifest JSON.")
    parser.add_argument("--env-file", action="append", default=[], help="Optional env files.")
    parser.add_argument("--check", action="store_true", help="Materialize the Cloudflare report without network smoke.")
    parser.add_argument("--smoke", action="store_true", help="Attempt a single eval request against the configured Cloudflare worker URL.")
    parser.add_argument("--eval-limit", type=int, default=1, help="Maximum number of eval rows to replay during smoke.")
    args = parser.parse_args()

    session_arg = args.session_path or args.session
    session_path = resolve_repo_path(session_arg) if session_arg else default_latest_session_path(root)
    if session_path is None or not session_path.exists():
        expected = session_arg or ".training-output/q/latest-hybrid-session.json"
        raise FileNotFoundError(f"Session manifest not found: {expected}")
    session = load_json(session_path)
    session_id = str(session.get("sessionId", "")).strip() or "unknown-session"

    env_file_values = [*args.env_file, *args.env_files_positional]
    if not env_file_values:
        default_env = root / "deploy" / "cloudflare" / "env" / "immaculate-q-cloudflare.env.example"
        if default_env.exists():
            env_file_values.append(str(default_env))
    env_files = [path for raw in env_file_values for path in [resolve_repo_path(raw)] if isinstance(path, Path)]
    merged_env = normalize_env(env_files)
    merged_env.update({key: value for key, value in os.environ.items() if isinstance(value, str)})
    env_values = canonical_env_values(merged_env)

    worker_root = root / "deploy" / "cloudflare" / "worker"
    wrangler_config = root / "deploy" / "cloudflare" / "wrangler.toml"
    deploy_script = root / "deploy" / "cloudflare" / "scripts" / "deploy-cloudflare-worker.sh"

    adapter_command = [
        sys.executable,
        "training/q/export_cloudflare_adapter.py",
        "--session",
        relative_path(root, session_path) or str(session_path),
        "--check",
    ]
    if env_values.get("CLOUDFLARE_ADAPTER_SOURCE_DIR"):
        adapter_command.extend(["--adapter-dir", env_values["CLOUDFLARE_ADAPTER_SOURCE_DIR"]])
    if env_values.get("CLOUDFLARE_ADAPTER_EXPORT_DIR"):
        adapter_command.extend(["--output-dir", env_values["CLOUDFLARE_ADAPTER_EXPORT_DIR"]])
    adapter_code, adapter_stdout, adapter_stderr = run_command(adapter_command, root)
    adapter_report = json.loads(adapter_stdout) if adapter_stdout else {}

    eval_command = [
        sys.executable,
        "training/q/build_cloudflare_eval_bundle.py",
        "--session",
        relative_path(root, session_path) or str(session_path),
        "--limit",
        str(max(args.eval_limit, 1) if args.smoke else 24),
    ]
    if env_values.get("CLOUDFLARE_EVAL_BUNDLE_PATH"):
        output_path = resolve_repo_path(env_values["CLOUDFLARE_EVAL_BUNDLE_PATH"])
        if output_path is not None:
            eval_command.extend(["--output-dir", str(output_path.parent)])
    eval_code, eval_stdout, eval_stderr = run_command(eval_command, root)
    eval_report = json.loads(eval_stdout) if eval_stdout else {}

    typecheck_code, typecheck_stdout, typecheck_stderr = run_command(["npm", "--prefix", str(worker_root), "run", "typecheck"], root)

    account_id = env_values.get("CLOUDFLARE_ACCOUNT_ID", "")
    api_token = env_values.get("CLOUDFLARE_API_TOKEN", "")
    gateway_id = env_values.get("CLOUDFLARE_AI_GATEWAY_ID", "default") or "default"
    worker_url = env_values.get("CLOUDFLARE_Q_WORKER_URL", "")
    compat_url = f"https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/compat/chat/completions" if account_id else None
    base_model_configured = bool(env_values.get("CLOUDFLARE_Q_BASE_MODEL", ""))
    lora_configured = bool(env_values.get("CLOUDFLARE_Q_LORA_NAME", ""))

    health_attempted = bool(worker_url)
    health_ready = False
    health_status = None
    health_payload = None
    health_blocker = None
    if worker_url:
        health_status, health_payload, health_blocker = fetch_json(worker_url.rstrip("/") + "/health")
        health_ready = bool(health_status and health_status < 400 and isinstance(health_payload, dict) and health_payload.get("ok") is True)

    smoke_attempted = bool(args.smoke)
    smoke_ready = False
    smoke_blocker = None
    evaluated_rows = 0
    if args.smoke:
        if not worker_url:
            smoke_blocker = "CLOUDFLARE_Q_WORKER_URL is not configured."
        elif not health_ready:
            smoke_blocker = health_blocker or "Cloudflare worker /health did not succeed."
        elif not eval_report.get("output", {}).get("jsonlPath"):
            smoke_blocker = "Cloudflare eval bundle is missing."
        else:
            jsonl_path = resolve_repo_path(str(eval_report["output"]["jsonlPath"]))
            if jsonl_path is None or not jsonl_path.exists():
                smoke_blocker = "Cloudflare eval bundle JSONL path does not exist."
            else:
                with jsonl_path.open("r", encoding="utf-8") as handle:
                    for raw_line in handle:
                        if evaluated_rows >= max(args.eval_limit, 1):
                            break
                        line = raw_line.strip()
                        if not line:
                            continue
                        record = json.loads(line)
                        request_body = {
                            "model": "Q",
                            "messages": record.get("messages", []),
                            "metadata": record.get("metadata", {}),
                        }
                        request_headers = {"content-type": "application/json"}
                        worker_api_key = env_values.get("CLOUDFLARE_Q_WORKER_API_KEY", "")
                        if worker_api_key:
                            request_headers["authorization"] = f"Bearer {worker_api_key}"
                        request = urllib.request.Request(
                            worker_url.rstrip("/") + "/v1/chat/completions",
                            data=json.dumps(request_body).encode("utf-8"),
                            headers=request_headers,
                            method="POST",
                        )
                        try:
                            with urllib.request.urlopen(request, timeout=60) as response:
                                if response.status >= 400:
                                    raise RuntimeError(f"Worker returned {response.status}.")
                                evaluated_rows += 1
                        except (urllib.error.URLError, urllib.error.HTTPError, RuntimeError) as error:
                            smoke_blocker = str(error)
                            break
                if smoke_blocker is None and evaluated_rows > 0:
                    smoke_ready = True

    adapter_ready = bool(isinstance(adapter_report, dict) and adapter_report.get("ready"))
    eval_bundle_ready = bool(eval_report.get("recordCount", 0) > 0)
    worker_config_ready = bool(worker_url and base_model_configured and lora_configured)
    worker_ready = bool(typecheck_code == 0 and worker_config_ready and health_ready)

    session_report_path = session_path.parent / "cloudflare-q-inference.json"
    wiki_json_path = root / "docs" / "wiki" / "Cloudflare-Q-Inference.json"
    wiki_markdown_path = root / "docs" / "wiki" / "Cloudflare-Q-Inference.md"

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "release": build_release(root),
        "sessionId": session_id,
        "sessionPath": relative_path(root, session_path),
        "auth": {
            "accountIdReady": bool(account_id),
            "apiTokenReady": bool(api_token),
            "envFiles": [relative_path(root, path) or str(path) for path in env_files],
        },
        "gateway": {
            "gatewayId": gateway_id,
            "compatUrl": compat_url,
            "authHeader": "cf-aig-authorization: Bearer <token>",
            "metadataLimit": 5,
        },
        "adapter": adapter_report if isinstance(adapter_report, dict) else {
            "ready": False,
            "blockers": [adapter_stderr or "Adapter export report was not produced."],
        },
        "evalBundle": {
            "ready": eval_bundle_ready,
            "recordCount": eval_report.get("recordCount"),
            "availableRecordCount": eval_report.get("availableRecordCount"),
            "jsonlPath": eval_report.get("output", {}).get("jsonlPath") if isinstance(eval_report.get("output"), dict) else None,
            "manifestPath": eval_report.get("output", {}).get("manifestPath") if isinstance(eval_report.get("output"), dict) else None,
            "sourceSurfaceCounts": eval_report.get("sourceSurfaceCounts"),
            "selectionGroupCounts": eval_report.get("selectionGroupCounts"),
        },
        "worker": {
            "packagePath": relative_path(root, worker_root),
            "wranglerConfigPath": relative_path(root, wrangler_config),
            "deployScriptPath": relative_path(root, deploy_script),
            "typecheckReady": typecheck_code == 0,
            "typecheckStdout": typecheck_stdout or None,
            "typecheckStderr": typecheck_stderr or None,
            "workerUrlReady": bool(worker_url),
            "workerUrl": worker_url or None,
            "baseModelReady": base_model_configured,
            "loraReady": lora_configured,
        },
        "health": {
            "attempted": health_attempted,
            "ready": health_ready,
            "status": health_status,
            "payload": health_payload,
            "blocker": health_blocker,
        },
        "smoke": {
            "attempted": smoke_attempted,
            "ready": smoke_ready,
            "evaluatedRows": evaluated_rows,
            "blocker": smoke_blocker,
        },
        "readiness": {
            "authReady": bool(account_id and api_token),
            "adapterReady": adapter_ready,
            "workerReady": worker_ready,
            "evalBundleReady": eval_bundle_ready,
            "smokeReady": smoke_ready,
        },
        "summary": {
            "provider": "cloudflare",
            "role": "inference-eval-plane",
            "ready": bool(account_id and api_token and adapter_ready and worker_ready and eval_bundle_ready),
            "status": (
                "smoke-ready"
                if account_id and api_token and adapter_ready and worker_ready and eval_bundle_ready and smoke_ready
                else "worker-blocked"
                if adapter_ready and eval_bundle_ready and not worker_ready
                else "adapter-blocked"
                if bool(account_id and api_token) and not adapter_ready
                else "auth-blocked"
                if not bool(account_id and api_token)
                else "eval-blocked"
            ),
            "recommendedNextStep": (
                "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then rerun the Cloudflare inference check."
                if not account_id or not api_token
                else (
                    "Produce a Cloudflare-ready adapter artifact with adapter_config.json and adapter_model.safetensors, then rerun the check."
                    if not adapter_ready
                    else (
                        "Set CLOUDFLARE_Q_WORKER_URL, CLOUDFLARE_Q_BASE_MODEL, and CLOUDFLARE_Q_LORA_NAME, then deploy the worker."
                        if not worker_config_ready
                        else (
                            "Deploy the Cloudflare worker and make /health green before replaying the eval bundle."
                            if not health_ready
                            else (
                                "Replay the eval bundle against the Q-only endpoint to complete the smoke lane."
                                if not smoke_ready
                                else "Cloudflare inference lane is ready for repeated eval replays."
                            )
                        )
                    )
                )
            ),
        },
        "output": {
            "sessionJsonPath": relative_path(root, session_report_path),
            "wikiJsonPath": relative_path(root, wiki_json_path),
            "wikiMarkdownPath": relative_path(root, wiki_markdown_path),
        },
    }

    save_json(session_report_path, report)
    save_json(wiki_json_path, report)
    save_markdown(wiki_markdown_path, render_markdown(report))
    print(json.dumps(report, indent=2))
    if args.smoke and smoke_blocker:
        sys.exit(1)


if __name__ == "__main__":
    main()
