import argparse
import json
import shutil
import site
import subprocess
import sys
import sysconfig
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


def resolve_oci_bin(root: Path, raw_value: str) -> str:
    raw = raw_value.strip()
    if raw:
        return str(Path(raw).expanduser().resolve(strict=False))
    script_dir_candidates = [
        Path(sys.executable).resolve(strict=False).parent,
        Path(sysconfig.get_path("scripts")).resolve(strict=False),
        Path(site.getuserbase()).resolve(strict=False) / ("Scripts" if sys.platform.startswith("win") else "bin"),
    ]
    candidates = []
    for script_dir in script_dir_candidates:
        candidates.append(script_dir / ("oci.exe" if sys.platform.startswith("win") else "oci"))
    candidates.extend(
        [
            root / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe",
            root.parent / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe",
            root.parent / "Immaculate-q-gateway" / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.resolve(strict=False))
    return shutil.which("oci") or "oci"


def parse_tenancy_id(config_path: Path) -> str:
    for raw_line in config_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("tenancy"):
            _, _, value = raw_line.partition("=")
            return value.strip()
    raise ValueError(f"Unable to resolve tenancy from {config_path}.")


def parse_config_value(config_path: Path, field_name: str) -> str:
    for raw_line in config_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith(field_name.lower()):
            _, _, value = raw_line.partition("=")
            return value.strip()
    return ""


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


def run_oci_json_or_error(oci_bin: str, config_file: Path, profile: str, args: list[str]) -> tuple[dict | None, dict | None]:
    try:
        return run_oci_json(oci_bin, config_file, profile, args), None
    except RuntimeError as error:
        return None, json.loads(str(error))


def discover_domain(oci_bin: str, config_file: Path, profile: str, tenancy_id: str) -> tuple[dict | None, dict | None]:
    payload, error = run_oci_json_or_error(
        oci_bin,
        config_file,
        profile,
        ["iam", "domain", "list", "--compartment-id", tenancy_id, "--all"],
    )
    entries = payload.get("data", []) if isinstance(payload, dict) else []
    preferred = next(
        (
            entry
            for entry in entries
            if isinstance(entry, dict)
            and str(entry.get("lifecycle-state", "")).strip() == "ACTIVE"
            and str(entry.get("type", "")).strip() == "DEFAULT"
        ),
        None,
    )
    if preferred is None:
        preferred = next(
            (
                entry
                for entry in entries
                if isinstance(entry, dict) and str(entry.get("lifecycle-state", "")).strip() == "ACTIVE"
            ),
            None,
        )
    return preferred, error


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
    limit = report.get("limit", {})
    support = report.get("support", {})
    output = report.get("output", {})

    lines = [
        "# OCI Region Capacity",
        "",
        "This page records the real OCI region-capacity move for the active Q cloud-training lane and the paired Immaculate cloud bundle.",
        "",
        f"- Generated: `{report.get('generatedAt', 'n/a')}`",
        f"- Release: `{report.get('release', {}).get('buildId', 'n/a') if isinstance(report.get('release', {}), dict) else 'n/a'}`",
        f"- Controller region: `{report.get('controllerRegion', 'n/a')}`",
        f"- Tenancy id: `{report.get('tenancyId', 'n/a')}`",
        f"- Cloud training lanes: `{', '.join(report.get('cloudTrainingLanes', [])) or 'n/a'}`",
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
            "## Live Limit Surface",
            "",
            f"- Limit definition: `{limit.get('definitionName', 'n/a')}`",
            f"- Current limit value: `{limit.get('currentValue', 'n/a')}`",
            f"- Eligible for limit increase: `{limit.get('eligibleForIncrease', False)}`",
            f"- Scope type: `{limit.get('scopeType', 'n/a')}`",
            "",
            "## Support CLI Path",
            "",
            f"- Support user valid generally: `{support.get('generalValidation', {}).get('validUser', False)}`",
            f"- Support user valid for LIMIT: `{support.get('validUser', False)}`",
            f"- Write-permitted support groups: `{len(support.get('generalValidation', {}).get('writePermittedUserGroups', []))}`",
            f"- LIMIT catalog includes region-subscription-limits: `{support.get('regionSubscriptionLimitFound', False)}`",
            f"- CLI support create ready now: `{support.get('createPossible', False)}`",
            f"- CLI create blocker: {support.get('createBlockedReason', 'n/a')}",
            f"- Discovered support-domain candidate: `{support.get('domainDisplayName') or support.get('domainId') or 'n/a'}`",
            f"- Support-domain binding verified: `{support.get('domainBindingVerified') if support.get('domainBindingVerified') is not None else 'unknown'}`",
            f"- Incident created: `{bool(support.get('incident'))}`",
            f"- Incident error: {support.get('incidentError', {}).get('message', 'n/a') if isinstance(support.get('incidentError'), dict) else 'n/a'}",
            f"- Helper path: `{support.get('helperPath', 'training/q/create_oci_region_limit_request.py')}`",
            f"- Helper check command: `{support.get('helperCheckCommand', 'python training/q/create_oci_region_limit_request.py --check')}`",
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
    parser.add_argument("--oci-bin", default="")
    parser.add_argument("--config-file", default=str(root / ".training-output" / "q" / "oci-controller" / "DEFAULT.config"))
    parser.add_argument("--profile", default="DEFAULT")
    parser.add_argument("--tenancy-id", default="")
    parser.add_argument("--csi", default="")
    parser.add_argument("--create-limit-request", action="store_true")
    parser.add_argument("--region-key", action="append", dest="region_keys")
    parser.add_argument("--output-json", default=str(root / "docs" / "wiki" / "OCI-Region-Capacity.json"))
    parser.add_argument("--output-markdown", default=str(root / "docs" / "wiki" / "OCI-Region-Capacity.md"))
    args = parser.parse_args()

    oci_bin = resolve_oci_bin(root, args.oci_bin)
    config_file = Path(args.config_file).expanduser().resolve(strict=False)
    output_json_path = Path(args.output_json).expanduser().resolve(strict=False)
    output_markdown_path = Path(args.output_markdown).expanduser().resolve(strict=False)

    if not config_file.exists():
        raise ValueError(f"OCI config file not found: {config_file}")

    tenancy_id = args.tenancy_id.strip() or parse_tenancy_id(config_file)
    user_ocid = parse_config_value(config_file, "user")
    csi = args.csi.strip()
    region_keys = [key.strip().upper() for key in (args.region_keys or ["PHX", "SJC", "ORD"]) if key.strip()]

    limit_definitions_payload = run_oci_json(
        oci_bin,
        config_file,
        args.profile,
        ["limits", "definition", "list", "--compartment-id", tenancy_id, "--service-name", "regions", "--all"],
    )
    limit_values_payload = run_oci_json(
        oci_bin,
        config_file,
        args.profile,
        ["limits", "value", "list", "--compartment-id", tenancy_id, "--service-name", "regions", "--all"],
    )
    limit_definition = next(
        (
            entry
            for entry in limit_definitions_payload.get("data", [])
            if isinstance(entry, dict) and str(entry.get("name", "")).strip() == "subscribed-region-count"
        ),
        {},
    )
    limit_value = next(
        (
            entry
            for entry in limit_values_payload.get("data", [])
            if isinstance(entry, dict) and str(entry.get("name", "")).strip() == "subscribed-region-count"
        ),
        {},
    )

    support_validation_payload, support_validation_error = run_oci_json_or_error(
        oci_bin,
        config_file,
        args.profile,
        ["support", "validation-response", "validate-user", "--ocid", user_ocid],
    )
    limit_validation_payload, limit_validation_error = run_oci_json_or_error(
        oci_bin,
        config_file,
        args.profile,
        ["support", "validation-response", "validate-user", "--ocid", user_ocid, "--problem-type", "LIMIT"],
    )
    support_catalog_payload, support_catalog_error = run_oci_json_or_error(
        oci_bin,
        config_file,
        args.profile,
        [
            "support",
            "incident-resource-type",
            "list",
            "--problem-type",
            "LIMIT",
            "--compartment-id",
            tenancy_id,
            "--ocid",
            user_ocid,
            "--all",
        ],
    )
    support_catalog_entries = support_catalog_payload.get("data", []) if isinstance(support_catalog_payload, dict) else []
    region_subscription_catalog_entry = next(
        (
            entry
            for entry in support_catalog_entries
            if isinstance(entry, dict) and str(entry.get("resource-type-key", "")).strip() == "region-subscription"
        ),
        {},
    )
    region_subscription_limit_found = any(
        isinstance(category, dict) and str(category.get("limit-id", "")).strip() == "region-subscription-limits"
        for category in region_subscription_catalog_entry.get("service-category-list", [])
        if isinstance(region_subscription_catalog_entry, dict)
    )
    domain_entry, domain_error = discover_domain(oci_bin, config_file, args.profile, tenancy_id)
    domain_id = str(domain_entry.get("id", "")).strip() if isinstance(domain_entry, dict) else ""
    domain_display_name = str(domain_entry.get("display-name", "")).strip() if isinstance(domain_entry, dict) else ""

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
    create_prerequisites_met = bool(csi and region_subscription_limit_found and not support_catalog_error)
    create_possible = create_prerequisites_met
    create_blocked_reason = ""
    domain_binding_verified = None
    incident_payload = None
    incident_error = None
    if not csi:
        create_blocked_reason = "CSI is required by `oci support incident create` and is not present in the local controller config or workspace."
    elif not region_subscription_limit_found:
        create_blocked_reason = "OCI support LIMIT catalog did not expose `region-subscription-limits` for this controller identity."
    elif support_catalog_error:
        create_blocked_reason = str(support_catalog_error.get("message", "OCI support LIMIT catalog lookup failed.")).strip()

    if args.create_limit_request and create_possible:
        incident_title = "OCI subscribed region limit increase for Q and Immaculate cloud training"
        incident_description = (
            "Need an increase to regions.subscribed-region-count so the tenancy can subscribe a GPU-capable region for the "
            "Q hybrid training session and the paired Immaculate cloud-training bundle. Current create_region_subscription "
            "attempts for PHX, SJC, and ORD return TenantCapacityExceeded."
        )
        incident_payload, incident_error = run_oci_json_or_error(
            oci_bin,
            config_file,
            args.profile,
            [
                "support",
                "incident",
                "create",
                "--compartment-id",
                tenancy_id,
                "--csi",
                csi,
                "--problem-type",
                "LIMIT",
                "--severity",
                "LOW",
                "--title",
                incident_title,
                "--description",
                incident_description,
                "--ocid",
                user_ocid,
                *(["--domainid", domain_id] if domain_id else []),
            ],
        )
        if isinstance(incident_payload, dict) and incident_payload.get("data"):
            domain_binding_verified = True
        elif isinstance(incident_error, dict):
            create_possible = False
            create_blocked_reason = str(
                incident_error.get("message", "OCI support incident creation failed for this controller identity.")
            ).strip() or "OCI support incident creation failed for this controller identity."
            if str(incident_error.get("code", "")).strip() in {"DOMAIN_NOT_FOUND", "USER_OR_DOMAIN_NOT_FOUND"}:
                domain_binding_verified = False

    write_permitted_groups = []
    if isinstance(support_validation_payload, dict):
        raw_groups = support_validation_payload.get("data", {}).get("write-permitted-user-group-infos", [])
        if isinstance(raw_groups, list):
            for group in raw_groups:
                if not isinstance(group, dict):
                    continue
                write_permitted_groups.append(
                    {
                        "userGroupId": str(group.get("user-group-id", "")).strip(),
                        "userGroupName": str(group.get("user-group-name", "")).strip(),
                    }
                )

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "release": build_release_summary(root),
        "controllerRegion": next((entry["regionName"] for entry in subscribed_after if entry.get("isHomeRegion")), subscribed_after[0]["regionName"] if subscribed_after else "unknown"),
        "tenancyId": tenancy_id,
        "cloudTrainingLanes": ["Q", "Immaculate"],
        "subscribedRegionsBefore": subscribed_before,
        "candidateAttempts": attempts,
        "subscribedRegionsAfter": subscribed_after,
        "limit": {
            "serviceName": "regions",
            "definitionName": str(limit_definition.get("name", "")).strip() or "subscribed-region-count",
            "description": str(limit_definition.get("description", "")).strip() or "Subscribed region count",
            "eligibleForIncrease": bool(limit_definition.get("is-eligible-for-limit-increase", False)),
            "scopeType": str(limit_definition.get("scope-type", "")).strip() or "GLOBAL",
            "currentValue": limit_value.get("value"),
        },
        "support": {
            "userOcid": user_ocid,
            "validUser": bool(limit_validation_payload.get("data", {}).get("is-valid-user", False)) if isinstance(limit_validation_payload, dict) else False,
            "validationError": limit_validation_error,
            "generalValidation": {
                "validUser": bool(support_validation_payload.get("data", {}).get("is-valid-user", False)) if isinstance(support_validation_payload, dict) else False,
                "writePermittedUserGroups": write_permitted_groups,
            },
            "regionSubscriptionLimitFound": region_subscription_limit_found,
            "limitCatalogError": support_catalog_error,
            "createPrerequisitesMet": create_prerequisites_met,
            "createPossible": create_possible,
            "createBlockedReason": create_blocked_reason or None,
            "domainId": domain_id or None,
            "domainDisplayName": domain_display_name or None,
            "domainBindingVerified": domain_binding_verified,
            "domainError": domain_error,
            "incident": incident_payload.get("data") if isinstance(incident_payload, dict) else None,
            "incidentError": incident_error,
            "helperPath": "training/q/create_oci_region_limit_request.py",
            "helperCheckCommand": "python training/q/create_oci_region_limit_request.py --check",
        },
        "summary": {
            "latestAttemptStatus": str(latest_attempt.get("status", "none")).strip() or "none",
            "latestAttemptCode": str(latest_attempt.get("code", "")).strip() or None,
            "latestAttemptMessage": str(latest_attempt.get("message", "")).strip() or None,
            "subscriptionLimitReached": subscription_limit_reached,
            "recommendedNextStep": (
                (
                    f"OCI support incident creation is still blocked for this controller identity. Current error: {str(incident_error.get('message', '')).strip()}. Open the limit increase manually in OCI/My Oracle Support or fix the support-account identity binding, then rerun the bench-v2 doctor for the Q and Immaculate cloud lanes."
                    if isinstance(incident_error, dict)
                    else (
                        "Provide the tenancy CSI to `oci support incident create` for `regions.subscribed-region-count`, then rerun the bench-v2 doctor for the Q and Immaculate cloud lanes."
                        if bool(limit_definition.get("is-eligible-for-limit-increase", False)) and not create_possible
                        else "Create the support-backed limit increase for `regions.subscribed-region-count`, then rerun the bench-v2 doctor for the Q and Immaculate cloud lanes."
                    )
                )
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
