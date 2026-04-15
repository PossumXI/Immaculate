import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


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


def relative_path(root: Path, path_value: Path) -> str:
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def git_value(root: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=str(root), check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return "unknown"
    value = result.stdout.strip()
    return value or "unknown"


def build_release_summary(root: Path) -> dict:
    package_version = load_json(root / "package.json").get("version", "0.0.0")
    git_sha = git_value(root, "rev-parse", "HEAD")
    git_short_sha = git_value(root, "rev-parse", "--short=7", "HEAD")
    return {
        "packageVersion": package_version,
        "gitSha": git_sha,
        "gitShortSha": git_short_sha,
        "buildId": f"{package_version}+{git_short_sha}",
    }


def parse_tenancy_id(config_path: Path) -> str:
    for raw_line in config_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("tenancy"):
            _, _, value = raw_line.partition("=")
            return value.strip()
    raise ValueError(f"Unable to resolve tenancy from {config_path}.")


def parse_service_error(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            payload = json.loads(text[start : end + 1])
            if isinstance(payload, dict):
                return payload
        except json.JSONDecodeError:
            pass
    return {}


def run_oci_json(oci_bin: str, config_file: Path, profile: str, args: list[str]) -> dict:
    result = subprocess.run(
        [
            oci_bin,
            *args,
            "--config-file",
            str(config_file),
            "--profile",
            profile,
            "--output",
            "json",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        error_payload = parse_service_error((result.stderr or "") + "\n" + (result.stdout or ""))
        code = str(error_payload.get("code", "OCICommandFailed")).strip() or "OCICommandFailed"
        message = str(error_payload.get("message", result.stderr.strip() or result.stdout.strip() or "OCI command failed.")).strip()
        raise RuntimeError(json.dumps({"code": code, "message": message}))
    payload = json.loads(result.stdout or "{}")
    if not isinstance(payload, dict):
        raise ValueError("OCI command did not return a JSON object.")
    return payload


def format_region_label(region_name: str, region_key: str, is_home_region: bool = False) -> str:
    label = region_name
    if region_key:
        label = f"{label} ({region_key})"
    if is_home_region:
        label = f"{label} [home]"
    return label


def render_markdown(report: dict) -> str:
    subscribed_before = report.get("subscribedRegionsBefore", [])
    subscribed_after = report.get("subscribedRegionsAfter", [])
    attempts = report.get("candidateAttempts", [])
    summary = report.get("summary", {})
    output = report.get("output", {})

    lines = [
        "# OCI Region Capacity",
        "",
        "This page records the real OCI region-capacity move for the active Q cloud-training lane.",
        "",
        f"- Generated: `{report.get('generatedAt', 'n/a')}`",
        f"- Release: `{report.get('release', {}).get('buildId', 'n/a') if isinstance(report.get('release', {}), dict) else 'n/a'}`",
        f"- Controller region: `{report.get('controllerRegion', 'n/a')}`",
        f"- Tenancy id: `{report.get('tenancyId', 'n/a')}`",
        "",
        "## Subscribed Regions Before",
        "",
    ]

    if isinstance(subscribed_before, list) and subscribed_before:
        for entry in subscribed_before:
            if not isinstance(entry, dict):
                continue
            lines.append(
                f"- {format_region_label(str(entry.get('regionName', 'unknown')), str(entry.get('regionKey', '')), bool(entry.get('isHomeRegion', False)))}: `{entry.get('status', 'unknown')}`"
            )
    else:
        lines.append("- none")

    lines.extend(["", "## Candidate Subscription Attempts", ""])
    if isinstance(attempts, list) and attempts:
        for entry in attempts:
            if not isinstance(entry, dict):
                continue
            lines.extend(
                [
                    f"- {format_region_label(str(entry.get('regionName', 'unknown')), str(entry.get('regionKey', '')))}: `{entry.get('status', 'unknown')}`",
                    f"  Code: `{entry.get('code', 'n/a')}`",
                    f"  Message: {entry.get('message', 'n/a')}",
                ]
            )
    else:
        lines.append("- no attempts recorded")

    lines.extend(["", "## Subscribed Regions After", ""])
    if isinstance(subscribed_after, list) and subscribed_after:
        for entry in subscribed_after:
            if not isinstance(entry, dict):
                continue
            lines.append(
                f"- {format_region_label(str(entry.get('regionName', 'unknown')), str(entry.get('regionKey', '')), bool(entry.get('isHomeRegion', False)))}: `{entry.get('status', 'unknown')}`"
            )
    else:
        lines.append("- none")

    lines.extend(
        [
            "",
            "## Summary",
            "",
            f"- Latest attempt status: `{summary.get('latestAttemptStatus', 'unknown')}`",
            f"- Subscription limit reached: `{summary.get('subscriptionLimitReached', False)}`",
            f"- Recommended next step: {summary.get('recommendedNextStep', 'n/a')}",
            "",
            "## Output",
            "",
            f"- JSON: `{output.get('jsonPath', 'n/a')}`",
            f"- Markdown: `{output.get('markdownPath', 'n/a')}`",
            "",
            "## Truth Boundary",
            "",
            "- This page records actual OCI subscription attempts against the current tenancy.",
            "- A public region name is not treated as available capacity until the tenancy subscribes it successfully.",
            "- A subscribed region is still not treated as launch-ready GPU capacity until the Q hybrid session doctor proves a concrete target region and shape.",
        ]
    )
    return "\n".join(lines) + "\n"


def normalize_region_entries(payload: dict) -> list[dict]:
    entries = payload.get("data", [])
    if not isinstance(entries, list):
        return []
    normalized = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        normalized.append(
            {
                "regionKey": str(entry.get("region-key", entry.get("key", ""))).strip(),
                "regionName": str(entry.get("region-name", entry.get("name", ""))).strip(),
                "status": str(entry.get("status", "")).strip() or "READY",
                "isHomeRegion": bool(entry.get("is-home-region", False)),
            }
        )
    return normalized


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Attempt OCI region subscriptions and publish a stamped capacity report.")
    parser.add_argument("--oci-bin", default=str(root / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe"))
    parser.add_argument("--config-file", default=str(root / ".training-output" / "q" / "oci-controller" / "DEFAULT.config"))
    parser.add_argument("--profile", default="DEFAULT")
    parser.add_argument("--tenancy-id", default="")
    parser.add_argument("--region-key", action="append", dest="region_keys")
    parser.add_argument("--output-json", default=str(root / "docs" / "wiki" / "OCI-Region-Capacity.json"))
    parser.add_argument("--output-markdown", default=str(root / "docs" / "wiki" / "OCI-Region-Capacity.md"))
    args = parser.parse_args()

    oci_bin = str(Path(args.oci_bin).expanduser().resolve(strict=False))
    config_file = Path(args.config_file).expanduser().resolve(strict=False)
    output_json_path = Path(args.output_json).expanduser().resolve(strict=False)
    output_markdown_path = Path(args.output_markdown).expanduser().resolve(strict=False)

    if not config_file.exists():
        raise ValueError(f"OCI config file not found: {config_file}")

    tenancy_id = args.tenancy_id.strip() or parse_tenancy_id(config_file)
    region_keys = [key.strip().upper() for key in (args.region_keys or ["PHX", "SJC", "ORD"]) if key.strip()]

    public_regions_payload = run_oci_json(oci_bin, config_file, args.profile, ["iam", "region", "list", "--all"])
    public_regions = {entry["regionKey"]: entry for entry in normalize_region_entries(public_regions_payload)}
    before_payload = run_oci_json(oci_bin, config_file, args.profile, ["iam", "region-subscription", "list", "--all"])
    subscribed_before = normalize_region_entries(before_payload)
    subscribed_region_keys = {entry["regionKey"] for entry in subscribed_before}

    attempts: list[dict] = []
    for region_key in region_keys:
        public_entry = public_regions.get(region_key, {"regionKey": region_key, "regionName": region_key})
        if region_key in subscribed_region_keys:
            attempts.append(
                {
                    "regionKey": region_key,
                    "regionName": public_entry["regionName"],
                    "status": "already-subscribed",
                    "code": "AlreadySubscribed",
                    "message": "This tenancy is already subscribed to the region.",
                }
            )
            continue
        try:
            run_oci_json(
                oci_bin,
                config_file,
                args.profile,
                [
                    "iam",
                    "region-subscription",
                    "create",
                    "--region-key",
                    region_key,
                    "--tenancy-id",
                    tenancy_id,
                ],
            )
            attempts.append(
                {
                    "regionKey": region_key,
                    "regionName": public_entry["regionName"],
                    "status": "subscribed",
                    "code": "Subscribed",
                    "message": "Region subscription request succeeded.",
                }
            )
        except RuntimeError as error:
            payload = json.loads(str(error))
            code = str(payload.get("code", "OCICommandFailed")).strip() or "OCICommandFailed"
            message = str(payload.get("message", "OCI region subscription attempt failed.")).strip()
            status = "blocked" if code == "TenantCapacityExceeded" else "error"
            attempts.append(
                {
                    "regionKey": region_key,
                    "regionName": public_entry["regionName"],
                    "status": status,
                    "code": code,
                    "message": message,
                }
            )

    after_payload = run_oci_json(oci_bin, config_file, args.profile, ["iam", "region-subscription", "list", "--all"])
    subscribed_after = normalize_region_entries(after_payload)
    latest_attempt = attempts[-1] if attempts else {}
    subscription_limit_reached = any(str(entry.get("code", "")).strip() == "TenantCapacityExceeded" for entry in attempts)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "release": build_release_summary(root),
        "controllerRegion": next((entry["regionName"] for entry in subscribed_after if entry.get("isHomeRegion")), subscribed_after[0]["regionName"] if subscribed_after else "unknown"),
        "tenancyId": tenancy_id,
        "subscribedRegionsBefore": subscribed_before,
        "candidateAttempts": attempts,
        "subscribedRegionsAfter": subscribed_after,
        "summary": {
            "latestAttemptStatus": str(latest_attempt.get("status", "none")).strip() or "none",
            "latestAttemptCode": str(latest_attempt.get("code", "")).strip() or None,
            "latestAttemptMessage": str(latest_attempt.get("message", "")).strip() or None,
            "subscriptionLimitReached": subscription_limit_reached,
            "recommendedNextStep": (
                "Increase the tenancy's allowed subscribed-region limit or upgrade the OCI tenancy tier, then rerun the bench-v2 doctor."
                if subscription_limit_reached
                else (
                    "Rerun the bench-v2 doctor so the OCI advisor can promote the new target region and shape."
                    if any(str(entry.get("status", "")).strip() == "subscribed" for entry in attempts)
                    else "No new region subscription succeeded. Review the OCI error codes before retrying."
                )
            ),
        },
        "output": {
            "jsonPath": relative_path(root, output_json_path),
            "markdownPath": relative_path(root, output_markdown_path),
        },
    }

    save_json(output_json_path, report)
    save_markdown(output_markdown_path, render_markdown(report))
    sys.stdout.write(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
