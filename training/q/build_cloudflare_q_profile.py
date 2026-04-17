import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


PROFILE_RULES = [
    {
        "id": "bridge-trust",
        "directive": "If a late ACK, nonce mismatch, or nonce replay appears, say the bridge ACK path is untrusted and keep delivery fail-closed."
    },
    {
        "id": "direct-lane",
        "directive": "If direct HTTP/2 is healthy and policy-allowed while the bridge is degraded, name direct HTTP/2 as the trusted lane."
    },
    {
        "id": "lease-recovery",
        "directive": "If lease jitter, failed execution, or repair pending appears, stabilize the peer with bounded retries and preserve durable retry lineage."
    },
    {
        "id": "same-origin",
        "directive": "If same-origin operator access and token secrecy are both required, keep credentials out of browser-visible URLs."
    },
    {
        "id": "operator-grade",
        "directive": "Prefer terse operator-grade route, reason, and commit wording over generic caution language."
    },
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def git_value(root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(root),
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def render_ts_module(profile: dict) -> str:
    payload = json.dumps(profile, indent=2)
    return "\n".join(
        [
            "export type QCloudflareProfileRule = {",
            "  id: string;",
            "  directive: string;",
            "};",
            "",
            "export type QCloudflareProfile = {",
            "  generatedAt: string;",
            "  profileId: string;",
            "  qName: string;",
            "  trainingBundleId: string;",
            "  sessionId: string;",
            "  buildId: string;",
            "  rules: QCloudflareProfileRule[];",
            "};",
            "",
            f"export const qCloudflareProfile: QCloudflareProfile = {payload} as const;",
            "",
        ]
    )


def render_markdown(report: dict) -> str:
    rules = report.get("rules", [])
    return "\n".join(
        [
            "# Cloudflare Q Profile",
            "",
            "This page records the generated Q-only Cloudflare worker profile used to keep the Cloudflare lane grounded even before a LoRA artifact is available.",
            "",
            f"- Generated: `{report['generatedAt']}`",
            f"- Profile id: `{report['profileId']}`",
            f"- Q name: `{report['qName']}`",
            f"- Q training bundle: `{report['trainingBundleId']}`",
            f"- Hybrid session: `{report['sessionId']}`",
            f"- Release: `{report['buildId']}`",
            f"- Rule count: `{len(rules)}`",
            f"- Worker module: `{report['output']['workerModulePath']}`",
            "",
            "## Rules",
            "",
            *[f"- `{rule['id']}`: {rule['directive']}" for rule in rules],
            "",
            "## Truth Boundary",
            "",
            "- This profile is a deploy-time prompt-and-policy pack for the Cloudflare worker, not a claim that a Cloudflare LoRA exists.",
            "- It keeps the Cloudflare lane Q-only and domain-grounded while the heavy fine-tune still lives in the main training path.",
        ]
    ) + "\n"


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Generate a Q-only Cloudflare worker profile module from the active hybrid session.")
    parser.add_argument(
        "--session",
        default=str(root / ".training-output" / "q" / "latest-hybrid-session.json"),
        help="Path to the latest hybrid session summary JSON."
    )
    parser.add_argument(
        "--training-lock",
        default=str(root / ".training-output" / "q" / "latest-training-lock.json"),
        help="Path to latest-training-lock.json."
    )
    parser.add_argument(
        "--worker-module",
        default=str(root / "deploy" / "cloudflare" / "worker" / "src" / "q-profile.generated.ts"),
        help="Output TypeScript module for the Cloudflare worker."
    )
    parser.add_argument(
        "--manifest",
        default=str(root / "docs" / "wiki" / "Cloudflare-Q-Profile.json"),
        help="Output manifest path."
    )
    args = parser.parse_args()

    session_path = Path(args.session)
    training_lock_path = Path(args.training_lock)
    worker_module_path = Path(args.worker_module)
    manifest_path = Path(args.manifest)
    markdown_path = manifest_path.with_suffix(".md")

    session = load_json(session_path)
    training_lock = load_json(training_lock_path)

    q_payload = session.get("q", {}) if isinstance(session.get("q"), dict) else {}
    q_name = str(q_payload.get("modelId", "")).strip() or "Q"
    training_bundle_id = str(training_lock.get("bundleId", "")).strip() or "none generated yet"
    session_id = str(session.get("sessionId", "")).strip() or "unknown-session"
    package = load_json(root / "package.json")
    git_short_sha = git_value(root, "rev-parse", "--short=7", "HEAD")
    build_id = f"{package.get('version', '0.0.0')}+{git_short_sha}"
    profile_id = f"{q_name.lower()}-cloudflare-profile-{build_id.split('+', 1)[-1]}"

    profile = {
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "profileId": profile_id,
        "qName": q_name,
        "trainingBundleId": training_bundle_id,
        "sessionId": session_id,
        "buildId": build_id,
        "rules": PROFILE_RULES,
    }

    worker_module_path.parent.mkdir(parents=True, exist_ok=True)
    worker_module_path.write_text(render_ts_module(profile), encoding="utf-8")

    report = {
        **profile,
        "ready": True,
        "workerModulePath": relative_path(root, worker_module_path),
        "ruleCount": len(PROFILE_RULES),
        "output": {
            "workerModulePath": relative_path(root, worker_module_path),
            "manifestPath": relative_path(root, manifest_path),
            "markdownPath": relative_path(root, markdown_path),
        },
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
