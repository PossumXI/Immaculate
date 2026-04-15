import argparse
import json
import os
import shutil
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
    candidates = [
        root / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe",
        root.parent / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe",
        root.parent / "Immaculate-q-gateway" / ".tools" / "oci-cli-venv" / "Scripts" / "oci.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.resolve(strict=False))
    return shutil.which("oci") or "oci"


def resolve_repo_path(root: Path, raw_value: str) -> Path | None:
    raw = raw_value.strip()
    if not raw:
        return None
    candidate = Path(raw).expanduser()
    if candidate.is_absolute():
        return candidate.resolve(strict=False)
    return (root / candidate).resolve(strict=False)


def parse_env_file(path_value: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path_value.exists():
        return values
    for raw_line in path_value.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        values[key.strip()] = value.strip().strip("'").strip('"')
    return values


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


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Prepare or create the OCI support limit request for subscribed-region-count.")
    parser.add_argument("--session", default="")
    parser.add_argument("--oci-bin", default="")
    parser.add_argument("--config-file", default="")
    parser.add_argument("--profile", default="")
    parser.add_argument("--csi", default=os.getenv("OCI_SUPPORT_CSI", ""))
    parser.add_argument("--severity", default="LOW")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--create", action="store_true")
    parser.add_argument("--output-json", default="")
    args = parser.parse_args()

    if not args.check and not args.create:
        args.check = True

    oci_bin = resolve_oci_bin(root, args.oci_bin)
    session_path = resolve_repo_path(root, args.session) if args.session else None
    session_manifest = load_json(session_path) if session_path and session_path.exists() else {}
    session_id = str(session_manifest.get("sessionId", "")).strip() or "standalone-oci-limit-request"

    cloud = session_manifest.get("cloud", {}) if isinstance(session_manifest, dict) else {}
    cloud_inline_env = cloud.get("inlineEnv", {}) if isinstance(cloud, dict) else {}
    env_file_values: dict[str, str] = {}
    for raw_path in cloud.get("envFilePath", []) if isinstance(cloud, dict) else []:
        env_path = resolve_repo_path(root, str(raw_path))
        if env_path is None:
            continue
        env_file_values.update(parse_env_file(env_path))

    resolved_config_path = (
        resolve_repo_path(root, args.config_file)
        or resolve_repo_path(root, env_file_values.get("OCI_CLI_CONFIG_FILE", ""))
        or resolve_repo_path(root, env_file_values.get("OCI_CONFIG_FILE", ""))
        or (root / ".training-output" / "q" / "oci-controller" / "DEFAULT.config")
    )
    resolved_profile = (
        args.profile.strip()
        or str(env_file_values.get("OCI_CLI_PROFILE", "")).strip()
        or str(env_file_values.get("OCI_PROFILE", "")).strip()
        or "DEFAULT"
    )
    if resolved_config_path is None or not resolved_config_path.exists():
        raise ValueError("Unable to resolve a valid OCI config file for the limit request helper.")

    tenancy_id = parse_config_value(resolved_config_path, "tenancy")
    user_ocid = parse_config_value(resolved_config_path, "user")
    controller_region = parse_config_value(resolved_config_path, "region")
    if not tenancy_id or not user_ocid:
        raise ValueError("OCI config must contain tenancy and user values.")

    q_bundle_id = ""
    if session_manifest:
        q_section = session_manifest.get("q", {})
        if isinstance(q_section, dict):
            training_lock_path = resolve_repo_path(root, str(q_section.get("trainingLockPath", "")).strip())
            if training_lock_path and training_lock_path.exists():
                training_lock = load_json(training_lock_path)
                q_bundle_id = str(training_lock.get("bundleId", "")).strip()
    immaculate_bundle_id = ""
    if session_manifest:
        immaculate_section = session_manifest.get("immaculate", {})
        if isinstance(immaculate_section, dict):
            immaculate_bundle_path = resolve_repo_path(root, str(immaculate_section.get("bundleOutputPath", "")).strip())
            if immaculate_bundle_path and immaculate_bundle_path.exists():
                immaculate_bundle = load_json(immaculate_bundle_path)
                immaculate_bundle_id = str(immaculate_bundle.get("bundleId", "")).strip()

    support_validation_payload, support_validation_error = run_oci_json_or_error(
        oci_bin,
        resolved_config_path,
        resolved_profile,
        ["support", "validation-response", "validate-user", "--ocid", user_ocid, "--problem-type", "LIMIT"],
    )
    support_catalog_payload, support_catalog_error = run_oci_json_or_error(
        oci_bin,
        resolved_config_path,
        resolved_profile,
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
    region_subscription_limit_found = any(
        isinstance(entry, dict)
        and str(entry.get("resource-type-key", "")).strip() == "region-subscription"
        and any(
            isinstance(category, dict) and str(category.get("limit-id", "")).strip() == "region-subscription-limits"
            for category in entry.get("service-category-list", [])
        )
        for entry in support_catalog_entries
    )
    domain_entry, domain_error = discover_domain(oci_bin, resolved_config_path, resolved_profile, tenancy_id)
    domain_id = str(domain_entry.get("id", "")).strip() if isinstance(domain_entry, dict) else ""
    domain_display_name = str(domain_entry.get("display-name", "")).strip() if isinstance(domain_entry, dict) else ""

    title = f"OCI subscribed region limit increase for {session_id}"
    description_parts = [
        "Need an increase to regions.subscribed-region-count so the tenancy can subscribe a GPU-capable region.",
        "This is for the tracked Q hybrid training lane and the paired Immaculate cloud-training bundle.",
    ]
    if q_bundle_id:
        description_parts.append(f"Q bundle: {q_bundle_id}.")
    if immaculate_bundle_id:
        description_parts.append(f"Immaculate bundle: {immaculate_bundle_id}.")
    description_parts.append(
        "Current OCI region subscription attempts for PHX, SJC, and ORD return TenantCapacityExceeded."
    )
    description = " ".join(description_parts)

    csi_value = args.csi.strip()
    create_prerequisites_met = bool(csi_value and region_subscription_limit_found and not support_catalog_error)
    create_possible = create_prerequisites_met
    create_blocked_reason = None
    domain_binding_verified = None
    if not csi_value:
        create_blocked_reason = "CSI is missing. Set --csi or OCI_SUPPORT_CSI before creating the OCI support incident."
    elif not region_subscription_limit_found:
        create_blocked_reason = "OCI support LIMIT catalog does not expose region-subscription-limits for this controller identity."
    elif support_catalog_error:
        create_blocked_reason = str(support_catalog_error.get("message", "OCI support LIMIT catalog lookup failed.")).strip()

    create_command_redacted = [
        oci_bin,
        "support",
        "incident",
        "create",
        "--config-file",
        str(resolved_config_path),
        "--profile",
        resolved_profile,
        "--compartment-id",
        tenancy_id,
        "--csi",
        "<CSI_REQUIRED>",
        "--problem-type",
        "LIMIT",
        "--severity",
        args.severity.strip().upper(),
        "--title",
        title,
        "--description",
        description,
        "--ocid",
        user_ocid,
    ]
    if domain_id:
        create_command_redacted.extend(["--domainid", domain_id])

    default_output_path = (
        session_path.parent / "oci-region-limit-request.json"
        if session_path is not None
        else root / ".training-output" / "q" / "oci-region-limit-request.json"
    )
    output_json_path = resolve_repo_path(root, args.output_json) or default_output_path

    incident_payload = None
    incident_error = None
    if args.create:
        if not create_possible:
            incident_error = {"code": "MissingCSIOrSupportPath", "message": create_blocked_reason or "Unable to create the OCI support incident."}
        else:
            incident_payload, incident_error = run_oci_json_or_error(
                oci_bin,
                resolved_config_path,
                resolved_profile,
                [
                    "support",
                    "incident",
                    "create",
                    "--compartment-id",
                    tenancy_id,
                    "--csi",
                    csi_value,
                    "--problem-type",
                    "LIMIT",
                    "--severity",
                    args.severity.strip().upper(),
                    "--title",
                    title,
                    "--description",
                    description,
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

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "release": build_release_summary(root),
        "sessionId": session_id,
        "controllerRegion": controller_region,
        "configFile": relative_path(root, resolved_config_path),
        "profile": resolved_profile,
        "tenancyId": tenancy_id,
        "userOcid": user_ocid,
        "cloudTrainingLanes": ["Q", "Immaculate"],
        "qTrainingBundleId": q_bundle_id or None,
        "immaculateBundleId": immaculate_bundle_id or None,
        "support": {
            "validUserForLimit": bool(support_validation_payload.get("data", {}).get("is-valid-user", False)) if isinstance(support_validation_payload, dict) else False,
            "validationError": support_validation_error,
            "regionSubscriptionLimitFound": region_subscription_limit_found,
            "catalogError": support_catalog_error,
            "createPrerequisitesMet": create_prerequisites_met,
            "domainId": domain_id or None,
            "domainDisplayName": domain_display_name or None,
            "domainBindingVerified": domain_binding_verified,
            "domainError": domain_error,
            "csiProvided": bool(csi_value),
            "createPossible": create_possible,
            "createBlockedReason": create_blocked_reason,
        },
        "incidentRequest": {
            "title": title,
            "description": description,
            "severity": args.severity.strip().upper(),
            "problemType": "LIMIT",
            "createCommandRedacted": create_command_redacted,
            "createAttempted": bool(args.create),
            "created": bool(incident_payload and incident_payload.get("data")),
            "incident": incident_payload.get("data") if isinstance(incident_payload, dict) else None,
            "incidentError": incident_error,
        },
        "output": {
            "jsonPath": relative_path(root, output_json_path),
        },
    }
    save_json(output_json_path, payload)
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    if args.create and incident_error:
        sys.exit(1)


if __name__ == "__main__":
    main()
