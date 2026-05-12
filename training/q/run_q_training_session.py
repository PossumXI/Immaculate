import argparse
import json
import os
import re
import shutil
import site
import subprocess
import sys
import sysconfig
import tarfile
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path


ENV_LINE_PATTERN = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")
HF_TOKEN_SECRET_OCID = "OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID"
WANDB_API_KEY_SECRET_OCID = "OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID"
CANONICAL_ENV_ALIASES: dict[str, tuple[str, ...]] = {
    "HF_TOKEN": ("HF_TOKEN", "HUGGINGFACE_TOKEN", "HUGGINFACE_ACCESS_TOKEN"),
    "WANDB_API_KEY": ("WANDB_API_KEY", "IMMACULATE_WANDB_API_KEY"),
    "WANDB_ENTITY": ("WANDB_ENTITY", "IMMACULATE_WANDB_ENTITY"),
    "WANDB_PROJECT": ("WANDB_PROJECT", "IMMACULATE_WANDB_PROJECT"),
    "WANDB_MODE": ("WANDB_MODE", "IMMACULATE_WANDB_MODE"),
    "OCI_CLI_AUTH": ("OCI_CLI_AUTH",),
    "OCI_CLI_CONFIG_FILE": ("OCI_CLI_CONFIG_FILE", "OCI_CONFIG_FILE"),
    "OCI_CLI_PROFILE": ("OCI_CLI_PROFILE", "OCI_PROFILE"),
    "OCI_CLI_USER": ("OCI_CLI_USER", "OCI_USER"),
    "OCI_CLI_TENANCY": ("OCI_CLI_TENANCY", "OCI_TENANCY"),
    "OCI_CLI_FINGERPRINT": ("OCI_CLI_FINGERPRINT", "OCI_FINGERPRINT"),
    "OCI_CLI_REGION": ("OCI_CLI_REGION", "OCI_REGION"),
    "OCI_CLI_KEY_FILE": ("OCI_CLI_KEY_FILE", "OCI_KEY_FILE"),
}


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

    if session_value:
        normalized.extend(["--session", session_value])
    if "--doctor" in argv[1:] or truthy_env("npm_config_doctor"):
        normalized.append("--doctor")
    if "--launch" in argv[1:] or truthy_env("npm_config_launch"):
        normalized.append("--launch")
    return normalized


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


def try_load_json(path_value: Path | None) -> dict | None:
    if path_value is None or not path_value.exists():
        return None
    try:
        return load_json(path_value)
    except Exception:
        return None


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


def resolve_repo_paths(path_value: object) -> list[Path]:
    if isinstance(path_value, list):
        resolved: list[Path] = []
        for entry in path_value:
            candidate = resolve_repo_path(str(entry).strip())
            if candidate is not None:
                resolved.append(candidate)
        return resolved
    if isinstance(path_value, str):
        candidate = resolve_repo_path(path_value.strip())
        return [candidate] if candidate is not None else []
    return []


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


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def summarize_session_pointer(root: Path, path_value: Path) -> dict[str, object]:
    payload = try_load_json(path_value)
    manifest_pointer = str(payload.get("manifestPath", "")).strip() if isinstance(payload, dict) else ""
    manifest_path = resolve_repo_path(manifest_pointer) if manifest_pointer else None
    return {
        "path": relative_path(root, path_value),
        "exists": path_value.exists(),
        "sessionId": str(payload.get("sessionId", "")).strip() if isinstance(payload, dict) else None,
        "manifestPath": manifest_pointer or None,
        "manifestExists": bool(manifest_path and manifest_path.exists()),
    }


def build_sessionless_doctor_report(root: Path) -> dict[str, object]:
    candidates = [
        root / ".training-output" / "q" / "latest-hybrid-session.json",
        root / "docs" / "wiki" / "Q-Hybrid-Training.json",
    ]
    return {
        "generatedAt": utc_timestamp(),
        "status": "session-required",
        "ready": False,
        "session": {
            "provided": False,
            "requiredFor": ["training-lane-validation", "launch"],
            "candidatePointers": [summarize_session_pointer(root, path_value) for path_value in candidates],
        },
        "nextStep": (
            "Pass --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json, "
            "or run npm run q:training:promote-benchmark to stamp the active benchmark session."
        ),
    }


def ocid_region_key(value: str | None) -> str:
    text = str(value or "").strip()
    parts = text.split(".")
    if len(parts) >= 4 and parts[0] == "ocid1":
        return parts[3].strip().upper()
    return ""


def region_label_token(region_name: str | None) -> str:
    text = str(region_name or "").strip().upper()
    if not text:
        return ""
    parts = [part for part in re.split(r"[^A-Z0-9]+", text) if part and not part.isdigit()]
    if len(parts) >= 2:
        return "".join(parts[1:])
    return "".join(parts)


def availability_domain_matches_region(ad_name: str | None, region_name: str | None) -> bool:
    ad_token = re.sub(r"[^A-Z0-9]", "", str(ad_name or "").upper())
    region_token = re.sub(r"[^A-Z0-9]", "", region_label_token(region_name))
    return bool(ad_token and region_token and region_token in ad_token)


def count_jsonl_rows(path_value: Path) -> int:
    row_count = 0
    with path_value.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                row_count += 1
    return row_count


def sha256_file(path_value: Path) -> str:
    digest = sha256()
    with path_value.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def normalize_command(command_value: object) -> list[str]:
    if isinstance(command_value, list):
        return [str(entry) for entry in command_value if str(entry).strip()]
    if isinstance(command_value, str) and command_value.strip():
        return [command_value.strip()]
    return []


def python_module_available(python_executable: str, module_name: str) -> bool:
    result = subprocess.run(
        [python_executable, "-c", f"import {module_name}"],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def should_probe_local_dependencies(*, local_enabled: bool, local_mode: str, local_python_present: bool) -> bool:
    return local_enabled and local_mode not in {"skip", "disabled"} and local_python_present


def default_cloud_env(provider: str) -> list[str]:
    defaults = {
        "oci": [
            "OCI_COMPARTMENT_OCID",
            "OCI_SUBNET_OCID",
            "OCI_AVAILABILITY_DOMAIN",
            "OCI_IMAGE_OCID",
            "OCI_SHAPE",
            "OCI_OBJECT_STORAGE_NAMESPACE",
            "OCI_OBJECT_STORAGE_BUCKET",
        ],
        "hf_jobs": ["HF_TOKEN"],
        "runpod": ["HF_TOKEN", "RUNPOD_API_KEY"],
        "vast": ["HF_TOKEN", "VAST_API_KEY"],
        "modal": ["HF_TOKEN", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
        "custom": ["HF_TOKEN"],
    }
    return defaults.get(provider, ["HF_TOKEN"])


def locate_hf_cli(root: Path, env_map: dict[str, str]) -> str:
    explicit = str(env_map.get("HF_CLI_BIN", "")).strip()
    if explicit:
        return explicit
    for base in (root, root.parent):
        local_windows = base / ".tools" / "foundry-venv" / "Scripts" / "hf.exe"
        if local_windows.exists():
            return str(local_windows)
        local_posix = base / ".tools" / "foundry-venv" / "bin" / "hf"
        if local_posix.exists():
            return str(local_posix)
    return shutil.which("hf") or "hf"


def locate_oci_cli(root: Path, env_map: dict[str, str]) -> str:
    explicit = str(env_map.get("OCI_CLI_BIN", "")).strip()
    if explicit:
        return explicit
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


def hf_gpu_flavor_names(hardware_entries: object) -> list[str]:
    names: list[str] = []
    if not isinstance(hardware_entries, list):
        return names
    for entry in hardware_entries:
        if not isinstance(entry, dict):
            continue
        accelerator = str(entry.get("accelerator", "")).strip()
        name = str(entry.get("name", "")).strip()
        if not name:
            continue
        if accelerator and accelerator.upper() != "N/A":
            names.append(name)
    return names


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
        key = match.group(1).strip()
        value = strip_optional_quotes(match.group(2).strip())
        values[key] = value
    return values


def save_env_file(path_value: Path, updates: dict[str, str]) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    existing_lines = path_value.read_text(encoding="utf-8").splitlines() if path_value.exists() else []
    remaining = dict(updates)
    rendered_lines: list[str] = []
    for raw_line in existing_lines:
        match = ENV_LINE_PATTERN.match(raw_line)
        if not match:
            rendered_lines.append(raw_line)
            continue
        key = match.group(1).strip()
        if key not in remaining:
            rendered_lines.append(raw_line)
            continue
        rendered_lines.append(f"{key}={remaining.pop(key)}")
    if rendered_lines and rendered_lines[-1].strip():
        rendered_lines.append("")
    for key, value in remaining.items():
        rendered_lines.append(f"{key}={value}")
    with path_value.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(rendered_lines).rstrip() + "\n")


def build_effective_env(env_file_paths: list[Path], inline_env: object) -> tuple[dict[str, str], list[dict[str, object]]]:
    effective_env = dict(os.environ)
    env_file_summaries: list[dict[str, object]] = []
    for env_path in env_file_paths:
        exists = env_path.exists()
        env_file_summaries.append(
            {
                "path": relative_path(repo_root(), env_path),
                "exists": exists,
            }
        )
        if exists:
            effective_env.update(load_env_file(env_path))
    if isinstance(inline_env, dict):
        for key, value in inline_env.items():
            key_text = str(key).strip()
            if not key_text:
                continue
            effective_env[key_text] = str(value)
    return effective_env, env_file_summaries


def first_present_env_value(env_map: dict[str, str], aliases: tuple[str, ...]) -> tuple[str | None, str | None]:
    for alias in aliases:
        value = str(env_map.get(alias, "")).strip()
        if value:
            return alias, value
    return None, None


def canonicalize_env(env_map: dict[str, str]) -> tuple[dict[str, str], dict[str, str]]:
    canonical_env = dict(env_map)
    sources: dict[str, str] = {}
    for canonical_name, aliases in CANONICAL_ENV_ALIASES.items():
        source_name, value = first_present_env_value(env_map, aliases)
        if source_name and value:
            canonical_env[canonical_name] = value
            sources[canonical_name] = source_name
    return canonical_env, sources


def parse_ini_like_config(path_value: Path) -> dict[str, dict[str, str]]:
    profiles: dict[str, dict[str, str]] = {}
    current_profile: str | None = None
    for raw_line in path_value.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        if line.startswith("[") and line.endswith("]"):
            current_profile = line[1:-1].strip()
            if current_profile:
                profiles.setdefault(current_profile, {})
            continue
        if current_profile is None or "=" not in raw_line:
            continue
        key, value = raw_line.split("=", 1)
        profiles[current_profile][key.strip()] = strip_optional_quotes(value.strip())
    return profiles


def find_session_oci_env_path(session_root: Path, env_file_paths: list[Path]) -> Path:
    expected = (session_root / "oci-cloud.env").resolve()
    for env_path in env_file_paths:
        try:
            if env_path.resolve() == expected:
                return expected
        except FileNotFoundError:
            if env_path == expected:
                return expected
    return expected


def resolve_candidate_oci_config_path(env_map: dict[str, str]) -> tuple[Path | None, str]:
    for alias in CANONICAL_ENV_ALIASES["OCI_CLI_CONFIG_FILE"]:
        value = str(env_map.get(alias, "")).strip()
        if not value:
            continue
        candidate = Path(value).expanduser()
        if not candidate.is_absolute():
            candidate = (repo_root() / candidate).resolve()
        return candidate, alias
    default_path = Path.home() / ".oci" / "config"
    return (default_path.resolve() if default_path.exists() else None), "default"


def resolve_candidate_oci_profile(env_map: dict[str, str]) -> str:
    for alias in CANONICAL_ENV_ALIASES["OCI_CLI_PROFILE"]:
        value = str(env_map.get(alias, "")).strip()
        if value:
            return value
    return "DEFAULT"


def resolve_candidate_oci_key_path(config_path: Path, key_file_value: str) -> tuple[Path | None, bool]:
    if not key_file_value.strip():
        return None, False
    key_candidate = Path(key_file_value).expanduser()
    if not key_candidate.is_absolute():
        key_candidate = (config_path.parent / key_candidate).resolve()
    if key_candidate.exists():
        return key_candidate.resolve(), False
    fallback = (config_path.parent / Path(key_file_value).name).resolve()
    if fallback.exists():
        return fallback, True
    return None, False


def materialize_oci_controller_config(
    root: Path,
    profile_name: str,
    source_values: dict[str, str],
    key_file_path: Path,
) -> Path:
    target_dir = root / ".training-output" / "q" / "oci-controller"
    target_dir.mkdir(parents=True, exist_ok=True)
    safe_profile = re.sub(r"[^A-Za-z0-9._-]+", "-", profile_name.strip() or "DEFAULT")
    target_path = target_dir / f"{safe_profile}.config"
    ordered_keys = ("user", "fingerprint", "tenancy", "region", "pass_phrase", "security_token_file")
    lines = [f"[{profile_name}]"]
    for key in ordered_keys:
        value = str(source_values.get(key, "")).strip()
        if value:
            lines.append(f"{key}={value}")
    lines.append(f"key_file={str(key_file_path.resolve()).replace('\\', '/')}")
    target_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target_path


def bootstrap_oci_controller_auth(
    *,
    root: Path,
    session_root: Path,
    env_file_paths: list[Path],
    effective_env: dict[str, str],
) -> dict[str, object]:
    bootstrap: dict[str, object] = {
        "source": "missing",
        "configPath": None,
        "profile": None,
        "keyPath": None,
        "keyPathRepaired": False,
        "sessionEnvPath": None,
        "sessionEnvUpdated": False,
        "reason": None,
    }
    config_path, source = resolve_candidate_oci_config_path(effective_env)
    bootstrap["source"] = source
    if config_path is None or not config_path.exists():
        bootstrap["reason"] = "No OCI config file was found for controller auth."
        return bootstrap

    profile_name = resolve_candidate_oci_profile(effective_env)
    profiles = parse_ini_like_config(config_path)
    profile_values = profiles.get(profile_name) or profiles.get("DEFAULT")
    if profile_values is None:
        bootstrap["reason"] = f"Profile {profile_name} was not found in {config_path.name}."
        return bootstrap

    required_keys = ("user", "fingerprint", "tenancy", "region", "key_file")
    missing_keys = [key for key in required_keys if not str(profile_values.get(key, "")).strip()]
    if missing_keys:
        bootstrap["reason"] = f"OCI config profile {profile_name} is missing: {', '.join(missing_keys)}"
        return bootstrap

    key_path, key_repaired = resolve_candidate_oci_key_path(config_path, str(profile_values.get("key_file", "")))
    if key_path is None or not key_path.exists():
        bootstrap["reason"] = f"OCI key file could not be resolved from {config_path.name}."
        return bootstrap

    materialized_config_path = materialize_oci_controller_config(root, profile_name, profile_values, key_path)
    session_env_path = find_session_oci_env_path(session_root, env_file_paths)
    env_updates = {
        "OCI_CLI_AUTH": "api_key",
        "OCI_CLI_CONFIG_FILE": str(materialized_config_path.resolve()).replace("\\", "/"),
        "OCI_CLI_PROFILE": profile_name,
    }
    save_env_file(session_env_path, env_updates)

    bootstrap.update(
        {
            "configPath": relative_path(root, materialized_config_path),
            "profile": profile_name,
            "keyPath": relative_path(root, key_path),
            "keyPathRepaired": key_repaired,
            "sessionEnvPath": relative_path(root, session_env_path),
            "sessionEnvUpdated": True,
        }
    )
    return bootstrap


def resolve_oci_controller_identity(canonical_env: dict[str, str]) -> dict[str, str]:
    config_file_value = str(canonical_env.get("OCI_CLI_CONFIG_FILE", "")).strip()
    profile_name = str(canonical_env.get("OCI_CLI_PROFILE", "DEFAULT")).strip() or "DEFAULT"
    if config_file_value:
        config_path = Path(config_file_value).expanduser()
        if not config_path.is_absolute():
            config_path = (repo_root() / config_path).resolve()
        if config_path.exists():
            profiles = parse_ini_like_config(config_path)
            profile_values = profiles.get(profile_name) or profiles.get("DEFAULT") or {}
            return {
                "configPath": str(config_path.resolve()).replace("\\", "/"),
                "profile": profile_name,
                "region": str(profile_values.get("region", "")).strip(),
                "tenancy": str(profile_values.get("tenancy", "")).strip(),
            }
    return {
        "configPath": config_file_value,
        "profile": profile_name,
        "region": str(canonical_env.get("OCI_CLI_REGION", "")).strip(),
        "tenancy": str(canonical_env.get("OCI_CLI_TENANCY", "")).strip(),
    }


def list_available_oci_gpu_shapes(
    oci_cli_bin: str,
    canonical_env: dict[str, str],
    region_name: str | None = None,
) -> tuple[list[str], str | None]:
    identity = resolve_oci_controller_identity(canonical_env)
    tenancy = identity.get("tenancy", "")
    if not tenancy:
        return [], "OCI tenancy was not resolved from the current controller auth."
    command = [oci_cli_bin, "compute", "shape", "list"]
    auth_mode = str(canonical_env.get("OCI_CLI_AUTH", "")).strip()
    if auth_mode:
        command.extend(["--auth", auth_mode])
    config_path = identity.get("configPath", "")
    if config_path:
        command.extend(["--config-file", config_path])
    profile_name = identity.get("profile", "")
    if profile_name:
        command.extend(["--profile", profile_name])
    if region_name:
        command.extend(["--region", region_name])
    command.extend(["--compartment-id", tenancy, "--all", "--output", "json"])
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        probe_region = region_name or identity.get("region", "unknown")
        return [], f"OCI shape probe failed in region {probe_region}."
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        probe_region = region_name or identity.get("region", "unknown")
        return [], f"OCI shape probe returned unreadable JSON in region {probe_region}."
    shapes = {
        str(entry.get("shape", "")).strip()
        for entry in payload.get("data", [])
        if str(entry.get("shape", "")).startswith(("VM.GPU", "BM.GPU"))
    }
    return sorted(shape for shape in shapes if shape), None


def list_subscribed_oci_regions(oci_cli_bin: str, canonical_env: dict[str, str]) -> list[dict[str, object]]:
    identity = resolve_oci_controller_identity(canonical_env)
    command = [oci_cli_bin, "iam", "region-subscription", "list"]
    auth_mode = str(canonical_env.get("OCI_CLI_AUTH", "")).strip()
    if auth_mode:
        command.extend(["--auth", auth_mode])
    config_path = identity.get("configPath", "")
    if config_path:
        command.extend(["--config-file", config_path])
    profile_name = identity.get("profile", "")
    if profile_name:
        command.extend(["--profile", profile_name])
    command.extend(["--output", "json"])
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        return []
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    regions: list[dict[str, object]] = []
    for entry in payload.get("data", []):
        region_name = str(entry.get("region-name", "")).strip()
        if not region_name:
            continue
        regions.append(
            {
                "name": region_name,
                "key": str(entry.get("region-key", "")).strip(),
                "isHomeRegion": bool(entry.get("is-home-region", False)),
                "status": str(entry.get("status", "")).strip(),
            }
        )
    return regions


def list_public_oci_regions(oci_cli_bin: str, canonical_env: dict[str, str]) -> list[dict[str, object]]:
    identity = resolve_oci_controller_identity(canonical_env)
    command = [oci_cli_bin, "iam", "region", "list"]
    auth_mode = str(canonical_env.get("OCI_CLI_AUTH", "")).strip()
    if auth_mode:
        command.extend(["--auth", auth_mode])
    config_path = identity.get("configPath", "")
    if config_path:
        command.extend(["--config-file", config_path])
    profile_name = identity.get("profile", "")
    if profile_name:
        command.extend(["--profile", profile_name])
    command.extend(["--output", "json"])
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        return []
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    regions: list[dict[str, object]] = []
    for entry in payload.get("data", []):
        region_name = str(entry.get("name", "")).strip()
        if not region_name:
            continue
        regions.append(
            {
                "name": region_name,
                "key": str(entry.get("key", "")).strip(),
            }
        )
    return regions


def region_group(region_name: str) -> str:
    return region_name.split("-", 1)[0].strip().lower()


def format_region_label(entry: dict[str, object]) -> str:
    name = str(entry.get("name", "")).strip() or str(entry.get("region", "")).strip()
    key = str(entry.get("key", "")).strip() or str(entry.get("regionKey", "")).strip()
    home_suffix = " [home]" if bool(entry.get("isHomeRegion", False)) else ""
    return f"{name} ({key}){home_suffix}".strip() if key else f"{name}{home_suffix}".strip()


def build_oci_gpu_inventory(
    oci_cli_bin: str,
    canonical_env: dict[str, str],
    subscribed_regions: list[dict[str, object]],
) -> list[dict[str, object]]:
    inventory: list[dict[str, object]] = []
    ordered_regions = sorted(
        subscribed_regions,
        key=lambda entry: (not bool(entry.get("isHomeRegion", False)), str(entry.get("name", "")).strip()),
    )
    for entry in ordered_regions:
        region_name = str(entry.get("name", "")).strip()
        if not region_name:
            continue
        gpu_shapes, probe_reason = list_available_oci_gpu_shapes(oci_cli_bin, canonical_env, region_name)
        inventory.append(
            {
                "region": region_name,
                "regionKey": str(entry.get("key", "")).strip(),
                "isHomeRegion": bool(entry.get("isHomeRegion", False)),
                "subscriptionStatus": str(entry.get("status", "")).strip() or "unknown",
                "probeStatus": "verified" if probe_reason is None else "probe-failed",
                "gpuShapes": gpu_shapes,
                "gpuShapeCount": len(gpu_shapes),
                "reason": probe_reason or ("GPU-capable shapes visible." if gpu_shapes else "No GPU-capable shapes are visible for the current controller auth."),
            }
        )
    return inventory


def build_oci_gpu_advisor(
    *,
    canonical_env: dict[str, str],
    oci_identity: dict[str, str],
    subscribed_regions: list[dict[str, object]],
    public_regions: list[dict[str, object]],
    gpu_inventory: list[dict[str, object]],
) -> dict[str, object]:
    controller_region = str(oci_identity.get("region", "")).strip()
    configured_target_region = str(canonical_env.get("OCI_TARGET_REGION", "")).strip() or controller_region
    configured_shape = str(canonical_env.get("OCI_SHAPE", "")).strip()
    configured_object_storage_region = str(canonical_env.get("OCI_OBJECT_STORAGE_REGION", "")).strip()
    subscribed_region_names = {str(entry.get("name", "")).strip() for entry in subscribed_regions if str(entry.get("name", "")).strip()}

    available_targets = [entry for entry in gpu_inventory if int(entry.get("gpuShapeCount", 0)) > 0]
    preferred_target: dict[str, object] | None = None
    if configured_target_region:
        preferred_target = next((entry for entry in available_targets if str(entry.get("region", "")).strip() == configured_target_region), None)
    if preferred_target is None:
        preferred_target = next((entry for entry in available_targets if bool(entry.get("isHomeRegion", False))), None)
    if preferred_target is None and available_targets:
        preferred_target = sorted(available_targets, key=lambda entry: str(entry.get("region", "")).strip())[0]

    controller_group = region_group(controller_region) if controller_region else ""
    public_expansion_candidates = [
        entry
        for entry in public_regions
        if str(entry.get("name", "")).strip() not in subscribed_region_names
        and (not controller_group or region_group(str(entry.get("name", "")).strip()) == controller_group)
    ]
    if not public_expansion_candidates:
        public_expansion_candidates = [
            entry for entry in public_regions if str(entry.get("name", "")).strip() not in subscribed_region_names
        ]
    public_expansion_candidates = public_expansion_candidates[:5]

    recommended_launch_target: dict[str, object] = {
        "status": "none",
        "region": None,
        "regionKey": None,
        "isHomeRegion": False,
        "shape": None,
        "reason": "No subscribed OCI region currently exposes GPU-capable shapes for the current controller auth.",
    }
    suggested_env_updates: dict[str, str] = {}
    actions: list[str] = []

    if preferred_target is not None:
        gpu_shapes = [str(entry).strip() for entry in preferred_target.get("gpuShapes", []) if str(entry).strip()]
        recommended_shape = configured_shape if configured_shape and configured_shape in gpu_shapes else (gpu_shapes[0] if gpu_shapes else "")
        recommended_launch_target = {
            "status": "available",
            "region": str(preferred_target.get("region", "")).strip(),
            "regionKey": str(preferred_target.get("regionKey", "")).strip(),
            "isHomeRegion": bool(preferred_target.get("isHomeRegion", False)),
            "shape": recommended_shape or None,
            "reason": (
                "Configured OCI target already matches a verified GPU-capable region."
                if configured_target_region and configured_target_region == str(preferred_target.get("region", "")).strip()
                else "This is the first verified subscribed OCI region with GPU-capable shapes."
            ),
        }
        if recommended_shape:
            suggested_env_updates["OCI_TARGET_REGION"] = str(preferred_target.get("region", "")).strip()
            suggested_env_updates["OCI_SHAPE"] = recommended_shape
            if (
                controller_region
                and str(preferred_target.get("region", "")).strip() != controller_region
                and not configured_object_storage_region
            ):
                suggested_env_updates["OCI_OBJECT_STORAGE_REGION"] = controller_region
        actions.append(
            f"Verified launch target available: {format_region_label({'name': preferred_target.get('region'), 'key': preferred_target.get('regionKey'), 'isHomeRegion': preferred_target.get('isHomeRegion', False)})} with shape {recommended_shape or 'unknown'}."
        )
        if configured_target_region and configured_target_region != str(preferred_target.get("region", "")).strip():
            actions.append(
                f"Configured target region {configured_target_region} does not match the current verified GPU-capable recommendation {preferred_target.get('region')}."
            )
        if str(preferred_target.get("region", "")).strip() != controller_region and not configured_object_storage_region:
            actions.append(
                "Cross-region launch also needs OCI_OBJECT_STORAGE_REGION so the remote node can fetch the staged bundle from the correct bucket region."
            )
    else:
        if len(subscribed_regions) == 1:
            actions.append(
                f"Only one subscribed OCI region is visible right now: {format_region_label(subscribed_regions[0])}."
            )
        if public_expansion_candidates:
            candidate_labels = [format_region_label(entry) for entry in public_expansion_candidates]
            actions.append(
                f"Next capacity move is to subscribe an additional nearby public region such as: {', '.join(candidate_labels)}."
            )
        actions.append(
            "Keep the cloud lane as not-configured until a subscribed region shows verified GPU-capable shapes."
        )

    return {
        "probeScope": "verified-subscribed-regions-only",
        "controllerRegion": controller_region or None,
        "configuredTargetRegion": configured_target_region or None,
        "configuredShape": configured_shape or None,
        "configuredObjectStorageRegion": configured_object_storage_region or None,
        "verifiedInventory": gpu_inventory,
        "publicExpansionCandidates": [
            {
                "region": str(entry.get("name", "")).strip(),
                "regionKey": str(entry.get("key", "")).strip(),
                "reason": "Public OCI region candidate. GPU capacity is not verified until the tenancy subscribes it."
            }
            for entry in public_expansion_candidates
        ],
        "recommendedLaunchTarget": recommended_launch_target,
        "suggestedEnvUpdates": suggested_env_updates,
        "actions": actions,
    }


def read_secret_value(env_map: dict[str, str], base_name: str) -> tuple[str | None, str | None]:
    file_var_name = f"{base_name}_FILE"
    file_path_value = str(env_map.get(file_var_name, "")).strip()
    if not file_path_value:
        return None, None
    file_path = Path(file_path_value).expanduser()
    if not file_path.is_absolute():
        file_path = (repo_root() / file_path).resolve()
    if not file_path.exists() or not file_path.is_file():
        return file_var_name, None
    return file_var_name, file_path.read_text(encoding="utf-8").strip()


def git_remote_url(root: Path) -> str:
    return git_value(root, "remote", "get-url", "origin")


def materialize_json_surface(script_path: Path, *args: str) -> None:
    subprocess.run([sys.executable, str(script_path), *args], cwd=str(repo_root()), check=True)


def resolve_surface_jsonl_path(manifest_path: Path) -> Path | None:
    if not manifest_path.exists():
        return None
    try:
        payload = load_json(manifest_path)
    except Exception:
        return None
    output = payload.get("output", {})
    if not isinstance(output, dict):
        return None
    return resolve_repo_path(str(output.get("jsonlPath", "")).strip())


def build_cloud_bundle(
    *,
    root: Path,
    session_id: str,
    session_root: Path,
    manifest_path: Path,
    training_lock_path: Path,
    config_path: Path,
    mix_manifest_path: Path,
    curation_run_path: Path | None,
    dataset_path: Path,
    failure_corpus_path: Path | None,
    benchmark_corpus_path: Path | None,
    benchmark_corpus_jsonl_path: Path | None,
    immaculate_bundle_output: Path,
    release_summary: dict,
) -> dict:
    bundle_root = session_root / "cloud-bundle"
    bundle_root.mkdir(parents=True, exist_ok=True)
    bundle_manifest_path = bundle_root / "bundle-manifest.json"
    bundle_archive_path = bundle_root / f"{session_id}-cloud-bundle.tar.gz"

    source_paths = [
        manifest_path,
        training_lock_path,
        config_path,
        mix_manifest_path,
        dataset_path,
        immaculate_bundle_output,
    ]
    if curation_run_path is not None and curation_run_path.exists():
        source_paths.append(curation_run_path)
    if failure_corpus_path is not None and failure_corpus_path.exists():
        source_paths.append(failure_corpus_path)
    if benchmark_corpus_path is not None and benchmark_corpus_path.exists():
        source_paths.append(benchmark_corpus_path)
    if benchmark_corpus_jsonl_path is not None and benchmark_corpus_jsonl_path.exists():
        source_paths.append(benchmark_corpus_jsonl_path)

    source_entries = [
        {
            "path": relative_path(root, source_path),
            "sha256": sha256_file(source_path),
            "sizeBytes": source_path.stat().st_size,
        }
        for source_path in source_paths
    ]

    bundle_manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "bundleKind": "q-hybrid-cloud-session",
        "sessionId": session_id,
        "bundleId": f"{session_id}-{release_summary['gitShortSha']}",
        "release": release_summary,
        "repo": {
            "remoteUrl": git_remote_url(root),
            "gitSha": release_summary["gitSha"],
            "gitShortSha": release_summary["gitShortSha"],
        },
        "sources": source_entries,
    }
    save_json(bundle_manifest_path, bundle_manifest)

    with tarfile.open(bundle_archive_path, "w:gz") as archive:
        for source_path in source_paths:
            archive.add(source_path, arcname=relative_path(root, source_path))
        archive.add(bundle_manifest_path, arcname="bundle-manifest.json")

    bundle_sha256 = sha256_file(bundle_archive_path)
    bundle_manifest["archive"] = {
        "path": relative_path(root, bundle_archive_path),
        "sha256": bundle_sha256,
        "sizeBytes": bundle_archive_path.stat().st_size,
    }
    save_json(bundle_manifest_path, bundle_manifest)

    return {
        "bundleId": bundle_manifest["bundleId"],
        "archivePath": relative_path(root, bundle_archive_path),
        "archiveSha256": bundle_sha256,
        "archiveSizeBytes": bundle_archive_path.stat().st_size,
        "manifestPath": relative_path(root, bundle_manifest_path),
        "fileCount": len(source_entries),
        "repoRemoteUrl": bundle_manifest["repo"]["remoteUrl"],
    }


def render_oci_gpu_advisor_markdown(report: dict[str, object]) -> str:
    verified_inventory = report.get("verifiedInventory", [])
    if not isinstance(verified_inventory, list):
        verified_inventory = []
    public_expansion_candidates = report.get("publicExpansionCandidates", [])
    if not isinstance(public_expansion_candidates, list):
        public_expansion_candidates = []
    recommended_launch_target = report.get("recommendedLaunchTarget", {})
    if not isinstance(recommended_launch_target, dict):
        recommended_launch_target = {}
    actions = report.get("actions", [])
    if not isinstance(actions, list):
        actions = []
    output = report.get("output", {})
    if not isinstance(output, dict):
        output = {}

    lines = [
        "# OCI GPU Advisor",
        "",
        "This page records the current OCI GPU launch advice for the active Q hybrid training session.",
        "",
        f"- Generated: `{report.get('generatedAt', 'n/a')}`",
        f"- Release: `{report.get('release', {}).get('buildId', 'n/a') if isinstance(report.get('release', {}), dict) else 'n/a'}`",
        f"- Session id: `{report.get('sessionId', 'n/a')}`",
        f"- Probe scope: `{report.get('probeScope', 'n/a')}`",
        f"- Controller region: `{report.get('controllerRegion') or 'n/a'}`",
        f"- Configured target region: `{report.get('configuredTargetRegion') or 'n/a'}`",
        f"- Configured shape: `{report.get('configuredShape') or 'n/a'}`",
        f"- Object Storage region: `{report.get('configuredObjectStorageRegion') or 'n/a'}`",
        "",
        "## Verified Subscribed Regions",
        "",
    ]

    if verified_inventory:
        for entry in verified_inventory:
            if not isinstance(entry, dict):
                continue
            label = format_region_label(
                {
                    "name": entry.get("region"),
                    "key": entry.get("regionKey"),
                    "isHomeRegion": entry.get("isHomeRegion", False),
                }
            )
            gpu_shapes = entry.get("gpuShapes", [])
            if not isinstance(gpu_shapes, list):
                gpu_shapes = []
            lines.extend(
                [
                    f"- {label}: probe `{entry.get('probeStatus', 'unknown')}`, gpu shapes `{', '.join(str(shape) for shape in gpu_shapes) if gpu_shapes else 'none'}`",
                    f"  Reason: {entry.get('reason', 'n/a')}",
                ]
            )
    else:
        lines.append("- No subscribed OCI regions could be verified.")

    lines.extend(
        [
            "",
            "## Recommended Launch Target",
            "",
            f"- Status: `{recommended_launch_target.get('status', 'none')}`",
            f"- Region: `{recommended_launch_target.get('region') or 'n/a'}`",
            f"- Shape: `{recommended_launch_target.get('shape') or 'n/a'}`",
            f"- Reason: {recommended_launch_target.get('reason', 'n/a')}",
            "",
            "## Public Expansion Candidates",
            "",
        ]
    )

    if public_expansion_candidates:
        for entry in public_expansion_candidates:
            if not isinstance(entry, dict):
                continue
            label = format_region_label(
                {
                    "name": entry.get("region"),
                    "key": entry.get("regionKey"),
                }
            )
            lines.append(f"- {label}: {entry.get('reason', 'n/a')}")
    else:
        lines.append("- No additional public region candidates were discovered.")

    lines.extend(
        [
            "",
            "## Next Actions",
            "",
            *[f"- {str(action)}" for action in actions],
            "",
            "## Output",
            "",
            f"- JSON: `{output.get('jsonPath', 'n/a')}`",
            f"- Markdown: `{output.get('markdownPath', 'n/a')}`",
            "",
            "## Truth Boundary",
            "",
            "- Verified inventory only covers subscribed OCI regions that the current controller auth could query.",
            "- Public expansion candidates are discoverability hints, not proof of available GPU capacity.",
            "- A launch target is only considered real when the session doctor marks it ready and the cloud launcher can execute with concrete region, shape, and bundle settings.",
        ]
    )
    return "\n".join(lines) + "\n"
def render_markdown(summary: dict) -> str:
    q = summary["q"]
    immaculate = summary["immaculate"]
    local_lane = summary["lanes"]["local"]
    cloud_lane = summary["lanes"]["cloud"]
    doctor = summary["doctor"]
    cloud_bundle = summary["cloudBundle"]
    hf_jobs = summary.get("hfJobsTraining", {})
    colab_free = summary.get("colabFreeTraining", {})
    oci_gpu_advisor = summary.get("ociGpuAdvisor", {})
    oci_region_capacity = summary.get("ociRegionCapacity", {})
    recommended_launch_target = oci_gpu_advisor.get("recommendedLaunchTarget", {}) if isinstance(oci_gpu_advisor, dict) else {}
    public_expansion_candidates = oci_gpu_advisor.get("publicExpansionCandidates", []) if isinstance(oci_gpu_advisor, dict) else []
    latest_capacity_summary = oci_region_capacity.get("summary", {}) if isinstance(oci_region_capacity, dict) else {}
    support_capacity = oci_region_capacity.get("support", {}) if isinstance(oci_region_capacity, dict) else {}
    limit_request_helper_command = f"python training/q/create_oci_region_limit_request.py --session {summary['manifestPath']} --check"
    lines = [
        "# Q Hybrid Training",
        "",
        "This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.",
        "",
        f"- Generated: `{summary['generatedAt']}`",
        f"- Release: `{summary['release']['buildId']}`",
        f"- Session id: `{summary['sessionId']}`",
        f"- Q training bundle: `{q['trainingBundleId']}`",
        f"- Dataset rows: `{q['trainDatasetRowCount']}`",
        f"- Immaculate orchestration bundle: `{immaculate['bundleId']}`",
        f"- HF Jobs training surface: `{summary['output'].get('hfJobsTrainingMarkdownPath', 'docs/wiki/HF-Jobs-Training.md')}`",
        f"- Colab free training surface: `{summary['output'].get('colabFreeTrainingMarkdownPath', 'docs/wiki/Colab-Free-Training.md')}`",
        f"- OCI GPU advisor: `{summary['output'].get('ociGpuAdvisorMarkdownPath', 'docs/wiki/OCI-GPU-Advisor.md')}`",
        f"- OCI region capacity probe: `{summary['output'].get('ociRegionCapacityMarkdownPath', 'docs/wiki/OCI-Region-Capacity.md')}`",
        "",
        "## Plain English Status",
        "",
        f"- Local lane: `{local_lane['status']}` in mode `{local_lane['mode']}`",
        f"- Cloud lane: `{cloud_lane['status']}` on provider `{cloud_lane['provider']}` in mode `{cloud_lane['mode']}`",
        f"- Hugging Face token or secret path ready: `{doctor['huggingFace']['ready']}` via `{doctor['huggingFace']['source']}`",
        f"- W&B state ready: `{doctor['wandb']['ready']}` via `{doctor['wandb']['source']}`",
        "",
        "## Q Fine-Tune Lane",
        "",
        f"- Training lock: `{q['trainingLockPath']}`",
        f"- Config: `{q['configPath']}`",
        f"- Dataset: `{q['trainDatasetPath']}`",
        f"- Mix manifest: `{q['mixManifestPath']}`",
        f"- Curation run id: `{q.get('curationRunId') or 'n/a'}`",
        f"- Curation run path: `{q.get('curationRunPath') or 'n/a'}`",
        f"- Benchmark corpus: `{q['benchmarkCorpusPath']}`",
        f"- Benchmark corpus JSONL: `{q['benchmarkCorpusJsonlPath']}`",
        f"- Benchmark corpus records: `{q['benchmarkCorpusRecordCount']}`",
        f"- Failure corpus: `{q['failureCorpusPath']}`",
        f"- Local command: `{' '.join(local_lane['command']) if local_lane['command'] else 'n/a'}`",
        "",
        "## Immaculate Orchestration Lane",
        "",
        f"- Bundle path: `{immaculate['bundlePath']}`",
        f"- Signal count: `{immaculate['signalCount']}`",
        "- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.",
        "",
        "## Cloud Bundle",
        "",
        f"- Bundle id: `{cloud_bundle['bundleId']}`",
        f"- Archive: `{cloud_bundle['archivePath']}`",
        f"- Archive SHA-256: `{cloud_bundle['archiveSha256']}`",
        f"- Bundle manifest: `{cloud_bundle['manifestPath']}`",
        f"- Included file count: `{cloud_bundle['fileCount']}`",
        "",
        "## Cloud Doctor",
        "",
        f"- Provider: `{cloud_lane['provider']}`",
        f"- Launch command configured: `{doctor['cloud']['launchCommandConfigured']}`",
        f"- Cloud ready: `{doctor['cloud']['ready']}`",
        *[
            f"- Env file: `{entry['path']}` exists `{entry['exists']}`"
            for entry in doctor["cloud"]["envFiles"]
        ],
        *[f"- Cloud note: {reason}" for reason in doctor["cloud"]["reasons"]],
    ]
    if cloud_lane["provider"] == "hf_jobs":
        lines.extend(
            [
                f"- HF CLI path: `{doctor['cloud']['cliBin']}`",
                f"- HF auth mode: `{doctor['cloud']['authMode']}`",
                f"- HF auth source: `{doctor['cloud']['authSource']}`",
                f"- HF authenticated user: `{doctor['cloud'].get('account') or 'n/a'}`",
                f"- HF bundle repo: `{doctor['cloud'].get('bundleRepo') or 'n/a'}`",
                f"- HF bundle staged: `{doctor['cloud'].get('bundleStaged')}`",
                f"- HF jobs visible: `{doctor['cloud'].get('jobsVisibleCount', 'n/a')}`",
                f"- HF GPU flavors visible: `{', '.join(doctor['cloud'].get('availableGpuShapes', [])) if doctor['cloud'].get('availableGpuShapes') else 'none'}`",
                f"- HF smoke attempted: `{doctor['cloud'].get('smokeAttempted')}`",
                f"- HF smoke blocker: {doctor['cloud'].get('smokeBlocker') or 'n/a'}",
                f"- HF launch blocker: {doctor['cloud'].get('launchBlocker') or 'n/a'}",
                "",
                "## HF Jobs Surface",
                "",
                f"- Recommended next step: {hf_jobs.get('summary', {}).get('recommendedNextStep', 'n/a') if isinstance(hf_jobs, dict) else 'n/a'}",
                f"- Staged archive path: `{hf_jobs.get('stagedBundle', {}).get('archiveRepoPath', 'n/a') if isinstance(hf_jobs, dict) else 'n/a'}`",
                f"- Staged manifest path: `{hf_jobs.get('stagedBundle', {}).get('manifestRepoPath', 'n/a') if isinstance(hf_jobs, dict) else 'n/a'}`",
                "",
                "## Colab Free Surface",
                "",
                f"- Recommended next step: {colab_free.get('summary', {}).get('recommendedNextStep', 'n/a') if isinstance(colab_free, dict) else 'n/a'}",
                f"- Notebook path: `{colab_free.get('notebook', {}).get('path', 'n/a') if isinstance(colab_free, dict) else 'n/a'}`",
                f"- Open in Colab: `{colab_free.get('notebook', {}).get('openInColabUrl', 'n/a') if isinstance(colab_free, dict) else 'n/a'}`",
                f"- Micro-train max steps: `{colab_free.get('microTrain', {}).get('maxSteps', 'n/a') if isinstance(colab_free, dict) else 'n/a'}`",
                f"- Micro-train max sequence length: `{colab_free.get('microTrain', {}).get('maxSeqLength', 'n/a') if isinstance(colab_free, dict) else 'n/a'}`",
                f"- Minimum GPU memory for real train: `{colab_free.get('microTrain', {}).get('minGpuMemoryGb', 'n/a')} GB`" if isinstance(colab_free, dict) else "- Minimum GPU memory for real train: `n/a`",
            ]
        )
    else:
        lines.extend(
            [
                f"- OCI CLI path: `{doctor['cloud']['cliBin']}`",
                f"- OCI auth mode: `{doctor['cloud']['authMode']}`",
                f"- OCI auth source: `{doctor['cloud']['authSource']}`",
                f"- OCI auth config: `{doctor['cloud']['authConfigPath'] or 'n/a'}`",
                f"- OCI auth profile: `{doctor['cloud']['authProfile'] or 'n/a'}`",
                f"- OCI auth key path: `{doctor['cloud']['authKeyPath'] or 'n/a'}`",
                f"- OCI auth key repaired: `{doctor['cloud']['authKeyRepaired']}`",
                f"- OCI session env updated: `{doctor['cloud']['sessionEnvUpdated']}`",
                f"- OCI region: `{doctor['cloud']['region'] or 'n/a'}`",
                f"- OCI subscribed regions: `{', '.join(doctor['cloud']['subscribedRegionNames']) if doctor['cloud']['subscribedRegionNames'] else 'none discovered'}`",
                f"- OCI GPU shapes visible: `{', '.join(doctor['cloud']['availableGpuShapes']) if doctor['cloud']['availableGpuShapes'] else 'none'}`",
                f"- OCI target region: `{doctor['cloud'].get('targetRegion') or 'n/a'}`",
                f"- OCI Object Storage region: `{doctor['cloud'].get('objectStorageRegion') or 'n/a'}`",
                *[
                    f"- Launch target `{name}`: `{present}`"
                    for name, present in doctor["cloud"]["launchTarget"].items()
                ],
                "",
                "## OCI GPU Advisor",
                "",
                f"- Recommendation status: `{recommended_launch_target.get('status', 'none')}`",
                f"- Recommended region: `{recommended_launch_target.get('region') or 'n/a'}`",
                f"- Recommended shape: `{recommended_launch_target.get('shape') or 'n/a'}`",
                f"- Recommendation reason: {recommended_launch_target.get('reason', 'n/a')}",
                f"- Public expansion candidates: `{', '.join(format_region_label({'name': entry.get('region'), 'key': entry.get('regionKey')}) for entry in public_expansion_candidates if isinstance(entry, dict)) if public_expansion_candidates else 'none'}`",
                "",
                "## OCI Region Capacity",
                "",
                f"- Latest attempt status: `{latest_capacity_summary.get('latestAttemptStatus', 'unknown')}`",
                f"- Subscription limit reached: `{latest_capacity_summary.get('subscriptionLimitReached', False)}`",
                f"- Recommended next step: {latest_capacity_summary.get('recommendedNextStep', 'n/a')}",
                f"- OCI support create ready now: `{support_capacity.get('createPossible', False)}`",
                f"- OCI support create blocker: {support_capacity.get('createBlockedReason', 'n/a')}",
                f"- OCI discovered support-domain candidate: `{support_capacity.get('domainDisplayName') or support_capacity.get('domainId') or 'n/a'}`",
                f"- OCI support-domain binding verified: `{support_capacity.get('domainBindingVerified') if support_capacity.get('domainBindingVerified') is not None else 'unknown'}`",
                f"- OCI support incident error: {support_capacity.get('incidentError', {}).get('message', 'n/a') if isinstance(support_capacity.get('incidentError'), dict) else 'n/a'}",
                f"- Prepared limit-request helper: `{limit_request_helper_command}`",
            ]
        )
    lines.extend(
        [
            "",
            "## Truth Boundary",
            "",
            "- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.",
            "- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.",
            "- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.",
            "- Missing provider auth, staging proof, launch targets, or billing headroom keeps the cloud lane explicit as `not-configured` or `launch-blocked` instead of being papered over.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    root = repo_root()
    sys.argv = normalize_cli_argv(sys.argv)
    parser = argparse.ArgumentParser(description="Doctor and coordinate a hybrid Q training session.")
    parser.add_argument("--session", help="Path to the hybrid training session manifest JSON.")
    parser.add_argument("--doctor", action="store_true", help="Validate and materialize the session summary without launching.")
    parser.add_argument("--launch", action="store_true", help="Launch the enabled session lanes after doctor checks.")
    args = parser.parse_args()

    if not args.session:
        if args.launch:
            parser.error("--session is required when --launch is used.")
        if args.doctor:
            print(json.dumps(build_sessionless_doctor_report(root), indent=2))
            return
        parser.error("--session is required.")

    manifest_path = resolve_repo_path(args.session)
    if manifest_path is None or not manifest_path.exists():
        raise ValueError("Session manifest path does not exist.")
    manifest = load_json(manifest_path)

    session_id = str(manifest.get("sessionId", "")).strip()
    if not session_id:
        raise ValueError("Session manifest requires sessionId.")

    q_manifest = manifest.get("q", {})
    if not isinstance(q_manifest, dict):
        raise ValueError("Session manifest q field must be an object.")
    training_lock_path = resolve_repo_path(str(q_manifest.get("trainingLockPath", "")).strip())
    if training_lock_path is None or not training_lock_path.exists():
        raise ValueError("Session manifest requires a valid q.trainingLockPath.")
    training_lock = load_json(training_lock_path)

    config_path = resolve_repo_path(str(q_manifest.get("configPath", "")).strip()) or resolve_repo_path(
        str(training_lock.get("run", {}).get("configPath", "")).strip()
    )
    if config_path is None or not config_path.exists():
        raise ValueError("Unable to resolve the concrete Q config path from the manifest or training lock.")
    config = load_json(config_path)

    mix_manifest_path = resolve_repo_path(str(q_manifest.get("mixManifestPath", "")).strip()) or resolve_repo_path(
        str(training_lock.get("mixManifest", {}).get("path", "")).strip()
    )
    if mix_manifest_path is None or not mix_manifest_path.exists():
        raise ValueError("Unable to resolve the concrete Q mix manifest path from the manifest or training lock.")

    manifest_curation_run = q_manifest.get("curationRunPath")
    lock_curation_run = training_lock.get("curation", {}).get("runPath")
    curation_run_path = resolve_repo_path(str(manifest_curation_run).strip()) if manifest_curation_run is not None else None
    if curation_run_path is None and lock_curation_run is not None:
        curation_run_path = resolve_repo_path(str(lock_curation_run).strip())
    if curation_run_path is not None and not curation_run_path.exists():
        raise ValueError("Configured curation run path does not exist.")

    dataset_path = resolve_repo_path(str(config.get("train_dataset_path", "")).strip())
    if dataset_path is None or not dataset_path.exists():
        raise ValueError("The resolved train_dataset_path does not exist.")

    locked_dataset_path = resolve_repo_path(str(training_lock.get("run", {}).get("trainDatasetPath", "")).strip())
    if locked_dataset_path is None:
        raise ValueError("Training lock does not carry a resolvable trainDatasetPath.")
    if str(dataset_path.resolve()) != str(locked_dataset_path.resolve()):
        raise ValueError("Session config and training lock disagree on the dataset path.")
    if str(config.get("base_model")) != str(training_lock.get("run", {}).get("baseModel")):
        raise ValueError("Session config and training lock disagree on the Q lineage source.")

    failure_corpus_path = resolve_repo_path(str(q_manifest.get("failureCorpusPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Failure-Corpus.json"
    )
    benchmark_corpus_path = resolve_repo_path(str(q_manifest.get("benchmarkCorpusPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Benchmark-Corpus.json"
    )
    benchmark_corpus_jsonl_path = resolve_repo_path(str(q_manifest.get("benchmarkCorpusJsonlPath", "")).strip()) or (
        root / ".training-output" / "q" / "q-benchmark-corpus.jsonl"
    )

    materialize_json_surface(
        root / "training" / "q" / "build_q_failure_corpus.py",
        "--manifest",
        str(failure_corpus_path),
    )
    materialize_json_surface(
        root / "training" / "q" / "build_q_benchmark_corpus.py",
        "--manifest",
        str(benchmark_corpus_path),
        "--output",
        str(benchmark_corpus_jsonl_path),
    )

    if benchmark_corpus_jsonl_path is None or not benchmark_corpus_jsonl_path.exists():
        resolved_benchmark_jsonl = resolve_surface_jsonl_path(benchmark_corpus_path)
        if resolved_benchmark_jsonl is not None:
            benchmark_corpus_jsonl_path = resolved_benchmark_jsonl
    benchmark_corpus_summary = load_json(benchmark_corpus_path) if benchmark_corpus_path.exists() else {}

    artifacts = manifest.get("artifacts", {})
    if not isinstance(artifacts, dict):
        artifacts = {}
    session_root = resolve_repo_path(str(artifacts.get("sessionRoot", "")).strip()) or (
        root / ".training-output" / "q" / "sessions" / session_id
    )
    session_json_path = session_root / "hybrid-session.json"
    session_markdown_path = session_root / "hybrid-session.md"
    wiki_json_path = resolve_repo_path(str(artifacts.get("wikiJsonPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Hybrid-Training.json"
    )
    wiki_markdown_path = resolve_repo_path(str(artifacts.get("wikiMarkdownPath", "")).strip()) or (
        root / "docs" / "wiki" / "Q-Hybrid-Training.md"
    )
    hf_jobs_training_json_path = resolve_repo_path(str(artifacts.get("hfJobsTrainingJsonPath", "")).strip()) or (
        root / "docs" / "wiki" / "HF-Jobs-Training.json"
    )
    hf_jobs_training_markdown_path = resolve_repo_path(str(artifacts.get("hfJobsTrainingMarkdownPath", "")).strip()) or (
        root / "docs" / "wiki" / "HF-Jobs-Training.md"
    )
    colab_free_training_json_path = resolve_repo_path(str(artifacts.get("colabFreeTrainingJsonPath", "")).strip()) or (
        root / "docs" / "wiki" / "Colab-Free-Training.json"
    )
    colab_free_training_markdown_path = resolve_repo_path(str(artifacts.get("colabFreeTrainingMarkdownPath", "")).strip()) or (
        root / "docs" / "wiki" / "Colab-Free-Training.md"
    )
    oci_gpu_advisor_json_path = resolve_repo_path(str(artifacts.get("ociGpuAdvisorJsonPath", "")).strip()) or (
        root / "docs" / "wiki" / "OCI-GPU-Advisor.json"
    )
    oci_gpu_advisor_markdown_path = resolve_repo_path(str(artifacts.get("ociGpuAdvisorMarkdownPath", "")).strip()) or (
        root / "docs" / "wiki" / "OCI-GPU-Advisor.md"
    )
    oci_region_capacity_json_path = resolve_repo_path(str(artifacts.get("ociRegionCapacityJsonPath", "")).strip()) or (
        root / "docs" / "wiki" / "OCI-Region-Capacity.json"
    )
    oci_region_capacity_markdown_path = resolve_repo_path(str(artifacts.get("ociRegionCapacityMarkdownPath", "")).strip()) or (
        root / "docs" / "wiki" / "OCI-Region-Capacity.md"
    )

    policy = manifest.get("policy", {})
    if not isinstance(policy, dict):
        policy = {}

    immaculate_manifest = manifest.get("immaculate", {})
    if not isinstance(immaculate_manifest, dict):
        immaculate_manifest = {}
    immaculate_bundle_output = resolve_repo_path(str(immaculate_manifest.get("bundleOutputPath", "")).strip()) or (
        root / ".training-output" / "immaculate" / f"immaculate-training-bundle-{session_id}.json"
    )

    local_manifest = manifest.get("local", {})
    if not isinstance(local_manifest, dict):
        local_manifest = {}
    local_enabled = bool(local_manifest.get("enabled", True))
    local_mode = str(local_manifest.get("mode", "dry-run")).strip() or "dry-run"
    local_python = str(local_manifest.get("python", sys.executable)).strip() or sys.executable
    local_python_executable = shutil.which(local_python) or local_python
    local_extra_args = [str(entry) for entry in local_manifest.get("extraArgs", [])] if isinstance(local_manifest.get("extraArgs"), list) else []
    local_command: list[str] = []
    if local_enabled and local_mode != "skip":
        local_command = [
            local_python_executable,
            str(root / "training" / "q" / "train_q_lora_unsloth.py"),
            "--config",
            str(config_path),
            "--session-manifest",
            str(manifest_path),
        ]
        if local_mode == "dry-run":
            local_command.append("--dry-run")
        local_command.extend(local_extra_args)

    local_python_present = Path(local_python_executable).exists() or shutil.which(local_python_executable) is not None
    probe_local_dependencies = should_probe_local_dependencies(
        local_enabled=local_enabled,
        local_mode=local_mode,
        local_python_present=local_python_present,
    )
    local_dependency_state = (
        {
            "datasets": python_module_available(local_python_executable, "datasets"),
            "transformers": python_module_available(local_python_executable, "transformers"),
            "trl": python_module_available(local_python_executable, "trl"),
            "unsloth": python_module_available(local_python_executable, "unsloth"),
        }
        if probe_local_dependencies
        else {
            "datasets": False,
            "transformers": False,
            "trl": False,
            "unsloth": False,
        }
    )
    local_reasons: list[str] = []
    if not local_python_present:
        local_reasons.append(f"Python executable not found: {local_python}")
    if local_mode == "train":
        missing_modules = [name for name, present in local_dependency_state.items() if not present]
        if missing_modules:
            local_reasons.append(f"Missing local training modules: {', '.join(missing_modules)}")
    gpu_ready = shutil.which("nvidia-smi") is not None
    if local_mode == "train" and not gpu_ready:
        local_reasons.append("nvidia-smi is not available on this machine.")
    local_ready = local_enabled and local_mode != "skip" and not local_reasons

    build_immaculate_bundle = bool(policy.get("buildImmaculateBundle", True))
    if build_immaculate_bundle:
        bundle_script = root / "training" / "immaculate" / "build_immaculate_training_bundle.py"
        subprocess.run(
            [sys.executable, str(bundle_script), "--output", str(immaculate_bundle_output)],
            cwd=str(root),
            check=True,
        )
        immaculate_bundle = load_json(immaculate_bundle_output)
    else:
        immaculate_bundle = {"bundleId": "skipped", "summary": {"signalCount": 0}}

    release_summary = build_release_summary(root)
    cloud_bundle = build_cloud_bundle(
        root=root,
        session_id=session_id,
        session_root=session_root,
        manifest_path=manifest_path,
        training_lock_path=training_lock_path,
        config_path=config_path,
        mix_manifest_path=mix_manifest_path,
        curation_run_path=curation_run_path,
        dataset_path=dataset_path,
        failure_corpus_path=failure_corpus_path if failure_corpus_path.exists() else None,
        benchmark_corpus_path=benchmark_corpus_path if benchmark_corpus_path.exists() else None,
        benchmark_corpus_jsonl_path=benchmark_corpus_jsonl_path if benchmark_corpus_jsonl_path and benchmark_corpus_jsonl_path.exists() else None,
        immaculate_bundle_output=immaculate_bundle_output,
        release_summary=release_summary,
    )

    cloud_manifest = manifest.get("cloud", {})
    if not isinstance(cloud_manifest, dict):
        cloud_manifest = {}
    cloud_enabled = bool(cloud_manifest.get("enabled", False))
    cloud_provider = str(cloud_manifest.get("provider", "custom")).strip() or "custom"
    cloud_mode = str(cloud_manifest.get("mode", "doctor")).strip() or "doctor"
    cloud_launch_command = normalize_command(cloud_manifest.get("launchCommand"))
    cloud_env_file_paths = resolve_repo_paths(cloud_manifest.get("envFilePath"))
    cloud_inline_env = cloud_manifest.get("inlineEnv", {})
    effective_cloud_env, env_file_summaries = build_effective_env(cloud_env_file_paths, cloud_inline_env)
    canonical_cloud_env, canonical_sources = canonicalize_env(effective_cloud_env)
    oci_bootstrap = {
        "source": "n/a",
        "configPath": None,
        "profile": None,
        "keyPath": None,
        "keyPathRepaired": False,
        "sessionEnvPath": None,
        "sessionEnvUpdated": False,
        "reason": None,
    }
    if cloud_provider == "oci":
        oci_bootstrap = bootstrap_oci_controller_auth(
            root=root,
            session_root=session_root,
            env_file_paths=cloud_env_file_paths,
            effective_env=effective_cloud_env,
        )
        if bool(oci_bootstrap.get("sessionEnvUpdated")):
            session_env_path = resolve_repo_path(str(oci_bootstrap.get("sessionEnvPath", "")).strip())
            if session_env_path is not None and all(path.resolve() != session_env_path.resolve() for path in cloud_env_file_paths):
                cloud_env_file_paths.append(session_env_path)
            effective_cloud_env, env_file_summaries = build_effective_env(cloud_env_file_paths, cloud_inline_env)
            canonical_cloud_env, canonical_sources = canonicalize_env(effective_cloud_env)
            canonical_sources.setdefault("OCI_CLI_AUTH", "session_oci_env")
            canonical_sources.setdefault("OCI_CLI_CONFIG_FILE", "session_oci_env")
            canonical_sources.setdefault("OCI_CLI_PROFILE", "session_oci_env")

    required_env = [str(entry) for entry in cloud_manifest.get("requiredEnv", default_cloud_env(cloud_provider))]
    optional_env = [str(entry) for entry in cloud_manifest.get("optionalEnv", [])]
    hf_cli_bin = locate_hf_cli(root, canonical_cloud_env)
    hf_cli_available = bool(shutil.which(hf_cli_bin) or Path(hf_cli_bin).exists())
    hf_jobs_report = try_load_json(hf_jobs_training_json_path) or {}
    hf_jobs_auth = hf_jobs_report.get("auth", {}) if isinstance(hf_jobs_report, dict) else {}
    hf_jobs_staged_bundle = hf_jobs_report.get("stagedBundle", {}) if isinstance(hf_jobs_report, dict) else {}
    hf_jobs_smoke = hf_jobs_report.get("smokeLaunch", {}) if isinstance(hf_jobs_report, dict) else {}
    hf_jobs_launch = hf_jobs_report.get("launch", {}) if isinstance(hf_jobs_report, dict) else {}
    hf_jobs_summary = hf_jobs_report.get("summary", {}) if isinstance(hf_jobs_report, dict) else {}
    hf_jobs_hardware = hf_jobs_report.get("hardware", []) if isinstance(hf_jobs_report, dict) else []
    hf_jobs_gpu_shapes = hf_gpu_flavor_names(hf_jobs_hardware)
    colab_free_report = try_load_json(colab_free_training_json_path) or {}
    oci_cli_bin = locate_oci_cli(root, canonical_cloud_env)
    oci_cli_available = bool(shutil.which(oci_cli_bin) or Path(oci_cli_bin).exists())
    oci_auth_mode = "missing"
    if str(canonical_cloud_env.get("OCI_CLI_AUTH", "")).strip() == "instance_principal":
        oci_auth_mode = "instance_principal"
    elif str(canonical_cloud_env.get("OCI_CLI_CONFIG_FILE", "")).strip():
        oci_auth_mode = "config_file"
    elif all(bool(str(canonical_cloud_env.get(name, "")).strip()) for name in ("OCI_CLI_USER", "OCI_CLI_TENANCY", "OCI_CLI_FINGERPRINT", "OCI_CLI_REGION")):
        oci_auth_mode = "explicit_identity"
    oci_auth_ready = oci_auth_mode != "missing"
    oci_identity = resolve_oci_controller_identity(canonical_cloud_env) if cloud_provider == "oci" else {}
    oci_subscribed_regions = (
        list_subscribed_oci_regions(oci_cli_bin, canonical_cloud_env)
        if cloud_provider == "oci" and oci_cli_available and oci_auth_ready
        else []
    )
    oci_public_regions = (
        list_public_oci_regions(oci_cli_bin, canonical_cloud_env)
        if cloud_provider == "oci" and oci_cli_available and oci_auth_ready
        else []
    )
    oci_subscribed_region_names = [
        format_region_label(entry)
        for entry in oci_subscribed_regions
        if str(entry.get("name", "")).strip()
    ]
    oci_gpu_inventory = (
        build_oci_gpu_inventory(oci_cli_bin, canonical_cloud_env, oci_subscribed_regions)
        if cloud_provider == "oci" and oci_cli_available and oci_auth_ready
        else []
    )
    current_region_inventory = next(
        (entry for entry in oci_gpu_inventory if str(entry.get("region", "")).strip() == str(oci_identity.get("region", "")).strip()),
        None,
    )
    oci_available_gpu_shapes = (
        [str(shape) for shape in current_region_inventory.get("gpuShapes", []) if str(shape).strip()]
        if isinstance(current_region_inventory, dict)
        else []
    )
    oci_region_capacity = try_load_json(oci_region_capacity_json_path) or {}
    oci_gpu_advisor = (
        build_oci_gpu_advisor(
            canonical_env=canonical_cloud_env,
            oci_identity=oci_identity,
            subscribed_regions=oci_subscribed_regions,
            public_regions=oci_public_regions,
            gpu_inventory=oci_gpu_inventory,
        )
        if cloud_provider == "oci" and oci_cli_available and oci_auth_ready
        else {
            "probeScope": "verified-subscribed-regions-only",
            "controllerRegion": None,
            "configuredTargetRegion": None,
            "configuredShape": None,
            "configuredObjectStorageRegion": None,
            "verifiedInventory": [],
            "publicExpansionCandidates": [],
            "recommendedLaunchTarget": {
                "status": "none",
                "region": None,
                "regionKey": None,
                "isHomeRegion": False,
                "shape": None,
                "reason": (
                    "Active hybrid session is using the HF Jobs cloud lane; see OCI-Region-Capacity for the current OCI controller state."
                    if cloud_provider != "oci"
                    else "OCI GPU advisor is unavailable until OCI auth and CLI are ready."
                ),
            },
            "suggestedEnvUpdates": {},
            "actions": [],
        }
    )
    advisor_env_updates: dict[str, str] = {}
    if cloud_provider == "oci":
        session_env_path = resolve_repo_path(str(oci_bootstrap.get("sessionEnvPath", "")).strip())
        recommended_target = oci_gpu_advisor.get("recommendedLaunchTarget", {}) if isinstance(oci_gpu_advisor, dict) else {}
        suggested_env_updates = oci_gpu_advisor.get("suggestedEnvUpdates", {}) if isinstance(oci_gpu_advisor, dict) else {}
        if (
            isinstance(session_env_path, Path)
            and isinstance(recommended_target, dict)
            and isinstance(suggested_env_updates, dict)
            and str(recommended_target.get("status", "")).strip() == "available"
        ):
            if not str(canonical_cloud_env.get("OCI_TARGET_REGION", "")).strip() and str(suggested_env_updates.get("OCI_TARGET_REGION", "")).strip():
                advisor_env_updates["OCI_TARGET_REGION"] = str(suggested_env_updates["OCI_TARGET_REGION"]).strip()
            if not str(canonical_cloud_env.get("OCI_SHAPE", "")).strip() and str(suggested_env_updates.get("OCI_SHAPE", "")).strip():
                advisor_env_updates["OCI_SHAPE"] = str(suggested_env_updates["OCI_SHAPE"]).strip()
            if (
                not str(canonical_cloud_env.get("OCI_OBJECT_STORAGE_REGION", "")).strip()
                and str(suggested_env_updates.get("OCI_OBJECT_STORAGE_REGION", "")).strip()
            ):
                advisor_env_updates["OCI_OBJECT_STORAGE_REGION"] = str(suggested_env_updates["OCI_OBJECT_STORAGE_REGION"]).strip()
            if advisor_env_updates:
                save_env_file(session_env_path, advisor_env_updates)
                effective_cloud_env.update(advisor_env_updates)
                canonical_cloud_env.update(advisor_env_updates)
                for key in advisor_env_updates:
                    canonical_sources.setdefault(key, "oci_gpu_advisor")
        if isinstance(oci_gpu_advisor, dict):
            oci_gpu_advisor["materializedEnvUpdates"] = advisor_env_updates

    required_env_state = {name: bool(str(canonical_cloud_env.get(name, "")).strip()) for name in required_env}
    optional_env_state = {name: bool(str(canonical_cloud_env.get(name, "")).strip()) for name in optional_env}

    launch_target_names = list(default_cloud_env(cloud_provider))
    if cloud_provider == "oci":
        for extra_name in ("OCI_TARGET_REGION", "OCI_OBJECT_STORAGE_REGION"):
            if extra_name not in launch_target_names:
                launch_target_names.append(extra_name)
    launch_target_state = {
        name: bool(str(canonical_cloud_env.get(name, "")).strip())
        for name in launch_target_names
    }

    hf_source = "missing"
    hf_ready = False
    hf_alias_source, hf_alias_value = first_present_env_value(effective_cloud_env, CANONICAL_ENV_ALIASES["HF_TOKEN"])
    if hf_alias_source and hf_alias_value:
        hf_ready = True
        hf_source = hf_alias_source
        canonical_cloud_env["HF_TOKEN"] = hf_alias_value
    else:
        hf_file_source, hf_file_value = read_secret_value(effective_cloud_env, "HF_TOKEN")
        if hf_file_source and hf_file_value:
            hf_ready = True
            hf_source = hf_file_source
            canonical_cloud_env["HF_TOKEN"] = hf_file_value
        elif str(canonical_cloud_env.get(HF_TOKEN_SECRET_OCID, "")).strip():
            hf_ready = True
            hf_source = HF_TOKEN_SECRET_OCID

    wandb_mode = str(canonical_cloud_env.get("WANDB_MODE", "")).strip().lower()
    wandb_source = "missing"
    wandb_ready = False
    if wandb_mode in {"offline", "disabled"}:
        wandb_ready = True
        wandb_source = f"WANDB_MODE={wandb_mode}"
    else:
        wandb_alias_source, wandb_alias_value = first_present_env_value(effective_cloud_env, CANONICAL_ENV_ALIASES["WANDB_API_KEY"])
        if wandb_alias_source and wandb_alias_value:
            wandb_ready = True
            wandb_source = wandb_alias_source
            canonical_cloud_env["WANDB_API_KEY"] = wandb_alias_value
        else:
            wandb_file_source, wandb_file_value = read_secret_value(effective_cloud_env, "WANDB_API_KEY")
            if wandb_file_source and wandb_file_value:
                wandb_ready = True
                wandb_source = wandb_file_source
                canonical_cloud_env["WANDB_API_KEY"] = wandb_file_value
            elif str(canonical_cloud_env.get(WANDB_API_KEY_SECRET_OCID, "")).strip():
                wandb_ready = True
                wandb_source = WANDB_API_KEY_SECRET_OCID

    report_to = config.get("report_to", [])
    report_to_wandb = isinstance(report_to, list) and any(str(entry).strip().lower() == "wandb" for entry in report_to)

    cloud_reasons: list[str] = []
    if cloud_enabled and cloud_mode != "skip":
        missing_env_files = [entry["path"] for entry in env_file_summaries if not entry["exists"]]
        if missing_env_files:
            cloud_reasons.append(f"Missing cloud env files: {', '.join(str(entry) for entry in missing_env_files)}")
        missing_required_env = [name for name, present in required_env_state.items() if not present]
        if missing_required_env:
            cloud_reasons.append(f"Missing cloud launch target env: {', '.join(missing_required_env)}")
        if cloud_provider == "oci":
            if not oci_cli_available:
                cloud_reasons.append(f"OCI CLI is not installed or not reachable at {oci_cli_bin}.")
            if not oci_auth_ready:
                cloud_reasons.append(
                    "OCI auth is not configured through OCI_CLI_AUTH=instance_principal, OCI_CLI_CONFIG_FILE, or explicit OCI_CLI_* identity variables."
                )
            elif oci_bootstrap.get("reason") and not oci_bootstrap.get("sessionEnvUpdated"):
                cloud_reasons.append(str(oci_bootstrap["reason"]))
            if not oci_subscribed_regions:
                cloud_reasons.append("OCI subscribed regions could not be discovered for the current controller auth.")
            elif len(oci_subscribed_regions) == 1:
                cloud_reasons.append(
                    f"Only subscribed OCI region visible to this tenancy is {oci_subscribed_region_names[0]}."
                )
            configured_target_region = str(canonical_cloud_env.get("OCI_TARGET_REGION", "")).strip() or str(oci_identity.get("region", "")).strip()
            configured_target_inventory = next(
                (entry for entry in oci_gpu_inventory if str(entry.get("region", "")).strip() == configured_target_region),
                None,
            )
            configured_target_region_key = (
                str(configured_target_inventory.get("regionKey", "")).strip().upper()
                if isinstance(configured_target_inventory, dict)
                else next(
                    (
                        str(entry.get("key", "")).strip().upper()
                        for entry in oci_subscribed_regions
                        if str(entry.get("name", "")).strip() == configured_target_region
                    ),
                    "",
                )
            )
            verified_gpu_targets = [entry for entry in oci_gpu_inventory if int(entry.get("gpuShapeCount", 0)) > 0]
            if oci_auth_ready and not verified_gpu_targets:
                cloud_reasons.append(
                    "No subscribed OCI region currently exposes GPU-capable shapes for the current controller auth."
                )
            elif configured_target_region and configured_target_inventory is None:
                cloud_reasons.append(
                    f"Configured OCI target region {configured_target_region} is not among the subscribed OCI regions visible to this controller auth."
                )
            elif str(canonical_cloud_env.get("OCI_SHAPE", "")).strip() and isinstance(configured_target_inventory, dict) and str(canonical_cloud_env.get("OCI_SHAPE", "")).strip() not in [str(shape) for shape in configured_target_inventory.get("gpuShapes", [])]:
                cloud_reasons.append(
                    f"Configured OCI_SHAPE={canonical_cloud_env.get('OCI_SHAPE')} is not available in OCI region {configured_target_region}."
                )
            if (
                configured_target_region
                and str(oci_identity.get("region", "")).strip()
                and configured_target_region != str(oci_identity.get("region", "")).strip()
                and not str(canonical_cloud_env.get("OCI_OBJECT_STORAGE_REGION", "")).strip()
            ):
                cloud_reasons.append(
                    "Cross-region OCI launch requires OCI_OBJECT_STORAGE_REGION so the staged bundle can be fetched from the correct bucket region."
                )
            subnet_region_key = ocid_region_key(str(canonical_cloud_env.get("OCI_SUBNET_OCID", "")).strip())
            image_region_key = ocid_region_key(str(canonical_cloud_env.get("OCI_IMAGE_OCID", "")).strip())
            availability_domain = str(canonical_cloud_env.get("OCI_AVAILABILITY_DOMAIN", "")).strip()
            if configured_target_region_key and subnet_region_key and subnet_region_key != configured_target_region_key:
                cloud_reasons.append(
                    f"Configured OCI_SUBNET_OCID belongs to region {subnet_region_key}, not target region {configured_target_region_key}."
                )
            if configured_target_region_key and image_region_key and image_region_key != configured_target_region_key:
                cloud_reasons.append(
                    f"Configured OCI_IMAGE_OCID belongs to region {image_region_key}, not target region {configured_target_region_key}."
                )
            if availability_domain and configured_target_region and not availability_domain_matches_region(availability_domain, configured_target_region):
                cloud_reasons.append(
                    f"Configured OCI_AVAILABILITY_DOMAIN={availability_domain} does not match target region {configured_target_region}."
                )
            capacity_summary = oci_region_capacity.get("summary", {}) if isinstance(oci_region_capacity, dict) else {}
            if bool(capacity_summary.get("subscriptionLimitReached", False)):
                latest_attempt_message = str(capacity_summary.get("latestAttemptMessage", "")).strip()
                cloud_reasons.append(
                    "OCI region subscription is currently blocked by the tenancy limit."
                    + (f" {latest_attempt_message}" if latest_attempt_message else "")
                )
        if cloud_provider == "hf_jobs":
            if not hf_cli_available:
                cloud_reasons.append(f"Hugging Face CLI is not installed or not reachable at {hf_cli_bin}.")
            if not hf_jobs_report:
                cloud_reasons.append(
                    "HF Jobs staging report is missing. Run the HF Jobs launcher to authenticate, stage the bundle, and probe billing before treating this as a cloud lane."
                )
            else:
                if not bool(hf_jobs_auth.get("ready", False)):
                    cloud_reasons.append("HF Jobs auth report is not ready.")
                if not bool(hf_jobs_staged_bundle.get("staged", False)):
                    cloud_reasons.append("HF Jobs bundle staging is not complete.")
                smoke_blocker = str(hf_jobs_smoke.get("blocker") or "").strip()
                launch_blocker = str(hf_jobs_launch.get("blocker") or "").strip()
                if smoke_blocker:
                    cloud_reasons.append(f"HF Jobs smoke launch blocker: {smoke_blocker}")
                if launch_blocker:
                    cloud_reasons.append(f"HF Jobs launch blocker: {launch_blocker}")
                if not hf_jobs_gpu_shapes:
                    cloud_reasons.append("HF Jobs hardware probe did not expose any GPU-capable flavors.")
        if not hf_ready:
            cloud_reasons.append(
                "Hugging Face auth is not configured through HF_TOKEN/HUGGINGFACE_TOKEN, HF_TOKEN_FILE, or OCI_Q_TRAINING_HF_TOKEN_SECRET_OCID."
            )
        if report_to_wandb and not wandb_ready:
            cloud_reasons.append(
                "W&B is required by the Q config but is not configured through WANDB_API_KEY, WANDB_API_KEY_FILE, OCI_Q_TRAINING_WANDB_API_KEY_SECRET_OCID, or WANDB_MODE=offline."
            )
        if cloud_mode == "launch" and not cloud_launch_command:
            cloud_reasons.append("Cloud launchCommand is not configured.")
        if shutil.which("bash") is None and cloud_provider in {"oci", "custom"}:
            cloud_reasons.append("bash is not available for cloud launcher execution.")
    cloud_ready = cloud_enabled and cloud_mode != "skip" and not cloud_reasons

    cloud_execution_env = dict(effective_cloud_env)
    cloud_execution_env.update(canonical_cloud_env)
    cloud_execution_env.update(
        {
            "IMMACULATE_REPO_ROOT": str(root),
            "IMMACULATE_Q_HYBRID_SESSION_PATH": str(manifest_path),
            "IMMACULATE_Q_HYBRID_SESSION_REPO_PATH": relative_path(root, manifest_path),
            "IMMACULATE_Q_SESSION_ROOT": str(session_root),
            "IMMACULATE_Q_TRAINING_LOCK_PATH": str(training_lock_path),
            "IMMACULATE_Q_TRAINING_CONFIG_PATH": str(config_path),
            "IMMACULATE_Q_TRAINING_CONFIG_REPO_PATH": relative_path(root, config_path),
            "IMMACULATE_Q_TRAINING_MIX_MANIFEST_PATH": str(mix_manifest_path),
            "IMMACULATE_Q_TRAINING_CURATION_RUN_PATH": str(curation_run_path) if curation_run_path is not None else "",
            "IMMACULATE_Q_TRAINING_DATASET_PATH": str(dataset_path),
            "IMMACULATE_Q_BENCHMARK_CORPUS_PATH": str(benchmark_corpus_path),
            "IMMACULATE_Q_BENCHMARK_CORPUS_JSONL_PATH": str(benchmark_corpus_jsonl_path or ""),
            "IMMACULATE_Q_FAILURE_CORPUS_PATH": str(failure_corpus_path),
            "IMMACULATE_Q_TRAINING_BUNDLE_ID": str(training_lock.get("bundleId", "")),
            "IMMACULATE_Q_IMMACULATE_BUNDLE_PATH": str(immaculate_bundle_output),
            "IMMACULATE_Q_CLOUD_BUNDLE_PATH": str(root / cloud_bundle["archivePath"]),
            "IMMACULATE_Q_CLOUD_BUNDLE_MANIFEST": str(root / cloud_bundle["manifestPath"]),
            "IMMACULATE_RELEASE_BUILD_ID": release_summary["buildId"],
            "IMMACULATE_RELEASE_GIT_SHA": release_summary["gitSha"],
            "IMMACULATE_Q_TRAINING_CONTROLLER_PYTHON": sys.executable,
            "GIT_REMOTE_URL": cloud_bundle["repoRemoteUrl"],
            "OCI_CLI_BIN": oci_cli_bin,
        }
    )

    local_lane_status = "ready" if local_ready else ("skipped" if not local_enabled or local_mode == "skip" else "not-configured")
    cloud_lane_status = "ready" if cloud_ready else ("skipped" if not cloud_enabled or cloud_mode == "skip" else "not-configured")
    if (
        cloud_lane_status == "not-configured"
        and cloud_provider == "hf_jobs"
        and bool(hf_jobs_auth.get("ready", False))
        and bool(hf_jobs_staged_bundle.get("staged", False))
        and (
            str(hf_jobs_smoke.get("blocker") or "").strip()
            or str(hf_jobs_launch.get("blocker") or "").strip()
        )
    ):
        cloud_lane_status = "launch-blocked"

    summary = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sessionId": session_id,
        "manifestPath": relative_path(root, manifest_path),
        "release": release_summary,
        "q": {
            "trainingBundleId": training_lock.get("bundleId"),
            "trainingLockPath": relative_path(root, training_lock_path),
            "configPath": relative_path(root, config_path),
            "modelId": config.get("model_name", "Q"),
            "trainDatasetPath": relative_path(root, dataset_path),
            "trainDatasetRowCount": count_jsonl_rows(dataset_path),
            "mixManifestPath": relative_path(root, mix_manifest_path),
            "curationRunPath": relative_path(root, curation_run_path) if curation_run_path is not None else None,
            "curationRunId": training_lock.get("curation", {}).get("runId"),
            "benchmarkCorpusPath": relative_path(root, benchmark_corpus_path) if benchmark_corpus_path.exists() else str(benchmark_corpus_path),
            "benchmarkCorpusJsonlPath": relative_path(root, benchmark_corpus_jsonl_path) if benchmark_corpus_jsonl_path and benchmark_corpus_jsonl_path.exists() else str(benchmark_corpus_jsonl_path),
            "benchmarkCorpusRecordCount": benchmark_corpus_summary.get("recordCount", 0),
            "failureCorpusPath": relative_path(root, failure_corpus_path) if failure_corpus_path.exists() else str(failure_corpus_path),
        },
        "immaculate": {
            "bundleId": immaculate_bundle.get("bundleId"),
            "bundlePath": relative_path(root, immaculate_bundle_output),
            "signalCount": immaculate_bundle.get("summary", {}).get("signalCount"),
        },
        "cloudBundle": cloud_bundle,
        "doctor": {
            "local": {
                "python": local_python_executable,
                "ready": local_ready,
                "mode": local_mode,
                "pythonPresent": local_python_present,
                "gpuVisible": gpu_ready,
                "dependencies": local_dependency_state,
                "reasons": local_reasons,
            },
            "cloud": {
                "provider": cloud_provider,
                "mode": cloud_mode,
                "ready": cloud_ready,
                "envFiles": env_file_summaries,
                "inlineEnvKeys": sorted(cloud_inline_env.keys()) if isinstance(cloud_inline_env, dict) else [],
                "requiredEnv": required_env_state,
                "optionalEnv": optional_env_state,
                "launchTarget": launch_target_state,
                "launchCommandConfigured": bool(cloud_launch_command),
                "launchCommand": cloud_launch_command,
                "cliBin": oci_cli_bin if cloud_provider == "oci" else hf_cli_bin,
                "authMode": oci_auth_mode if cloud_provider == "oci" else ("token" if hf_ready else "missing"),
                "authSource": oci_bootstrap.get("source") if cloud_provider == "oci" else ("HF_TOKEN" if hf_source else None),
                "authConfigPath": oci_bootstrap.get("configPath") if cloud_provider == "oci" else None,
                "authProfile": oci_bootstrap.get("profile") if cloud_provider == "oci" else None,
                "authKeyPath": oci_bootstrap.get("keyPath") if cloud_provider == "oci" else None,
                "authKeyRepaired": oci_bootstrap.get("keyPathRepaired") if cloud_provider == "oci" else False,
                "sessionEnvPath": oci_bootstrap.get("sessionEnvPath") if cloud_provider == "oci" else None,
                "sessionEnvUpdated": oci_bootstrap.get("sessionEnvUpdated") if cloud_provider == "oci" else False,
                "advisorEnvUpdated": bool(advisor_env_updates) if cloud_provider == "oci" else False,
                "region": oci_identity.get("region") if cloud_provider == "oci" else None,
                "targetRegion": (str(canonical_cloud_env.get("OCI_TARGET_REGION", "")).strip() or oci_identity.get("region")) if cloud_provider == "oci" else None,
                "objectStorageRegion": (str(canonical_cloud_env.get("OCI_OBJECT_STORAGE_REGION", "")).strip() or oci_identity.get("region")) if cloud_provider == "oci" else None,
                "subscribedRegions": oci_subscribed_regions if cloud_provider == "oci" else [],
                "subscribedRegionNames": oci_subscribed_region_names if cloud_provider == "oci" else [],
                "availableGpuShapes": oci_available_gpu_shapes if cloud_provider == "oci" else hf_jobs_gpu_shapes,
                "gpuInventory": oci_gpu_inventory if cloud_provider == "oci" else hf_jobs_hardware,
                "recommendedLaunchTarget": oci_gpu_advisor.get("recommendedLaunchTarget") if (cloud_provider == "oci" and isinstance(oci_gpu_advisor, dict)) else {},
                "account": hf_jobs_auth.get("user") if cloud_provider == "hf_jobs" else None,
                "bundleRepo": hf_jobs_staged_bundle.get("repoId") if cloud_provider == "hf_jobs" else None,
                "bundleStaged": hf_jobs_staged_bundle.get("staged") if cloud_provider == "hf_jobs" else None,
                "jobsVisibleCount": hf_jobs_report.get("jobsVisibleCount") if cloud_provider == "hf_jobs" else None,
                "smokeAttempted": hf_jobs_smoke.get("attempted") if cloud_provider == "hf_jobs" else None,
                "smokeBlocker": hf_jobs_smoke.get("blocker") if cloud_provider == "hf_jobs" else None,
                "launchBlocker": hf_jobs_launch.get("blocker") if cloud_provider == "hf_jobs" else None,
                "reasons": cloud_reasons,
                "canonicalSources": canonical_sources,
            },
            "huggingFace": {
                "ready": hf_ready,
                "source": hf_source,
            },
            "wandb": {
                "ready": wandb_ready if report_to_wandb else True,
                "source": wandb_source if report_to_wandb else "not-required",
                "entityPresent": bool(str(canonical_cloud_env.get("WANDB_ENTITY", "")).strip()),
                "projectPresent": bool(str(canonical_cloud_env.get("WANDB_PROJECT", "")).strip()),
                "mode": wandb_mode or "online",
            },
        },
        "ociGpuAdvisor": {
            **oci_gpu_advisor,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "sessionId": session_id,
            "release": release_summary,
            "output": {
                "jsonPath": relative_path(root, oci_gpu_advisor_json_path),
                "markdownPath": relative_path(root, oci_gpu_advisor_markdown_path),
            },
        },
        "ociRegionCapacity": {
            **oci_region_capacity,
            "output": {
                "jsonPath": relative_path(root, oci_region_capacity_json_path),
                "markdownPath": relative_path(root, oci_region_capacity_markdown_path),
            },
        } if isinstance(oci_region_capacity, dict) else {},
        "hfJobsTraining": {
            **hf_jobs_report,
            "output": {
                "jsonPath": relative_path(root, hf_jobs_training_json_path),
                "markdownPath": relative_path(root, hf_jobs_training_markdown_path),
            },
        } if isinstance(hf_jobs_report, dict) and hf_jobs_report else {},
        "colabFreeTraining": {
            **colab_free_report,
            "output": {
                "jsonPath": relative_path(root, colab_free_training_json_path),
                "markdownPath": relative_path(root, colab_free_training_markdown_path),
            },
        } if isinstance(colab_free_report, dict) and colab_free_report else {},
        "lanes": {
            "local": {
                "enabled": local_enabled,
                "mode": local_mode,
                "status": local_lane_status,
                "command": local_command,
            },
            "cloud": {
                "enabled": cloud_enabled,
                "provider": cloud_provider,
                "mode": cloud_mode,
                "status": cloud_lane_status,
                "command": cloud_launch_command,
            },
        },
        "output": {
            "sessionJsonPath": relative_path(root, session_json_path),
            "sessionMarkdownPath": relative_path(root, session_markdown_path),
            "wikiJsonPath": relative_path(root, wiki_json_path),
            "wikiMarkdownPath": relative_path(root, wiki_markdown_path),
            "hfJobsTrainingJsonPath": relative_path(root, hf_jobs_training_json_path),
            "hfJobsTrainingMarkdownPath": relative_path(root, hf_jobs_training_markdown_path),
            "colabFreeTrainingJsonPath": relative_path(root, colab_free_training_json_path),
            "colabFreeTrainingMarkdownPath": relative_path(root, colab_free_training_markdown_path),
            "ociGpuAdvisorJsonPath": relative_path(root, oci_gpu_advisor_json_path),
            "ociGpuAdvisorMarkdownPath": relative_path(root, oci_gpu_advisor_markdown_path),
            "ociRegionCapacityJsonPath": relative_path(root, oci_region_capacity_json_path),
            "ociRegionCapacityMarkdownPath": relative_path(root, oci_region_capacity_markdown_path),
        },
    }

    if args.launch:
        local_process = None
        cloud_process = None
        if local_ready and local_command:
            local_process = subprocess.Popen(local_command, cwd=str(root))
            summary["lanes"]["local"]["status"] = "launched"
        if cloud_ready and cloud_mode == "launch" and cloud_launch_command:
            cloud_process = subprocess.Popen(cloud_launch_command, cwd=str(root), env=cloud_execution_env)
            summary["lanes"]["cloud"]["status"] = "launched"

        if local_process is not None:
            local_exit_code = local_process.wait()
            summary["lanes"]["local"]["exitCode"] = local_exit_code
            summary["lanes"]["local"]["status"] = "completed" if local_exit_code == 0 else "failed"
        if cloud_process is not None:
            cloud_exit_code = cloud_process.wait()
            summary["lanes"]["cloud"]["exitCode"] = cloud_exit_code
            summary["lanes"]["cloud"]["status"] = "completed" if cloud_exit_code == 0 else "failed"

    latest_session_path = root / ".training-output" / "q" / "latest-hybrid-session.json"
    save_json(session_json_path, summary)
    save_json(latest_session_path, summary)
    markdown = render_markdown(summary)
    advisor_markdown = render_oci_gpu_advisor_markdown(summary["ociGpuAdvisor"])
    save_markdown(session_markdown_path, markdown)
    save_json(wiki_json_path, summary)
    save_markdown(wiki_markdown_path, markdown)
    save_json(oci_gpu_advisor_json_path, summary["ociGpuAdvisor"])
    save_markdown(oci_gpu_advisor_markdown_path, advisor_markdown)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
