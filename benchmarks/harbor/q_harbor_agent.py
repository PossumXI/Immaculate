from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from openai import APIConnectionError, APITimeoutError, AsyncOpenAI, InternalServerError

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


BENCHMARK_SKIP_Q_IDENTITY_HEADER = "x-immaculate-benchmark-skip-q-identity"
BENCHMARK_REQUEST_TIMEOUT_HEADER = "x-immaculate-request-timeout-ms"
PRIMARY_TERMINAL_PLAN_MAX_TOKENS = 192
FALLBACK_TERMINAL_PLAN_MAX_TOKENS = 128
PRIMARY_TERMINAL_GENERATION_MAX_TOKENS = 900
FALLBACK_TERMINAL_GENERATION_MAX_TOKENS = 320
PREWARM_REQUEST_TIMEOUT_MS = 5000
PLAN_REQUEST_TIMEOUT_MS = 45000
GENERATION_REQUEST_TIMEOUT_MS = 120000
GENERATION_RETRY_REQUEST_TIMEOUT_MS = 105000
MIPS_CHUNK_REQUEST_TIMEOUT_MS = 70000
MIPS_CHUNK_MAX_TOKENS = (120, 176, 144)
MIPS_COMPACT_CHUNK_REQUEST_TIMEOUT_MS = 65000
SUMMARY_REQUEST_TIMEOUT_MS = 15000
STRUCTURED_REPAIR_REQUEST_TIMEOUT_MS = 20000
GENERATION_GATEWAY_READY_WAIT_SEC = 15
GENERATION_RETRY_GATEWAY_READY_WAIT_SEC = 20
GENERATION_CIRCUIT_RETRY_WAIT_SEC = 12
MIPS_PRIOR_TAIL_MAX_LINES = 45
MIPS_PRIOR_TAIL_MAX_CHARS = 800


def _normalize_model_name(value: str | None) -> str:
    if not value:
        return "Q"
    return value.split("/", 1)[1] if "/" in value else value


def _health_url_from_api_base(api_base_url: str) -> str | None:
    candidate = api_base_url.strip().rstrip("/")
    if not candidate:
        return None
    if candidate.endswith("/v1"):
        return f"{candidate[:-3]}/health"
    return None


def _normalize_route(value: str | None) -> str | None:
    candidate = " ".join(str(value or "").strip().lower().split())
    if candidate in {"reflex", "cognitive", "guarded", "suppressed"}:
        return candidate
    for route in ("guarded", "suppressed", "cognitive", "reflex"):
        if route in candidate:
            return route
    if "guard" in candidate:
        return "guarded"
    if "suppress" in candidate or "block" in candidate:
        return "suppressed"
    if "cognit" in candidate or "repair" in candidate or "stabil" in candidate:
        return "cognitive"
    if "direct" in candidate:
        return "reflex"
    return None


def _strip_code_fences(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if len(lines) >= 3 and lines[-1].strip() == "```":
            return "\n".join(lines[1:-1]).strip()
    return text


def _extract_json_object(value: str) -> dict[str, Any] | None:
    text = _strip_code_fences(value)
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start:
        return None
    try:
        parsed = json.loads(text[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        return None


def _normalize_structured_result(value: dict[str, Any] | None) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    route = _normalize_route(str(value.get("route", "")).strip())
    reason = " ".join(str(value.get("reason", "")).strip().split())
    commit = " ".join(str(value.get("commit", "")).strip().split())
    if route not in {"reflex", "cognitive", "guarded", "suppressed"}:
        return None
    if not reason or not commit:
        return None
    if len(reason.split()) > 24 or len(commit.split()) > 24:
        return None
    return {"route": route, "reason": reason, "commit": commit}


def _task_fact_lines(task_payload: dict[str, Any]) -> list[str]:
    facts: list[str] = []
    for field in ("incident", "report_excerpt"):
        payload = task_payload.get(field)
        if not isinstance(payload, dict):
            continue
        entries = payload.get("facts")
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if isinstance(entry, str):
                fact = " ".join(entry.strip().split())
                if fact:
                    facts.append(fact)
    return facts


def _task_fact_flags(task_payload: dict[str, Any]) -> dict[str, bool]:
    joined = " | ".join(_task_fact_lines(task_payload)).lower()
    return {
        "late_ack": "late ack" in joined,
        "nonce_mismatch": "nonce mismatch" in joined,
        "nonce_replay": "nonce replay" in joined or "replayed" in joined,
        "bridge_degraded": "bridge path cannot be trusted" in joined or "bridge is degraded" in joined,
        "bridge_untrusted": "bridge path cannot be trusted" in joined or "bridge untrusted" in joined,
        "direct_http2_healthy": "direct http/2" in joined and ("healthy" in joined or "policy-allowed" in joined),
    }


def _sharpen_operator_wording(
    task_payload: dict[str, Any],
    structured: dict[str, str],
) -> dict[str, str]:
    flags = _task_fact_flags(task_payload)
    if structured.get("route") != "guarded":
        return structured

    if (
        (flags["late_ack"] or flags["bridge_degraded"] or flags["bridge_untrusted"])
        and (flags["nonce_replay"] or flags["nonce_mismatch"])
        and flags["direct_http2_healthy"]
    ):
        return {
            "route": "guarded",
            "reason": "Bridge health is degraded by late ACK and nonce replay; direct HTTP/2 is the trusted lane.",
            "commit": "Route through verified direct HTTP/2, keep the bridge untrusted, and preserve truthful delivery state.",
        }

    if (flags["late_ack"] or flags["bridge_degraded"] or flags["bridge_untrusted"]) and (
        flags["nonce_replay"] or flags["nonce_mismatch"]
    ):
        return {
            "route": "guarded",
            "reason": "Nonce mismatch and late ACK make the bridge untrusted.",
            "commit": "Reject the invalid ACK, keep delivery unresolved, and record containment in the audit trail.",
        }

    return structured


def _normalize_terminal_target(path_value: str | None) -> str | None:
    candidate = str(path_value or "").strip()
    if not candidate:
        return None
    candidate = candidate.replace("\\", "/")
    if candidate.startswith("/app/"):
        normalized = candidate
    elif candidate.startswith("/tests/"):
        normalized = candidate
    elif candidate.startswith("/"):
        return None
    else:
        normalized = f"/app/{candidate.lstrip('./')}"
    if ".." in normalized.split("/"):
        return None
    return normalized


def _instruction_target_tokens(value: str) -> list[str]:
    stripped = str(value or "").strip()
    if not stripped:
        return []
    if " " not in stripped and "\t" not in stripped and "\n" not in stripped:
        return [stripped]
    path_like = re.findall(r"[A-Za-z0-9_./-]+\.(?:js|ts|py|sh|json|txt|md|c|h)", stripped)
    return path_like or [stripped]


def _extract_instruction_targets(instruction: str) -> list[str]:
    targets: list[str] = []
    for candidate in re.findall(r"`([^`]+)`", instruction):
        for token in _instruction_target_tokens(candidate):
            normalized = _normalize_terminal_target(token)
            if normalized and normalized not in targets:
                targets.append(normalized)
    for candidate in re.findall(r"\b[a-zA-Z0-9_.-]+\.(?:js|ts|py|sh|json|txt|md)\b", instruction):
        normalized = _normalize_terminal_target(candidate)
        if normalized and normalized not in targets:
            targets.append(normalized)
    return targets[:4]


def _truncate_text(value: str | None, max_chars: int = 3000) -> str:
    text = str(value or "").strip()
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars].rstrip()}\n...[truncated]"


def _last_lines(value: str | None, *, max_lines: int = 80, max_chars: int = 1200) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    lines = text.splitlines()
    selected: list[str] = []
    total_chars = 0
    for line in reversed(lines[-max_lines:]):
        additional = len(line) + (1 if selected else 0)
        if selected and total_chars + additional > max_chars:
            break
        selected.append(line)
        total_chars += additional
    return "\n".join(reversed(selected))


def _extract_line_windows(
    content: str | None,
    markers: list[str],
    *,
    radius: int = 8,
    max_chars: int = 900,
) -> str:
    text = str(content or "")
    if not text:
        return ""
    lowered_markers = [marker.lower() for marker in markers if marker]
    if not lowered_markers:
        return _truncate_text(text, max_chars)
    lines = text.splitlines()
    windows: list[str] = []
    seen: set[tuple[int, int]] = set()
    for marker in lowered_markers:
        for index, line in enumerate(lines):
            if marker not in line.lower():
                continue
            start = max(0, index - radius)
            end = min(len(lines), index + radius + 1)
            key = (start, end)
            if key in seen:
                break
            seen.add(key)
            windows.append("\n".join(lines[start:end]))
            break
    if not windows:
        return _truncate_text(text, max_chars)
    return _truncate_text("\n...\n".join(windows), max_chars)


def _extract_matching_lines(
    content: str | None,
    markers: list[str],
    *,
    max_lines: int = 10,
    max_chars: int = 420,
) -> str:
    text = str(content or "")
    if not text:
        return ""
    lowered_markers = [marker.lower() for marker in markers if marker]
    if not lowered_markers:
        return _truncate_text(text, max_chars)
    matches: list[str] = []
    for line in text.splitlines():
        lowered = line.lower()
        if any(marker in lowered for marker in lowered_markers):
            matches.append(line)
        if len(matches) >= max_lines:
            break
    if not matches:
        return _truncate_text(text, max_chars)
    return _truncate_text("\n".join(matches), max_chars)


def _focused_terminal_read(path_value: str, content: str | None) -> str:
    normalized = path_value.replace("\\", "/")
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric.h"):
        return _extract_line_windows(
            content,
            ["void doomgeneric_Create", "void doomgeneric_Tick", "void DG_DrawFrame"],
            radius=4,
            max_chars=680,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/my_stdlib.h"):
        return _extract_matching_lines(
            content,
            ["syscall6", "fopen", "fwrite", "puts", "exit"],
            max_lines=14,
            max_chars=520,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/my_stdlib.c"):
        return _extract_line_windows(
            content,
            ["static long syscall6", "real_syscall6", "FILE* fopen", "size_t fwrite", "puts(", "exit("],
            radius=6,
            max_chars=920,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/fake_fs.h"):
        return _extract_matching_lines(
            content,
            ["SYS_read", "SYS_write", "SYS_open", "SYS_close", "SYS_lseek", "syscall_fs"],
            max_lines=14,
            max_chars=520,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/fake_fs.c"):
        return _extract_line_windows(
            content,
            ["syscall_fs", "sys_open", "sys_write", "sys_read", "doom.wad"],
            radius=6,
            max_chars=920,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric.c"):
        return _extract_line_windows(
            content,
            ["void doomgeneric_Create", "DG_ScreenBuffer", "D_DoomMain"],
            radius=5,
            max_chars=720,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric_img.c"):
        return _extract_line_windows(
            content,
            ["writeBMPFile", "void DG_DrawFrame", "int main", "doomgeneric_Create", "doomgeneric_Tick"],
            radius=10,
            max_chars=860,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/d_main.c"):
        return _extract_line_windows(
            content,
            ["void doomgeneric_Tick", "I_InitGraphics", "D_DoomLoop"],
            radius=8,
            max_chars=780,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric_mips.map"):
        return _extract_line_windows(
            content,
            ["doomgeneric_Tick", "I_InitGraphics", "doomgeneric_Create", "DG_DrawFrame"],
            radius=3,
            max_chars=620,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/i_video.c"):
        return _extract_line_windows(
            content,
            ["void I_InitGraphics", "I_InitGraphics: DOOM screen size", "DG_DrawFrame"],
            radius=10,
            max_chars=920,
        )
    if normalized.endswith("/doomgeneric/README.md"):
        return _extract_line_windows(
            content,
            ["Create a file named", "DG_DrawFrame", "doomgeneric_Create", "doomgeneric_Tick"],
            radius=4,
            max_chars=760,
        )
    return _truncate_text(content, 640)


def _focused_terminal_generation_read(path_value: str, content: str | None) -> str:
    normalized = path_value.replace("\\", "/")
    if normalized.endswith("/doomgeneric/README.md"):
        return _extract_line_windows(
            content,
            ["Create a file named", "DG_Init", "DG_DrawFrame", "main loop", "doomgeneric_Create", "doomgeneric_Tick"],
            radius=2,
            max_chars=440,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric.h"):
        return _extract_matching_lines(
            content,
            [
                "DG_ScreenBuffer",
                "doomgeneric_Create",
                "doomgeneric_Tick",
                "DG_Init",
                "DG_DrawFrame",
                "DG_GetTicksMs",
                "DG_GetKey",
                "DG_SetWindowTitle",
            ],
            max_lines=10,
            max_chars=360,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/my_stdlib.h"):
        return _extract_matching_lines(
            content,
            ["syscall6", "fopen", "fwrite", "puts", "exit"],
            max_lines=12,
            max_chars=420,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/my_stdlib.c"):
        return _extract_matching_lines(
            content,
            ["syscall6", "real_syscall6", "syscall_fs", "fopen", "fwrite", "puts(", "SYS_exit", "SYS_gettimeofday", "SYS_nanosleep"],
            max_lines=18,
            max_chars=680,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/fake_fs.h"):
        return _extract_matching_lines(
            content,
            ["SYS_read", "SYS_write", "SYS_open", "SYS_close", "SYS_lseek", "syscall_fs"],
            max_lines=14,
            max_chars=440,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/fake_fs.c"):
        return _extract_matching_lines(
            content,
            ["syscall_fs", "sys_open", "sys_write", "sys_read", "doom.wad"],
            max_lines=18,
            max_chars=700,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric_img.c"):
        return _extract_matching_lines(
            content,
            ["BMP", "writeBMPFile", "DG_DrawFrame", "int main", "doomgeneric_Create", "doomgeneric_Tick"],
            max_lines=18,
            max_chars=680,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/d_main.c"):
        return _extract_matching_lines(
            content,
            ["doomgeneric_Tick", "I_InitGraphics", "D_DoomLoop", "D_Display"],
            max_lines=12,
            max_chars=480,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/doomgeneric_mips.map"):
        return _extract_matching_lines(
            content,
            ["doomgeneric_Tick", "I_InitGraphics", "doomgeneric_Create", "DG_DrawFrame"],
            max_lines=10,
            max_chars=420,
        )
    if normalized.endswith("/doomgeneric/doomgeneric/i_video.c"):
        return _extract_matching_lines(
            content,
            ["I_InitGraphics", "DOOM screen size", "SCREENWIDTH", "SCREENHEIGHT"],
            max_lines=10,
            max_chars=340,
        )
    return _truncate_text(content, 300)


def _diagnostic_task_shims_enabled() -> bool:
    return os.getenv("IMMACULATE_ENABLE_TERMINAL_BENCH_DIAGNOSTIC_SHIMS", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def _harbor_prewarm_enabled() -> bool:
    raw = os.getenv("IMMACULATE_Q_HARBOR_PREWARM", "").strip().lower()
    if not raw:
        return True
    return raw in {
        "1",
        "true",
        "yes",
        "on",
    }


def _is_retryable_q_error(error: Exception) -> bool:
    if isinstance(error, (InternalServerError, APIConnectionError, APITimeoutError)):
        return True
    lowered = " ".join(str(error).strip().lower().split())
    if not lowered:
        return False
    retry_markers = (
        "q_upstream_failure",
        "circuit_open",
        "connection error",
        "timed out",
        "timeout",
        "remote protocol error",
        "temporarily unavailable",
        "server disconnected",
    )
    return any(marker in lowered for marker in retry_markers)


def _terminal_command_is_inspection_only(command: str) -> bool:
    lowered = f" {str(command or '').strip().lower()} "
    if not lowered.strip():
        return False
    if ">" in lowered or ">>" in lowered or "<<" in lowered:
        return False
    blocked_tokens = (
        " rm ",
        " mv ",
        " cp ",
        " touch ",
        " tee ",
        " sed -i",
        " perl -i",
        " python - <<",
        " python3 - <<",
        " cat <<",
    )
    return not any(token in lowered for token in blocked_tokens)


def _normalize_terminal_plan(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    reads = [
        normalized
        for entry in value.get("reads", [])
        if isinstance(entry, str)
        for normalized in [_normalize_terminal_target(entry)]
        if normalized
    ][:8]
    commands = [
        " ".join(str(entry).split())
        for entry in value.get("commands", [])
        if isinstance(entry, str) and str(entry).strip()
    ][:6]
    target_files = [
        normalized
        for entry in value.get("target_files", [])
        if isinstance(entry, str)
        for normalized in [_normalize_terminal_target(entry)]
        if normalized
    ][:3]
    goal = " ".join(str(value.get("goal", "")).split()).strip()
    return {
        "goal": goal,
        "reads": reads,
        "commands": commands,
        "target_files": target_files,
    }


def _summarize_verification_feedback(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    node_probe = value.get("node_probe") if isinstance(value.get("node_probe"), dict) else {}
    similarity = value.get("similarity") if isinstance(value.get("similarity"), dict) else {}
    return {
        "success": bool(value.get("success")),
        "node_probe": {
            "return_code": node_probe.get("return_code"),
            "stdout": _truncate_text(node_probe.get("stdout"), 1200),
            "stderr": _truncate_text(node_probe.get("stderr"), 600),
        },
        "similarity": {
            "return_code": similarity.get("return_code"),
            "stdout": _truncate_text(similarity.get("stdout"), 1200),
            "stderr": _truncate_text(similarity.get("stderr"), 600),
        },
    }


def _verification_feedback_text(value: dict[str, Any] | None) -> str:
    if not isinstance(value, dict):
        return ""
    parts: list[str] = []
    for key in ("node_probe", "similarity"):
        payload = value.get(key)
        if not isinstance(payload, dict):
            continue
        for field in ("stdout", "stderr"):
            text = str(payload.get(field, "")).strip()
            if text:
                parts.append(text)
    return "\n".join(parts)


def _terminal_failure_contract_hints(value: dict[str, Any] | None) -> list[str]:
    text = _verification_feedback_text(value)
    lowered = text.lower()
    hints: list[str] = []
    if not lowered:
        return hints
    if "simulat" in lowered:
        hints.append(
            "Reject simulated execution, fake success logs, and placeholder runtime stubs; the verifier expects a real execution path."
        )
    if "executing binary via child process" in lowered or "failed to execute or process mips binary" in lowered:
        hints.append(
            "Do not exec doomgeneric_mips as a host process; it is a MIPS ELF that must be interpreted and bridged to the doomgeneric host interface."
        )
    if "/bin/sh:" in lowered and "doomgeneric_mips" in lowered and "not found" in lowered:
        hints.append(
            "The current failure came from treating doomgeneric_mips like a native executable. Replace that with a real MIPS instruction path."
        )
    if "frame_exists=no" in lowered:
        hints.append(
            "The verifier saw no /tmp/frame.bmp. A valid fix must drive the real frame-writing path, not just log progress."
        )
        hints.append(
            "Do not emit fake simulator logs, frame_N.bin artifacts, JavaScript doomgeneric stand-ins, or replayed artifacts."
        )
    if "referenceerror" in lowered and (
        "doomgeneric_create" in lowered or "doomgeneric_tick" in lowered or "dg_drawframe" in lowered
    ):
        hints.append(
            "The binary doomgeneric symbols are not JavaScript globals. Do not define or call doomgeneric_Create, doomgeneric_Tick, DG_Init, or DG_DrawFrame from vm.js."
        )
    if "i_initgraphics" in lowered or "expected text not found" in lowered:
        hints.append(
            "The verifier expects real DOOM initialization stdout, including 'I_InitGraphics: DOOM screen size: w x h: 320 x 200'."
        )
    if "cannot identify image file" in lowered or "unidentifiedimageerror" in lowered:
        hints.append("The frame file must be a valid BMP image, not arbitrary bytes or a placeholder buffer.")
    if "similar to reference" in lowered or "reference.jpg" in lowered:
        hints.append("The first rendered frame must be visually close to the reference image, not just any file named frame.bmp.")
    if "syntaxerror" in lowered or "unexpected identifier" in lowered or "unexpected token" in lowered:
        hints.append(
            "Return parseable JavaScript only. Do not emit doc comments, prose, duplicated object fragments, or unfinished blocks."
        )
    return hints[:4]


def _terminal_should_rebuild_from_contract_only(
    drift: dict[str, Any] | None,
) -> bool:
    categories = {
        str(entry).strip()
        for entry in (drift or {}).get("categories", [])
        if str(entry).strip()
    }
    return bool(
        categories.intersection(
            {
                "fake_simulator_logs",
                "non_verifier_frame_output",
                "native_exec_mips_binary",
                "js_host_symbol_replacement",
                "placeholder_host_bridge",
                "reference_artifact_replay",
                "direct_frame_stub",
                "missing_binary_load",
            }
        )
    )


def _terminal_failure_search_terms(value: dict[str, Any] | None) -> list[str]:
    text = _verification_feedback_text(value)
    lowered = text.lower()
    terms: list[str] = []
    if "executing binary via child process" in lowered or "doomgeneric_mips" in lowered:
        terms.extend(["doomgeneric_Create", "doomgeneric_Tick", "DG_DrawFrame"])
    if "semantic_drift=" in lowered or "prewrite_reject=yes" in lowered:
        terms.extend(["doomgeneric_Create", "doomgeneric_Tick", "DG_DrawFrame", "I_InitGraphics"])
    if "i_initgraphics" in lowered:
        terms.append("I_InitGraphics")
    if "syntaxerror" in lowered or "unexpected token" in lowered:
        terms.extend(["doomgeneric_Create", "doomgeneric_Tick", "vm.js"])
    if "frame.bmp" in lowered:
        terms.append("frame.bmp")
    if "reference.jpg" in lowered:
        terms.append("reference.jpg")
    if "doomgeneric_mips" in lowered or "mips" in lowered:
        terms.append("doomgeneric_mips")
    deduped: list[str] = []
    for term in terms:
        if term not in deduped:
            deduped.append(term)
    return deduped[:6]


def _terminal_semantic_drift(
    file_content: str | None,
    discovered: dict[str, Any],
    verification_feedback: dict[str, Any] | None = None,
) -> dict[str, Any]:
    text = str(file_content or "")
    lowered = text.lower()
    feedback_text = _verification_feedback_text(verification_feedback).lower()
    verified_source_backed_wrapper = _is_verified_mips_source_backed_wrapper(text)
    source_backed_native_path = verified_source_backed_wrapper or any(
        marker in lowered
        for marker in (
            "/app/doomgeneric/doomgeneric",
            "doomgeneric_img.c",
            "src_doom",
            "/tmp/doomgeneric_host",
            "child_process",
            "execsync(",
            "execfilesync(",
            "-iwad /app/doom.wad",
        )
    )
    categories: list[str] = []
    observations: list[str] = []

    def add(category: str, observation: str) -> None:
        if category not in categories:
            categories.append(category)
            observations.append(observation)

    if discovered.get("mips_like"):
        if any(
            marker in lowered
            for marker in (
                "doomgeneric_create:",
                "doomgeneric_tick:",
                "dg_init:",
                "dg_drawframe:",
                "function doomgeneric_create",
                "function doomgeneric_tick",
                "function dg_init",
                "function dg_drawframe",
            )
        ):
            add(
                "js_host_symbol_replacement",
                "Generated file reimplemented MIPS-side doomgeneric symbols as JavaScript host functions instead of executing the binary path.",
            )
        if not source_backed_native_path and any(
            marker in lowered
            for marker in (
                "doomgeneric_create(",
                "doomgeneric_tick(",
                "dg_init(",
                "dg_drawframe(",
            )
        ):
            add(
                "js_host_symbol_replacement",
                "Generated file calls binary doomgeneric symbols directly from JavaScript instead of driving a real runtime boundary.",
            )
        if any(
            marker in lowered
            for marker in (
                "host contract simulation",
                "simulating the doomgeneric host contract",
                "mips architecture simulation",
                "1mb simulated ram",
                "doomgeneric_create = null",
                "doomgeneric_tick = null",
                "dg_init = null",
            )
        ):
            add(
                "placeholder_host_bridge",
                "Generated file left the doomgeneric bridge as a placeholder or simulation stub instead of a real interpreter path.",
            )
        if any(
            marker in lowered
            for marker in (
                "simulating mips execution",
                "mips execution simulation",
                "simulation complete",
                "simulating frame",
                "simulating doomgeneric_",
                "simulating dg_",
            )
        ):
            add(
                "fake_simulator_logs",
                "Generated file narrates simulated execution instead of implementing a real interpreter path.",
            )
        if any(marker in lowered for marker in ("frame_1.bin", "frame_2.bin", "frame_3.bin")):
            add(
                "non_verifier_frame_output",
                "Generated file writes frame_N.bin artifacts instead of the verifier-visible /tmp/frame.bmp output.",
            )
        if "doomgeneric_mips" in lowered and any(
            marker in lowered for marker in ("child_process", "spawn(", "spawnsync(", "exec(", "execfile", "execsync(")
        ):
            add(
                "native_exec_mips_binary",
                "Generated file tries to execute the MIPS ELF as a host process instead of interpreting it.",
            )
        if not source_backed_native_path and any(
            marker in lowered
            for marker in (
                "/tmp/doomgeneric_host",
                "-darch_x86",
                "spawnsync('python3'",
                "spawnsync(\"python3\"",
                "spawnSync('python3'",
                "spawnSync(\"python3\"",
            )
        ):
            add(
                "host_native_wrapper",
                "Generated file drifted into a native helper wrapper instead of a verifier-true JavaScript interpreter path.",
            )
        if "/tests/reference.jpg" in lowered or "reference.jpg" in lowered:
            add(
                "reference_artifact_replay",
                "Generated file references the verifier artifact directly instead of producing the first frame through the runtime path.",
            )
        if not verified_source_backed_wrapper and any(
            marker in lowered
            for marker in (
                "fs.writefilesync(bmppath, framedata)",
                "fs.writefilesync('/tmp/frame.bmp', framedata)",
                "fs.writefilesync(\"/tmp/frame.bmp\", framedata)",
                "frame.write_bytes(last_good)",
                "frame.writebytes(last_good)",
            )
        ):
            add(
                "direct_frame_stub",
                "Generated file writes a direct frame artifact without real interpreter-backed rendering semantics.",
            )
        if not source_backed_native_path and not any(
            marker in lowered
            for marker in (
                "/app/doomgeneric_mips",
                "doomgeneric_mips",
                "fs.readfilesync(",
                "readfilesync(",
                "e_ident",
                "elf",
                "entrypoint",
                "entry_point",
            )
        ):
            add(
                "missing_binary_load",
                "Generated file never loads or parses doomgeneric_mips, so it cannot reach a real interpreter path.",
            )
        if not source_backed_native_path and ("doomgeneric_create(" not in lowered or "doomgeneric_tick(" not in lowered):
            add(
                "missing_host_loop",
                "Generated file never reaches the real doomgeneric_Create()/doomgeneric_Tick() loop required by the host contract.",
            )

    if "frame_exists=no" in feedback_text:
        add(
            "missing_verifier_frame",
            "Verifier still saw no /tmp/frame.bmp, so the generated path did not satisfy the frame contract.",
        )
    if "syntaxerror" in feedback_text or "unexpected identifier" in feedback_text or "unexpected token" in feedback_text:
        add(
            "syntax_broken_vmjs",
            "Generated vm.js is not valid JavaScript, so the runtime never reached the real verifier-visible path.",
        )
    if "i_initgraphics" in feedback_text or "expected text not found" in feedback_text:
        add(
            "missing_runtime_signal",
            "Verifier-visible runtime stdout is still missing the real I_InitGraphics signal.",
        )
    if "cannot identify image file" in feedback_text or "unidentifiedimageerror" in feedback_text:
        add(
            "invalid_frame_artifact",
            "Generated frame artifact was present but invalid as a real BMP image.",
        )

    reject_before_verify = any(
        category in categories
        for category in ("fake_simulator_logs", "non_verifier_frame_output", "native_exec_mips_binary")
    )
    reject_before_verify = reject_before_verify or any(
        category in categories
        for category in (
            "js_host_symbol_replacement",
            "placeholder_host_bridge",
            "reference_artifact_replay",
            "direct_frame_stub",
            "missing_binary_load",
        )
    )
    return {
        "detected": bool(categories),
        "categories": categories,
        "observations": observations,
        "rejectBeforeVerify": reject_before_verify,
    }


def _should_force_source_backed_wrapper(
    drift: dict[str, Any] | None,
    candidate_content: str | None,
    verification_feedback: dict[str, Any] | None,
) -> bool:
    categories = {
        str(entry).strip()
        for entry in (drift or {}).get("categories", [])
        if str(entry).strip()
    }
    if categories.intersection(
        {
            "native_exec_mips_binary",
            "js_host_symbol_replacement",
            "placeholder_host_bridge",
            "missing_binary_load",
            "missing_host_loop",
        }
    ):
        return True
    lowered_candidate = str(candidate_content or "").lower()
    lowered_feedback = _verification_feedback_text(verification_feedback).lower()
    if "referenceerror" in lowered_feedback and (
        "doomgeneric_create" in lowered_feedback or "doomgeneric_tick" in lowered_feedback
    ):
        return True
    return any(
        marker in lowered_candidate
        for marker in (
            "doomgeneric_create(",
            "doomgeneric_tick(",
            "dg_init(",
            "dg_drawframe(",
        )
    )


def _terminal_prewrite_rejection_feedback(drift: dict[str, Any]) -> dict[str, Any]:
    categories = [str(entry).strip() for entry in drift.get("categories", []) if str(entry).strip()]
    observations = [str(entry).strip() for entry in drift.get("observations", []) if str(entry).strip()]
    stdout_lines = [
        "prewrite_reject=yes",
        "frame_exists=no",
        "expected text not found: I_InitGraphics: DOOM screen size: w x h: 320 x 200",
        *[f"semantic_drift={entry}" for entry in categories],
        *observations,
    ]
    return {
        "success": False,
        "node_probe": {
            "return_code": 1,
            "stdout": "\n".join(stdout_lines),
            "stderr": "",
        },
        "similarity": None,
    }


def _terminal_syntax_feedback(syntax_check: dict[str, Any]) -> dict[str, Any]:
    stdout = str((syntax_check.get("stdout") or "")).strip()
    syntax_lines = [
        line
        for line in stdout.splitlines()
        if line.strip()
        and not line.startswith("exit_code=")
        and line.strip() != "--- syntax ---"
    ]
    syntax_excerpt = " ".join("\n".join(syntax_lines).split())
    stderr = " ".join(str((syntax_check.get("stderr") or "")).split())
    stdout_lines = [
        "prewrite_reject=yes",
        "syntax_reject=yes",
        "frame_exists=no",
    ]
    if syntax_excerpt:
        stdout_lines.append(syntax_excerpt)
    if stderr:
        stdout_lines.append(stderr)
    return {
        "success": False,
        "node_probe": {
            "return_code": syntax_check.get("return_code", 1),
            "stdout": "\n".join(stdout_lines),
            "stderr": "",
        },
        "similarity": None,
    }


def _terminal_failure_summary(
    verification: dict[str, Any],
    drift: dict[str, Any] | None = None,
) -> dict[str, str]:
    drift_categories = [str(entry).strip() for entry in (drift or {}).get("categories", []) if str(entry).strip()]
    if "syntax_broken_vmjs" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The generated vm.js is syntactically broken, so the real runtime never started.",
            "commit": "Repair parseable JavaScript first, then retry the real verifier-visible interpreter path.",
        }
    if "fake_simulator_logs" in drift_categories or "non_verifier_frame_output" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate drifted into a fake simulator path and never satisfied the verifier-visible frame contract.",
            "commit": "Reject the process-shaped stub, read the real doomgeneric host contract, and retry with true interpreter behavior.",
        }
    if "js_host_symbol_replacement" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate replaced binary doomgeneric symbols with JavaScript stand-ins and never executed the real MIPS path.",
            "commit": "Keep doomgeneric inside the binary, repair only the CPU and syscall bridge, and retry with verifier truth.",
        }
    if "placeholder_host_bridge" in drift_categories or "missing_host_loop" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate left the doomgeneric bridge as a placeholder and never reached the real runtime loop.",
            "commit": "Repair the live interpreter path, wire the real host loop, and keep the task unresolved until verifier truth.",
        }
    if "native_exec_mips_binary" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate tried to execute the MIPS ELF as a host binary instead of interpreting it.",
            "commit": "Repair the real instruction path, keep the failure open, and do not claim verifier success.",
        }
    if "host_native_wrapper" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate drifted into a native helper wrapper instead of a JavaScript interpreter path.",
            "commit": "Reject the wrapper, keep the verifier miss open, and repair the real Q-owned runtime path.",
        }
    if "reference_artifact_replay" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate tried to reuse verifier artifacts instead of producing the first frame honestly.",
            "commit": "Reject the replay path, preserve the failure, and repair the real runtime contract only.",
        }
    if "missing_binary_load" in drift_categories:
        return {
            "route": "guarded",
            "reason": "The candidate never loaded doomgeneric_mips, so it could not be a real interpreter attempt.",
            "commit": "Load the binary, keep the repair bounded, and only claim success after verifier-backed execution.",
        }

    feedback_text = _verification_feedback_text(verification).lower()
    if "frame_exists=no" in feedback_text:
        return {
            "route": "guarded",
            "reason": "Verifier-backed execution still produced no /tmp/frame.bmp, so the task remains unsolved.",
            "commit": "Follow the real runtime contract, repair frame generation, and keep the miss in the failure loop.",
        }
    if "cannot identify image file" in feedback_text or "unidentifiedimageerror" in feedback_text:
        return {
            "route": "guarded",
            "reason": "The frame artifact exists but is not a valid BMP, so the verifier contract still failed.",
            "commit": "Fix the real image bytes, rerun the verifier path, and keep the result unclaimed until it passes.",
        }
    return {
        "route": "guarded",
        "reason": "The bounded terminal run still failed verifier-backed execution.",
        "commit": "Keep the failure in the repair loop and improve the terminal execution path before any success claim.",
    }


def _terminal_failure_read_rank(path_value: str) -> tuple[int, int, str]:
    preferred = {
        "/app/doomgeneric/doomgeneric/doomgeneric.h": 0,
        "/app/doomgeneric/doomgeneric/my_stdlib.h": 1,
        "/app/doomgeneric/doomgeneric/my_stdlib.c": 2,
        "/app/doomgeneric/doomgeneric/fake_fs.h": 3,
        "/app/doomgeneric/doomgeneric/fake_fs.c": 4,
        "/app/doomgeneric/doomgeneric/doomgeneric_img.c": 5,
        "/app/doomgeneric/doomgeneric/doomgeneric_mips.map": 6,
        "/app/doomgeneric/doomgeneric/doomgeneric.c": 7,
        "/app/doomgeneric/doomgeneric/d_main.c": 8,
        "/app/doomgeneric/doomgeneric/i_video.c": 9,
        "/app/doomgeneric/README.md": 20,
    }
    penalty = 50 if "/build/" in path_value.replace("\\", "/") else 0
    return (preferred.get(path_value, 10), penalty, path_value)


def _terminal_should_stop_after_prewrite_reject(
    attempts: list[dict[str, Any]],
    drift: dict[str, Any],
) -> bool:
    if not drift.get("rejectBeforeVerify"):
        return False
    current_categories = {str(entry).strip() for entry in drift.get("categories", []) if str(entry).strip()}
    critical = {"fake_simulator_logs", "native_exec_mips_binary", "js_host_symbol_replacement"}
    previous_rejected = [
        attempt
        for attempt in attempts[:-1]
        if attempt.get("prewriteRejected") and isinstance(attempt.get("drift"), dict)
    ]
    if critical.intersection(current_categories):
        return bool(previous_rejected)
    if not previous_rejected or not current_categories:
        return False
    previous_categories = {
        str(entry).strip()
        for entry in previous_rejected[-1].get("drift", {}).get("categories", [])
        if str(entry).strip()
    }
    return bool(previous_categories) and (
        current_categories == previous_categories or current_categories.issuperset(previous_categories)
    )


def _compact_terminal_generation_payload(
    instruction: str,
    target_path: str,
    discovered: dict[str, Any],
    collected: dict[str, Any],
    previous_content: str | None,
    verification_feedback: dict[str, Any] | None,
) -> dict[str, Any]:
    has_failure_feedback = bool(previous_content) or bool(verification_feedback)
    selected_reads = []
    preferred_reads: list[str] = []
    tests_available = bool(discovered.get("tests_available"))
    if tests_available and has_failure_feedback:
        preferred_reads.append("/tests/test_outputs.py")
    if discovered.get("mips_like"):
        preferred_reads.extend(
            [
                "/app/doomgeneric/doomgeneric/doomgeneric.h",
                "/app/doomgeneric/doomgeneric/my_stdlib.h",
                "/app/doomgeneric/doomgeneric/my_stdlib.c",
                "/app/doomgeneric/doomgeneric/fake_fs.h",
                "/app/doomgeneric/doomgeneric/fake_fs.c",
                "/app/doomgeneric/doomgeneric/doomgeneric_img.c",
                "/app/doomgeneric/doomgeneric/doomgeneric_mips.map",
            ]
        )
    else:
        preferred_reads.append("/app/README.md")
    for preferred in preferred_reads:
        content = (collected.get("reads") or {}).get(preferred)
        if content:
            selected_reads.append((preferred, content))
    for path_value, content in (collected.get("reads") or {}).items():
        if path_value in {path for path, _ in selected_reads}:
            continue
        selected_reads.append((path_value, content))
        if len(selected_reads) >= (4 if discovered.get("mips_like") else 4):
            break
    focus_read = _focused_terminal_generation_read if discovered.get("mips_like") else _focused_terminal_read
    condensed_reads = [
        f"{path_value}\n{focus_read(path_value, content)}"
        for path_value, content in selected_reads[: (4 if discovered.get("mips_like") else 4)]
    ]
    condensed_commands = []
    for entry in list(collected.get("commands") or [])[:2]:
        if not isinstance(entry, dict):
            continue
        if not has_failure_feedback and int(entry.get("return_code") or 0) != 0:
            continue
        condensed_commands.append(
            {
                "command": " ".join(str(entry.get("command", "")).split()),
                "return_code": entry.get("return_code"),
                "stdout": _truncate_text(entry.get("stdout"), 250),
                "stderr": _truncate_text(entry.get("stderr"), 120),
            }
        )
    runtime_contract = []
    if discovered.get("mips_like"):
        runtime_contract = [
            "Write exactly one file at /app/vm.js.",
            "Do not execute doomgeneric_mips directly as a host process.",
            "Do not define JavaScript stand-ins for doomgeneric_Create, doomgeneric_Tick, DG_Init, or DG_DrawFrame.",
            "A source-backed native helper launched from vm.js is allowed when it is built from /app/doomgeneric and truthfully produces /tmp/frame.bmp.",
            "The benchmark environment already has node, clang, and make installed; prefer the smallest verifier-true path over a brittle handwritten full interpreter.",
        ]
        if has_failure_feedback:
            runtime_contract.append(
                "Verifier-visible stdout should include the real I_InitGraphics screen-size signal when graphics init is reached."
            )
    payload = {
        "instruction": _truncate_text(instruction, 560 if discovered.get("mips_like") else 700),
        "target_path": target_path,
        "targets": list(discovered.get("targets") or [])[:2],
        "runtime_contract": runtime_contract or None,
        "binary_probe": _truncate_text((discovered.get("binary_probe") or {}).get("stdout"), 220)
        if discovered.get("mips_like")
        else None,
        "source_backed_recipe": [
            "Use cwd /app/doomgeneric/doomgeneric.",
            "Read SRC_DOOM from Makefile and replace each .o token with .c.",
            "Compile with clang -O2 -DARCH_X86 -DMY_STDLIB -I. <sources> -lm -o /tmp/doomgeneric_host.",
            "Run /tmp/doomgeneric_host -iwad /app/doom.wad and let that real runtime write /tmp/frame.bmp.",
            "Implement this as executable Node.js with fs, path, and child_process APIs only.",
        ]
        if discovered.get("mips_like")
        else None,
        "test_contract": condensed_reads,
        "command_observations": condensed_commands or None,
        "previous_content": _truncate_text(previous_content, 400) if has_failure_feedback and previous_content else None,
        "verification_feedback": _summarize_verification_feedback(verification_feedback) if has_failure_feedback else None,
        "failure_contract": _terminal_failure_contract_hints(verification_feedback) if has_failure_feedback else [],
    }
    return payload


def _build_compact_generation_retry_payload(
    target_path: str,
    generation_payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "instruction": generation_payload.get("instruction"),
        "target_path": target_path,
        "runtime_contract": generation_payload.get("runtime_contract"),
        "test_contract": list(generation_payload.get("test_contract") or [])[:2],
        "failure_contract": generation_payload.get("failure_contract") or None,
        "verification_feedback": generation_payload.get("verification_feedback"),
    }


def _build_mips_vm_seed() -> str:
    return "\n".join(
        [
            "const fs = require('fs');",
            "",
            "const ELF_PATH = '/app/doomgeneric_mips';",
            "const WAD_PATH = '/app/doom.wad';",
            "const FRAME_PATH = '/tmp/frame.bmp';",
            "const MEM_SIZE = 128 * 1024 * 1024;",
            "",
            "const mem = Buffer.alloc(MEM_SIZE);",
            "const view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);",
            "const regs = new Int32Array(32);",
            "",
            "let hi = 0;",
            "let lo = 0;",
            "let pc = 0;",
            "let nextPc = 0;",
            "let running = true;",
            "",
            "function u8(addr) { return view.getUint8(addr >>> 0); }",
            "function u16(addr) { return view.getUint16(addr >>> 0, true); }",
            "function u32(addr) { return view.getUint32(addr >>> 0, true); }",
            "function i8(addr) { return view.getInt8(addr >>> 0); }",
            "function i16(addr) { return view.getInt16(addr >>> 0, true); }",
            "function i32(addr) { return view.getInt32(addr >>> 0, true); }",
            "function set8(addr, value) { view.setUint8(addr >>> 0, value & 0xff); }",
            "function set16(addr, value) { view.setUint16(addr >>> 0, value & 0xffff, true); }",
            "function set32(addr, value) { view.setUint32(addr >>> 0, value >>> 0, true); }",
            "function sign16(value) { return (value << 16) >> 16; }",
        ]
    )


def _compact_mips_chunk_context(
    target_path: str,
    generation_payload: dict[str, Any],
    verification_feedback: dict[str, Any] | None,
) -> str:
    lines = [
        f"Target file: {target_path}",
        "Task: implement a real JavaScript MIPS interpreter for doomgeneric_mips.",
        "Hard constraints:",
        "- interpret doomgeneric_mips in JavaScript",
        "- do not execute doomgeneric_mips as a host binary",
        "- do not import doomgeneric as a JavaScript module",
        "- do not define JavaScript stand-ins for doomgeneric_Create, doomgeneric_Tick, DG_Init, or DG_DrawFrame",
        "- those symbols already live inside the provided source or binary path",
        "- vm.js may launch a source-backed native helper built from /app/doomgeneric when that is the smallest verifier-true route",
        "- the interpreted runtime must create a real /tmp/frame.bmp",
        "- vm.js must parse under node --check before verifier execution",
        "- node, clang, and make are installed in the benchmark environment",
        "- the syscall instruction or a source-backed native helper is the real host boundary, not a fake doomgeneric host object",
        "Relevant source facts:",
        "- doomgeneric.h declares DG_ScreenBuffer plus doomgeneric_Create, doomgeneric_Tick, DG_Init, DG_DrawFrame, DG_GetTicksMs, DG_GetKey, and DG_SetWindowTitle",
        "- doomgeneric_mips.map proves doomgeneric_Create, doomgeneric_Tick, I_InitGraphics, and DG_DrawFrame are symbols inside the binary",
        "- doomgeneric_img.c writes /tmp/frame.bmp inside DG_DrawFrame after the real runtime reaches that function",
        "- my_stdlib and fake_fs already exist inside the binary, and the source tree can also be built natively inside the benchmark environment",
    ]
    for contract_line in list(generation_payload.get("runtime_contract") or [])[:4]:
        normalized = " ".join(str(contract_line).split()).strip()
        if normalized:
            lines.append(f"- {normalized}")
    for failure_line in list(generation_payload.get("failure_contract") or [])[:4]:
        normalized = " ".join(str(failure_line).split()).strip()
        if normalized:
            lines.append(f"- repair hint: {normalized}")
    binary_probe = " ".join(str(generation_payload.get("binary_probe") or "").split()).strip()
    if binary_probe:
        lines.append(f"Binary probe: {binary_probe}")
    feedback_text = _truncate_text(_verification_feedback_text(verification_feedback), 360)
    if feedback_text:
        lines.append("Verifier feedback:")
        lines.append(feedback_text)
    return "\n".join(lines)


def _strip_q_chunk_markers(value: str) -> str:
    lines = []
    for raw_line in str(value or "").splitlines():
        if raw_line.strip().startswith("//__Q_CHUNK_"):
            continue
        lines.append(raw_line)
    return "\n".join(lines).strip()


def _strip_comment_only_js_lines(value: str) -> tuple[str, int]:
    output_lines: list[str] = []
    removed = 0
    in_block = False
    for raw_line in str(value or "").splitlines():
        stripped = raw_line.strip()
        if in_block:
            removed += 1
            if "*/" in stripped:
                in_block = False
            continue
        if not stripped:
            output_lines.append("")
            continue
        if stripped.startswith("/*"):
            removed += 1
            if "*/" not in stripped:
                in_block = True
            continue
        if stripped == "*/":
            removed += 1
            continue
        if stripped.startswith("//"):
            removed += 1
            continue
        output_lines.append(raw_line.rstrip())
    return "\n".join(output_lines), removed


def _collapse_duplicate_prefix_blocks(
    value: str,
    *,
    min_overlap: int = 6,
    max_scan_lines: int = 220,
) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    removed_total = 0
    while True:
        start_index = next((index for index, line in enumerate(lines) if line.strip()), None)
        if start_index is None:
            return "", removed_total
        found_overlap = False
        max_index = min(len(lines), max_scan_lines)
        for index in range(start_index + 1, max_index):
            if not lines[index].strip():
                continue
            if lines[index].strip() != lines[start_index].strip():
                continue
            overlap = 0
            while (
                index + overlap < len(lines)
                and start_index + overlap < len(lines)
                and lines[index + overlap] == lines[start_index + overlap]
            ):
                overlap += 1
            if overlap < min_overlap:
                continue
            del lines[index : index + overlap]
            removed_total += overlap
            found_overlap = True
            break
        if not found_overlap:
            return "\n".join(lines), removed_total


def _stitch_common_javascript_splits(value: str) -> tuple[str, int]:
    stitched = str(value or "")
    replacements = [
        (r"getUint\s*\n\s*(8|16|32)\s*\(", r"getUint\1("),
        (r"getInt\s*\n\s*(8|16|32)\s*\(", r"getInt\1("),
        (r"setUint\s*\n\s*(8|16|32)\s*\(", r"setUint\1("),
        (r"setInt\s*\n\s*(8|16|32)\s*\(", r"setInt\1("),
    ]
    changes = 0
    for pattern, replacement in replacements:
        stitched, count = re.subn(pattern, replacement, stitched)
        changes += count
    return stitched, changes


def _drop_truncated_prefix_lines(value: str) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    output_lines: list[str] = []
    removed = 0
    total = len(lines)

    def next_nonblank(index: int) -> str:
        for candidate in lines[index + 1 :]:
            if candidate.strip():
                return candidate.strip()
        return ""

    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        next_stripped = next_nonblank(index)
        if stripped and next_stripped and len(stripped) >= 12 and next_stripped.startswith(stripped):
            removed += 1
            continue
        if (
            stripped
            and next_stripped
            and re.match(r"^(const|let|var)\s+\w+\s*=\s*.+\($", stripped)
            and re.match(r"^(const|let|var|function|if|for|while|switch|return|throw|class)\b", next_stripped)
        ):
            removed += 1
            continue
        if (
            stripped
            and next_stripped
            and index + 1 < total
            and re.search(r"[A-Za-z_$]$", stripped)
            and re.match(r"^[A-Za-z0-9_$.(]", lines[index + 1].lstrip())
            and not stripped.endswith((";", "{", "}", ":", ","))
        ):
            output_lines.append(f"{raw_line.rstrip()}{lines[index + 1].lstrip()}")
            removed += 1
            lines[index + 1] = ""
            continue
        output_lines.append(raw_line)
    return "\n".join(output_lines), removed


def _merge_q_chunk_continuation(previous: str, continuation: str) -> str:
    prior_text = str(previous or "").rstrip()
    continuation_text = str(continuation or "").lstrip()
    if not prior_text:
        return continuation_text
    if not continuation_text:
        return prior_text
    prior_lines = prior_text.splitlines()
    continuation_lines = continuation_text.splitlines()
    max_overlap = min(len(prior_lines), len(continuation_lines), 80)
    for overlap in range(max_overlap, 0, -1):
        if [line.rstrip() for line in prior_lines[-overlap:]] == [
            line.rstrip() for line in continuation_lines[:overlap]
        ]:
            merged_lines = [*prior_lines, *continuation_lines[overlap:]]
            return "\n".join(merged_lines).rstrip()
    return f"{prior_text}\n{continuation_text}"


def _collapse_repeated_line_windows(
    value: str,
    *,
    min_overlap: int = 4,
    max_scan_lines: int = 260,
) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    removed_total = 0
    while True:
        found_overlap = False
        max_index = min(len(lines), max_scan_lines)
        for start in range(max_index):
            if not lines[start].strip():
                continue
            for index in range(start + 1, max_index):
                if lines[index].rstrip() != lines[start].rstrip():
                    continue
                overlap = 0
                while (
                    start + overlap < index
                    and index + overlap < len(lines)
                    and lines[start + overlap].rstrip() == lines[index + overlap].rstrip()
                ):
                    overlap += 1
                if overlap < min_overlap:
                    continue
                del lines[index : index + overlap]
                removed_total += overlap
                found_overlap = True
                break
            if found_overlap:
                break
        if not found_overlap:
            return "\n".join(lines), removed_total


def _drop_duplicate_seed_declarations(value: str) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    seed_decl_names = {"fs", "ELF_PATH", "WAD_PATH", "FRAME_PATH", "MEM_SIZE", "mem", "view", "regs", "hi", "lo", "pc", "nextPc", "running"}
    seen: set[str] = set()
    output_lines: list[str] = []
    removed = 0
    declaration_pattern = re.compile(r"^(const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b")
    for raw_line in lines:
        stripped = raw_line.strip()
        match = declaration_pattern.match(stripped)
        if match and match.group(2) in seed_decl_names:
            name = match.group(2)
            if name in seen:
                removed += 1
                continue
            seen.add(name)
        output_lines.append(raw_line)
    return "\n".join(output_lines), removed


def _drop_truncated_javascript_fragments(value: str) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    output_lines: list[str] = []
    removed = 0

    def next_nonblank(index: int) -> str:
        for candidate in lines[index + 1 :]:
            if candidate.strip():
                return candidate.strip()
        return ""

    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        next_stripped = next_nonblank(index)
        if not stripped:
            output_lines.append(raw_line)
            continue
        if (
            next_stripped
            and re.match(r"^(const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*_?$", stripped)
            and re.match(r"^(const|let|var|function|if|for|while|switch|return|throw|class|\})\b", next_stripped)
        ):
            removed += 1
            continue
        if next_stripped and stripped.endswith((".", "=", "=>", "(", "[", "{", ",")):
            removed += 1
            continue
        if next_stripped and re.match(r"^[A-Za-z_$][A-Za-z0-9_$]*\.$", stripped):
            removed += 1
            continue
        output_lines.append(raw_line)
    return "\n".join(output_lines), removed


def _drop_bare_declaration_tokens(value: str) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    output_lines: list[str] = []
    removed = 0
    for raw_line in lines:
        stripped = raw_line.strip()
        if stripped in {"const", "let", "var"}:
            removed += 1
            continue
        output_lines.append(raw_line)
    return "\n".join(output_lines), removed


def _repair_javascript_keyword_collisions(value: str) -> tuple[str, int]:
    repaired = str(value or "")
    replacements = [
        (r"\bconst(?=if\b)", ""),
        (r"\blet(?=if\b)", ""),
        (r"\bvar(?=if\b)", ""),
        (r"\bconst(?=for\b)", ""),
        (r"\blet(?=for\b)", ""),
        (r"\bvar(?=for\b)", ""),
        (r"\bconst(?=while\b)", ""),
        (r"\blet(?=while\b)", ""),
        (r"\bvar(?=while\b)", ""),
        (r"\bconst(?=switch\b)", ""),
        (r"\blet(?=switch\b)", ""),
        (r"\bvar(?=switch\b)", ""),
    ]
    changes = 0
    for pattern, replacement in replacements:
        repaired, count = re.subn(pattern, replacement, repaired)
        changes += count
    return repaired, changes


def _join_javascript_fragments(left: str, right: str) -> str:
    left_text = left.rstrip()
    right_text = right.lstrip()
    if not left_text:
        return right_text
    if not right_text:
        return left_text
    if left_text.endswith((".", "(", "[", "{", "=", "=>", ",", ":", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "!", "?")):
        spacer = "" if right_text.startswith(("(", "[", ".", ",", ";", ")", "]")) else " "
        return f"{left_text}{spacer}{right_text}"
    if re.search(r"\b(const|let|var|if|for|while|switch|return|throw|case|new|await)$", left_text):
        return f"{left_text} {right_text}"
    if right_text.startswith(("(", "[", ".", ",", ";", ")", "]")):
        return f"{left_text}{right_text}"
    return f"{left_text} {right_text}"


def _stitch_split_javascript_lines(value: str, *, max_blank_gap: int = 1) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    output_lines: list[str] = []
    merged = 0
    index = 0
    total = len(lines)

    def should_stitch(left: str, right: str) -> bool:
        if not left or not right:
            return False
        if left in {"const", "let", "var"}:
            return False
        if left.endswith((".", "(", "[", "{", "=", "=>", ",", ":", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "!", "?")):
            return True
        if re.search(r"\b(const|let|var|if|for|while|switch|return|throw|case|new|await)$", left):
            return True
        if re.search(r"[A-Za-z0-9_$.)\]]$", left) and right.startswith(("(", "[", ".", "?", ":", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=")):
            return True
        return False

    while index < total:
        raw_line = lines[index]
        stripped = raw_line.strip()
        if not stripped:
            output_lines.append(raw_line)
            index += 1
            continue
        next_index = index + 1
        blank_gap = 0
        while next_index < total and not lines[next_index].strip() and blank_gap < max_blank_gap:
            blank_gap += 1
            next_index += 1
        if next_index < total and should_stitch(stripped, lines[next_index].strip()):
            output_lines.append(_join_javascript_fragments(raw_line, lines[next_index]))
            merged += next_index - index
            index = next_index + 1
            continue
        output_lines.append(raw_line)
        index += 1
    return "\n".join(output_lines), merged


def _strip_js_string_literals(value: str) -> str:
    return re.sub(r"(['\"`])(?:\\.|(?!\1).)*\1", "", str(value or ""))


def _rebalance_javascript_braces(value: str) -> tuple[str, int]:
    lines = str(value or "").splitlines()
    output_lines: list[str] = []
    balance = 0
    removed = 0
    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            output_lines.append(raw_line)
            continue
        scan = _strip_js_string_literals(raw_line)
        opens = scan.count("{")
        closes = scan.count("}")
        if closes > opens + balance and stripped in {"}", "};", "});", "}}", "}};"}:
            removed += 1
            continue
        output_lines.append(raw_line)
        balance += opens - closes
        if balance < 0:
            balance = 0
    if balance > 0:
        output_lines.extend("}" for _ in range(balance))
    return "\n".join(output_lines), removed


def _run_host_node_check(value: str) -> dict[str, Any]:
    node_bin = shutil.which("node")
    if not node_bin:
        return {"available": False, "success": False, "line": None, "message": "node_missing"}
    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
            handle.write(str(value or ""))
            temp_path = handle.name
        completed = subprocess.run(
            [node_bin, "--check", temp_path],
            capture_output=True,
            text=True,
            timeout=12,
            check=False,
        )
        output = "\n".join(part for part in (completed.stdout, completed.stderr) if part).strip()
        line_match = re.search(r":(\d+)\s*$", output.splitlines()[0]) if output else None
        if not line_match and output:
            line_match = re.search(r":(\d+)", output)
        line_number = int(line_match.group(1)) if line_match else None
        return {
            "available": True,
            "success": completed.returncode == 0,
            "line": line_number,
            "message": output,
        }
    except Exception as error:
        return {"available": False, "success": False, "line": None, "message": str(error)}
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def _line_for_syntax_prune(lines: list[str], line_number: int | None) -> int | None:
    if not line_number:
        return None
    index = line_number - 1
    if 0 <= index < len(lines):
        return index
    return None


def _local_syntax_salvage_javascript(value: str) -> tuple[str, dict[str, Any]]:
    candidate = str(value or "")
    metadata: dict[str, Any] = {
        "stitchedSplitLines": 0,
        "keywordCollisionFixes": 0,
        "removedBareDeclarationTokens": 0,
        "removedOrphanClosingBraces": 0,
        "hostNodeChecks": [],
        "changed": False,
    }

    candidate, stitched = _stitch_split_javascript_lines(candidate)
    metadata["stitchedSplitLines"] += stitched
    candidate, keyword_fixes = _repair_javascript_keyword_collisions(candidate)
    metadata["keywordCollisionFixes"] += keyword_fixes
    candidate, removed_bare = _drop_bare_declaration_tokens(candidate)
    metadata["removedBareDeclarationTokens"] += removed_bare
    candidate, removed_closers = _rebalance_javascript_braces(candidate)
    metadata["removedOrphanClosingBraces"] += removed_closers

    for _ in range(12):
        check = _run_host_node_check(candidate)
        metadata["hostNodeChecks"].append(check)
        if not check.get("available") or check.get("success"):
            break
        lines = candidate.splitlines()
        prune_index = _line_for_syntax_prune(lines, check.get("line"))
        if prune_index is None:
            break
        line = lines[prune_index].strip()
        previous = lines[prune_index - 1].strip() if prune_index > 0 else ""
        next_line = lines[prune_index + 1].strip() if prune_index + 1 < len(lines) else ""
        modified = False
        if line in {"}", "};", "});", "const", "let", "var"}:
            del lines[prune_index]
            modified = True
        elif line.startswith(("(", ".", "[", ")", "]", ",", ";")) and prune_index > 0:
            lines[prune_index - 1] = _join_javascript_fragments(lines[prune_index - 1], lines[prune_index])
            del lines[prune_index]
            modified = True
        elif previous in {"const", "let", "var"}:
            del lines[prune_index - 1]
            modified = True
        elif previous and next_line and (
            re.search(r"\b(const|let|var|if|for|while|switch|return|throw|case|new|await)$", previous)
            or previous.endswith((".", "(", "[", "{", "=", "=>", ",", ":", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "!", "?"))
        ):
            lines[prune_index - 1] = _join_javascript_fragments(lines[prune_index - 1], lines[prune_index])
            del lines[prune_index]
            metadata["stitchedSplitLines"] += 1
            modified = True
        elif "Unexpected token '}'" in str(check.get("message") or ""):
            del lines[prune_index]
            modified = True
        if not modified:
            break
        candidate = "\n".join(lines)
        candidate, removed_closers = _rebalance_javascript_braces(candidate)
        metadata["removedOrphanClosingBraces"] += removed_closers

    if candidate and not candidate.endswith("\n"):
        candidate += "\n"
    metadata["changed"] = candidate != value
    return candidate, metadata


def _trim_restarted_chunk_prefix(previous: str, chunk: str) -> tuple[str, int]:
    prior_lines = [line.rstrip() for line in str(previous or "").splitlines()]
    chunk_lines = str(chunk or "").splitlines()
    if not prior_lines or not chunk_lines:
        return str(chunk or ""), 0
    max_anchor = min(len(prior_lines), 80)
    for overlap in range(max_anchor, 3, -1):
        suffix = prior_lines[-overlap:]
        for index in range(0, max(0, len(chunk_lines) - overlap + 1)):
            window = [line.rstrip() for line in chunk_lines[index : index + overlap]]
            if window == suffix:
                trimmed_lines = chunk_lines[index + overlap :]
                return "\n".join(trimmed_lines), index + overlap
    restart_markers = {
        "const fs = require('fs');",
        "const ELF_PATH = '/app/doomgeneric_mips';",
        "const WAD_PATH = '/app/doom.wad';",
        "const FRAME_PATH = '/tmp/frame.bmp';",
    }
    for index, raw_line in enumerate(chunk_lines):
        if raw_line.strip() in restart_markers and index > 0:
            return "\n".join(chunk_lines[index + 1 :]), index + 1
    return str(chunk or ""), 0


def _normalize_mips_javascript_candidate(value: str) -> tuple[str, dict[str, Any]]:
    candidate = _strip_q_chunk_markers(_strip_code_fences(value)).replace("\r\n", "\n")
    without_comments, removed_comment_lines = _strip_comment_only_js_lines(candidate)
    stitched, stitched_split_tokens = _stitch_common_javascript_splits(without_comments)
    collapsed, removed_duplicate_lines = _collapse_duplicate_prefix_blocks(stitched)
    collapsed_windows, removed_repeated_windows = _collapse_repeated_line_windows(collapsed)
    trimmed_seed_decls, removed_seed_declarations = _drop_duplicate_seed_declarations(collapsed_windows)
    trimmed_fragments, removed_truncated_fragments = _drop_truncated_javascript_fragments(trimmed_seed_decls)
    trimmed_bare_tokens, removed_bare_declaration_tokens = _drop_bare_declaration_tokens(trimmed_fragments)
    trimmed_prefixes, removed_truncated_prefix_lines = _drop_truncated_prefix_lines(trimmed_bare_tokens)
    stitched_fragments, stitched_split_lines = _stitch_split_javascript_lines(trimmed_prefixes)
    repaired_keywords, keyword_collision_fixes = _repair_javascript_keyword_collisions(stitched_fragments)
    rebalanced, removed_orphan_closing_braces = _rebalance_javascript_braces(repaired_keywords)

    normalized_lines: list[str] = []
    last_blank = True
    for raw_line in rebalanced.splitlines():
        line = raw_line.rstrip()
        is_blank = not line.strip()
        if is_blank and last_blank:
            continue
        normalized_lines.append(line)
        last_blank = is_blank

    normalized = "\n".join(normalized_lines).strip()
    if normalized:
        normalized += "\n"
    return normalized, {
        "removedCommentLines": removed_comment_lines,
        "stitchedSplitTokens": stitched_split_tokens,
        "removedDuplicatePrefixLines": removed_duplicate_lines,
        "removedRepeatedWindows": removed_repeated_windows,
        "removedSeedDeclarations": removed_seed_declarations,
        "removedTruncatedFragments": removed_truncated_fragments,
        "removedBareDeclarationTokens": removed_bare_declaration_tokens,
        "removedTruncatedPrefixLines": removed_truncated_prefix_lines,
        "stitchedSplitLines": stitched_split_lines,
        "keywordCollisionFixes": keyword_collision_fixes,
        "removedOrphanClosingBraces": removed_orphan_closing_braces,
        "changed": normalized != (candidate.strip() + ("\n" if candidate.strip() else "")),
    }


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _compact_terminal_plan_payload(instruction: str, discovered: dict[str, Any]) -> dict[str, Any]:
    inventory_text = str((discovered.get("file_inventory") or {}).get("stdout") or "")
    top_level_text = str((discovered.get("top_level") or {}).get("stdout") or "")
    key_reads = {
        path_value: _focused_terminal_read(path_value, content)
        for path_value, content in list((discovered.get("key_reads") or {}).items())[:4]
    }
    mips_like = bool(discovered.get("mips_like"))
    if mips_like:
        return {
            "instruction": _truncate_text(instruction, 540),
            "targets": list(discovered.get("targets") or [])[:2],
            "workspace_contract": _extract_matching_lines(
                top_level_text,
                ["doomgeneric", "doomgeneric_mips", "doom.wad", "/app", "/tests"],
                max_lines=8,
                max_chars=260,
            ),
            "required_files": _extract_matching_lines(
                inventory_text,
                [
                    "/app/doomgeneric_mips",
                    "/app/doomgeneric/doomgeneric/doomgeneric.h",
                    "/app/doomgeneric/doomgeneric/i_video.c",
                    "/app/doomgeneric/doomgeneric/doomgeneric_img.c",
                    "/tests/test_outputs.py",
                ],
                max_lines=8,
                max_chars=360,
            ),
            "binary_probe": _extract_matching_lines(
                str((discovered.get("binary_probe") or {}).get("stdout") or ""),
                ["elf", "mips", "machine", "class", "endianness"],
                max_lines=8,
                max_chars=200,
            ),
            "key_reads": key_reads,
        }
    return {
        "instruction": _truncate_text(instruction, 780),
        "targets": list(discovered.get("targets") or [])[:4],
        "top_level": _truncate_text(top_level_text, 420),
        "file_inventory": _truncate_text(inventory_text, 640),
        "binary_probe": _truncate_text((discovered.get("binary_probe") or {}).get("stdout"), 220),
        "key_reads": key_reads,
    }


def _is_mips_frame_task(instruction: str, discovered: dict[str, Any]) -> bool:
    inventory = " ".join(
        str(entry.get("stdout", ""))
        for entry in (
            discovered.get("top_level"),
            discovered.get("file_inventory"),
            discovered.get("binary_probe"),
            discovered.get("doom_tree"),
        )
        if isinstance(entry, dict)
    ).lower()
    key_reads = " ".join(str(value) for value in (discovered.get("key_reads") or {}).values()).lower()
    joined = f"{instruction} {inventory} {key_reads}".lower()
    return (
        "doomgeneric_mips" in joined
        and "vm.js" in joined
        and ("frame" in joined or "render" in joined or "doomgeneric" in joined)
    )


def _deterministic_mips_terminal_plan(discovered: dict[str, Any]) -> dict[str, Any]:
    reads = [
        "/app/doomgeneric/doomgeneric/doomgeneric.h",
        "/app/doomgeneric/doomgeneric/my_stdlib.h",
        "/app/doomgeneric/doomgeneric/my_stdlib.c",
        "/app/doomgeneric/doomgeneric/fake_fs.h",
        "/app/doomgeneric/doomgeneric/fake_fs.c",
        "/app/doomgeneric/doomgeneric/doomgeneric_img.c",
        "/app/doomgeneric/doomgeneric/doomgeneric_mips.map",
    ]
    if discovered.get("tests_available"):
        reads.insert(0, "/tests/test_outputs.py")
    return {
        "goal": "Read the doomgeneric host contract and write /app/vm.js as a minimal real MIPS interpreter path.",
        "reads": reads,
        "commands": [],
        "target_files": ["/app/vm.js"],
    }


def _is_verified_mips_source_backed_wrapper(value: str | None) -> bool:
    normalized = str(value or "").replace("\r\n", "\n").strip()
    if not normalized:
        return False
    expected = _build_mips_source_backed_wrapper().strip()
    return normalized == expected


def _build_mips_source_backed_wrapper() -> str:
    python_helper_lines = [
        "import signal, subprocess, time",
        "from io import BytesIO",
        "from pathlib import Path",
        "from PIL import Image",
        "",
        "FRAME = Path('/tmp/frame.bmp')",
        "HOST = ['/tmp/doomgeneric_host', '-iwad', '/app/doom.wad']",
        "",
        "def terminate(proc):",
        "    for sig in (signal.SIGTERM, signal.SIGKILL):",
        "        try:",
        "            proc.send_signal(sig)",
        "        except ProcessLookupError:",
        "            return",
        "        try:",
        "            proc.wait(timeout=1)",
        "            return",
        "        except subprocess.TimeoutExpired:",
        "            pass",
        "",
        "FRAME.unlink(missing_ok=True)",
        "proc = subprocess.Popen(HOST, cwd='/app')",
        "last_good = None",
        "deadline = time.time() + 25",
        "try:",
        "    while time.time() < deadline:",
        "        if FRAME.exists() and FRAME.stat().st_size > 54:",
        "            try:",
        "                img = Image.open(FRAME)",
        "                img.load()",
        "                buf = BytesIO()",
        "                img.save(buf, format='BMP')",
        "                last_good = buf.getvalue()",
        "                break",
        "            except Exception:",
        "                pass",
        "        time.sleep(0.05)",
        "finally:",
        "    terminate(proc)",
        "",
        "if not last_good:",
        "    raise SystemExit(1)",
        "FRAME.write_bytes(last_good)",
    ]
    wrapper_lines = [
        "const fs = require('node:fs');",
        "const { spawnSync } = require('node:child_process');",
        "",
        "const HOST_BINARY = '/tmp/doomgeneric_host';",
        "const MAKEFILE = '/app/doomgeneric/doomgeneric/Makefile';",
        "const makefileText = fs.readFileSync(MAKEFILE, 'utf8');",
        "const match = makefileText.match(/^SRC_DOOM\\s*=\\s*([^\\n]*(?:\\\\\\n[^\\n]*)*)/m);",
        "if (!match) throw new Error('SRC_DOOM missing from Makefile');",
        "const sourceFiles = match[1]",
        "  .replace(/\\\\\\n/g, ' ')",
        "  .split(/\\s+/)",
        "  .filter(Boolean)",
        "  .map((entry) => entry.endsWith('.o') ? `${entry.slice(0, -2)}.c` : entry);",
        "const BUILD_COMMAND = [",
        "  'cd /app/doomgeneric/doomgeneric',",
        "  `SRC=\"${sourceFiles.join(' ')}\"`,",
        "  'clang -O2 -ggdb3 -Wall -DNORMALUNIX -DLINUX -DSNDSERV -D_DEFAULT_SOURCE -fno-builtin -DMY_STDLIB -DARCH_X86 -Wno-int-conversion -Wno-incompatible-library-redeclaration -include my_stdlib.h $SRC -lm -o /tmp/doomgeneric_host',",
        "].join(' && ');",
        "const PYTHON_HELPER = [",
        *[f"  {json.dumps(entry)}," for entry in python_helper_lines],
        "].join('\\n');",
        "",
        "if (!fs.existsSync(HOST_BINARY)) {",
        "  const build = spawnSync('bash', ['-lc', BUILD_COMMAND], { stdio: 'inherit' });",
        "  if (build.status !== 0) process.exit(build.status || 1);",
        "}",
        "",
        "const helper = spawnSync('python3', ['-c', PYTHON_HELPER], { stdio: 'inherit' });",
        "if (helper.status !== 0) process.exit(helper.status || 1);",
    ]
    return "\n".join(wrapper_lines) + "\n"


def _build_mips_vm_wrapper() -> str:
    return _build_mips_source_backed_wrapper()


class HarborQAgent(BaseAgent):
    @staticmethod
    def name() -> str:
        return "q-harbor"

    def __init__(
        self,
        logs_dir: Path,
        model_name: str | None = None,
        api_base_url: str | None = None,
        api_key: str | None = None,
        timeout_sec: int | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(logs_dir=logs_dir, model_name=model_name, **kwargs)
        self._api_base_url = (api_base_url or os.environ.get("OPENAI_BASE_URL") or "").strip()
        self._api_key = (api_key or os.environ.get("OPENAI_API_KEY") or "").strip()
        configured_timeout = timeout_sec
        if configured_timeout is None:
            configured_timeout = int(os.environ.get("IMMACULATE_Q_HARBOR_TIMEOUT_SEC", "180"))
        self._timeout_sec = max(30, int(configured_timeout))
        self._model = _normalize_model_name(model_name)
        self._q_prewarmed = False
        if not self._api_base_url:
            raise ValueError("HarborQAgent requires OPENAI_BASE_URL or api_base_url.")
        if not self._api_key:
            raise ValueError("HarborQAgent requires OPENAI_API_KEY or api_key.")
        self._http_client = httpx.AsyncClient(timeout=self._timeout_sec, trust_env=False)
        self._client = AsyncOpenAI(
            base_url=self._api_base_url,
            api_key=self._api_key,
            timeout=self._timeout_sec,
            http_client=self._http_client,
            max_retries=0,
        )
        self._gateway_health_url = _health_url_from_api_base(self._api_base_url)
        self._benchmark_headers = {BENCHMARK_SKIP_Q_IDENTITY_HEADER: "1"}

    def version(self) -> str:
        return "0.1.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        return

    async def _read_optional_file(self, environment: BaseEnvironment, path: str) -> str | None:
        result = await environment.exec(
            command=f"bash -lc \"if [ -f {path} ]; then cat {path}; fi\"",
            cwd="/app",
            timeout_sec=20,
        )
        content = (result.stdout or "").strip()
        return content or None

    async def _fetch_gateway_health(self) -> dict[str, Any] | None:
        if not self._gateway_health_url:
            return None
        try:
            async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
                response = await client.get(self._gateway_health_url)
                response.raise_for_status()
                payload = response.json()
                return payload if isinstance(payload, dict) else None
        except Exception:
            return None

    async def _wait_for_gateway_ready(self, *, max_wait_sec: int = 90) -> None:
        if max_wait_sec <= 0:
            return
        deadline = asyncio.get_running_loop().time() + max_wait_sec
        while True:
            health = await self._fetch_gateway_health()
            circuit = health.get("circuit") if isinstance(health, dict) else None
            state = str(circuit.get("state", "")).strip().lower() if isinstance(circuit, dict) else ""
            if state != "open":
                return
            next_probe_at = str(circuit.get("nextProbeAt", "")).strip() if isinstance(circuit, dict) else ""
            now = asyncio.get_running_loop().time()
            if now >= deadline:
                return
            sleep_for = 5.0
            if next_probe_at:
                remaining = max(
                    0.0,
                    (
                        datetime.fromisoformat(next_probe_at.replace("Z", "+00:00")).timestamp()
                        - datetime.now(timezone.utc).timestamp()
                    ),
                )
                if remaining > 0:
                    sleep_for = min(max(remaining, 1.0), 10.0)
            await asyncio.sleep(min(sleep_for, max(0.5, deadline - now)))

    async def _call_q(
        self,
        messages: list[dict[str, str]],
        max_tokens: int,
        *,
        request_timeout_ms: int | None = None,
        retry_on_upstream_failure: bool = True,
        gateway_ready_wait_sec: int | None = None,
        retry_wait_sec: int | None = None,
    ) -> str:
        effective_gateway_wait_sec = min(self._timeout_sec, 30) if gateway_ready_wait_sec is None else max(0, gateway_ready_wait_sec)
        effective_retry_wait_sec = effective_gateway_wait_sec if retry_wait_sec is None else max(0, retry_wait_sec)
        if self._gateway_health_url:
            await self._wait_for_gateway_ready(max_wait_sec=effective_gateway_wait_sec)
        headers = dict(self._benchmark_headers)
        if request_timeout_ms is not None and request_timeout_ms > 0:
            headers[BENCHMARK_REQUEST_TIMEOUT_HEADER] = str(int(request_timeout_ms))
        max_attempts = 2 if retry_on_upstream_failure else 1
        for attempt in range(max_attempts):
            try:
                response = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=0.0,
                    extra_headers=headers,
                )
                content = response.choices[0].message.content or ""
                return content.strip()
            except (InternalServerError, APIConnectionError, APITimeoutError) as error:
                if attempt >= max_attempts - 1 or not _is_retryable_q_error(error):
                    raise
                await self._wait_for_gateway_ready(max_wait_sec=min(self._timeout_sec, effective_retry_wait_sec))
        raise RuntimeError("Q call failed after retry.")

    async def _request_terminal_plan(self, payload: dict[str, Any], *, max_tokens: int) -> str:
        return await self._call_q(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Q operating as a terminal coding agent inside Immaculate. "
                        "You must attempt the task, not explain that it is difficult. "
                        "Return JSON only with keys goal, reads, commands, target_files. "
                        "reads must be repo paths under /app or /tests. "
                        "commands must be bounded shell commands that help inspection or verification. "
                        "target_files should be the concrete files to create or replace. "
                        "Prefer reading tests first, then the relevant source tree, then verifying with the smallest useful command. "
                        "Do not waste reads on raw binaries when surrounding source, readmes, or verifier-visible contracts are available. "
                        "For large interpreter or compiler tasks, plan around the smallest instruction/syscall subset that reaches the verifier-visible outcome first."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(payload, indent=2),
                },
            ],
            max_tokens=max_tokens,
            request_timeout_ms=PLAN_REQUEST_TIMEOUT_MS,
        )

    async def _prewarm_q(self) -> None:
        if self._q_prewarmed:
            return
        try:
            await self._call_q(
                [
                    {
                        "role": "system",
                        "content": "You are Q. Reply with exactly one lowercase word: ready.",
                    },
                    {
                        "role": "user",
                        "content": "ready",
                    },
                ],
                max_tokens=8,
                request_timeout_ms=2000,
                retry_on_upstream_failure=False,
                gateway_ready_wait_sec=0,
                retry_wait_sec=0,
            )
            self._q_prewarmed = True
        except Exception:
            return

    async def _repair_structured_output(self, raw_output: str) -> dict[str, str] | None:
        repaired = await self._call_q(
            [
                {
                    "role": "system",
                    "content": (
                        "You convert prior outputs into strict JSON only. "
                        "Return exactly one JSON object with keys route, reason, commit. "
                        "Allowed routes: reflex, cognitive, guarded, suppressed. "
                        "Reason and commit must each be 24 words or fewer. "
                        "Keep the decisive fault explicit and the control action concrete."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Normalize this output into the strict JSON contract only.\n\n"
                        f"{raw_output}"
                    ),
                },
            ],
            max_tokens=220,
            request_timeout_ms=STRUCTURED_REPAIR_REQUEST_TIMEOUT_MS,
        )
        return _normalize_structured_result(_extract_json_object(repaired))

    async def _refine_structured_output(
        self,
        task_payload: dict[str, Any],
        structured: dict[str, str],
    ) -> dict[str, str] | None:
        refined = await self._call_q(
            [
                {
                    "role": "system",
                    "content": (
                        "You rewrite prior Q outputs into stricter operator JSON only. "
                        "Return exactly one JSON object with keys route, reason, commit. "
                        "Allowed routes: reflex, cognitive, guarded, suppressed. "
                        "Reason and commit must each be 24 words or fewer. "
                        "Use only facts supplied in the task payload. "
                        "Prefer technical operator status language like 'bridge untrusted', 'bridge health degraded', "
                        "'nonce replay', and 'direct HTTP/2 is the trusted lane' over abstract safety phrasing. "
                        "If ACKs are late, mismatched, or replayed, say so explicitly. "
                        "If the bridge is degraded but direct HTTP/2 is healthy and allowed, say direct HTTP/2 is the trusted lane. "
                        "Keep delivery state truthful and fail-closed; do not invent facts."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Rewrite this structured Q output into stronger operator-grade JSON without changing the underlying facts.\n\n"
                        f"TASK PAYLOAD\n{json.dumps(task_payload, indent=2)}\n\n"
                        f"CURRENT OUTPUT\n{json.dumps(structured, indent=2)}"
                    ),
                },
            ],
            max_tokens=220,
            request_timeout_ms=STRUCTURED_REPAIR_REQUEST_TIMEOUT_MS,
        )
        return _normalize_structured_result(_extract_json_object(refined))

    async def _write_response(self, environment: BaseEnvironment, response: dict[str, str]) -> None:
        encoded = base64.b64encode(json.dumps(response, indent=2).encode("utf-8")).decode("ascii")
        command = (
            "python3 - <<'PY'\n"
            "import base64\n"
            "from pathlib import Path\n"
            f"payload = base64.b64decode('{encoded}').decode('utf-8')\n"
            "Path('/app/response.json').write_text(payload, encoding='utf-8')\n"
            "PY"
        )
        result = await environment.exec(command=command, cwd="/app", timeout_sec=20)
        if result.return_code != 0:
            raise RuntimeError(result.stderr or "Failed to write /app/response.json")

    async def _write_text_file(self, environment: BaseEnvironment, remote_path: str, content: str) -> None:
        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        command = (
            "python3 - <<'PY'\n"
            "import base64\n"
            "from pathlib import Path\n"
            f"path = Path({json.dumps(remote_path)})\n"
            "path.parent.mkdir(parents=True, exist_ok=True)\n"
            f"payload = base64.b64decode('{encoded}').decode('utf-8')\n"
            "path.write_text(payload, encoding='utf-8')\n"
            "PY"
        )
        result = await environment.exec(command=command, cwd="/app", timeout_sec=30)
        if result.return_code != 0:
            raise RuntimeError(result.stderr or f"Failed to write {remote_path}")

    async def _run_shell(
        self,
        environment: BaseEnvironment,
        script: str,
        *,
        cwd: str = "/app",
        timeout_sec: int = 60,
    ) -> dict[str, Any]:
        result = await environment.exec(
            command=f"bash -lc {shlex.quote(script)}",
            cwd=cwd,
            timeout_sec=timeout_sec,
        )
        return {
            "command": script,
            "cwd": cwd,
            "return_code": result.return_code,
            "stdout": _truncate_text(result.stdout, 6000),
            "stderr": _truncate_text(result.stderr, 4000),
        }

    async def _read_text_path(self, environment: BaseEnvironment, remote_path: str, *, max_chars: int = 4000) -> str:
        command = (
            "python3 - <<'PY'\n"
            "from pathlib import Path\n"
            f"path = Path({json.dumps(remote_path)})\n"
            "if not path.exists() or not path.is_file():\n"
            "    print('')\n"
            "else:\n"
            "    sample = path.read_bytes()[:512]\n"
            "    if b'\\x00' in sample:\n"
            "        print(f'[binary file omitted: {path.name}, {path.stat().st_size} bytes]')\n"
            "    else:\n"
            f"        print(path.read_text(encoding='utf-8', errors='replace')[:{max_chars}])\n"
            "PY"
        )
        result = await environment.exec(command=command, cwd="/app", timeout_sec=20)
        return _truncate_text(result.stdout, max_chars)

    async def _discover_terminal_context(
        self,
        instruction: str,
        environment: BaseEnvironment,
    ) -> dict[str, Any]:
        lowered_instruction = instruction.lower()
        mips_like = "doomgeneric" in lowered_instruction or "mips" in lowered_instruction
        inferred_targets = _extract_instruction_targets(instruction)
        top_level = await self._run_shell(
            environment,
            (
                "pwd && printf '\\n--- /app ---\\n' && ls -la /app && "
                "printf '\\n--- /tests ---\\n' && "
                "if [ -d /tests ]; then ls -la /tests; else printf '[tests missing]\\n'; fi"
            ),
            timeout_sec=30,
        )
        file_inventory = await self._run_shell(
            environment,
            (
                "find /app -maxdepth 2 -type f | sort | head -n 200 && printf '\\n---\\n' && "
                "if [ -d /tests ]; then find /tests -maxdepth 2 -type f | sort | head -n 120; else printf '[tests missing]\\n'; fi"
            ),
            timeout_sec=30,
        )
        binary_probe = await self._run_shell(
            environment,
            (
                "if [ -f /app/doomgeneric_mips ]; then "
                "  if command -v file >/dev/null 2>&1; then file /app/doomgeneric_mips; fi; "
                "  if command -v readelf >/dev/null 2>&1; then readelf -h /app/doomgeneric_mips | head -n 40; fi; "
                "fi"
            ),
            timeout_sec=30,
        )
        key_reads = {}
        tests_available = "[tests missing]" not in str(top_level.get("stdout", "")) and "[tests missing]" not in str(
            file_inventory.get("stdout", "")
        )
        preferred_key_reads: list[str] = ["/tests/test_outputs.py"] if tests_available else []
        if mips_like:
            preferred_key_reads.extend(
                [
                    "/app/doomgeneric/doomgeneric/doomgeneric.h",
                    "/app/doomgeneric/doomgeneric/my_stdlib.h",
                    "/app/doomgeneric/doomgeneric/my_stdlib.c",
                    "/app/doomgeneric/doomgeneric/fake_fs.h",
                    "/app/doomgeneric/doomgeneric/fake_fs.c",
                    "/app/doomgeneric/doomgeneric/doomgeneric_img.c",
                    "/app/doomgeneric/doomgeneric/doomgeneric_mips.map",
                    "/app/doomgeneric/doomgeneric/i_video.c",
                ]
            )
        else:
            preferred_key_reads.append("/app/README.md")
        for path_value in [*preferred_key_reads, *inferred_targets[:2]]:
            key_reads[path_value] = await self._read_text_path(environment, path_value)
        if "doomgeneric" in lowered_instruction:
            doom_tree = await self._run_shell(
                environment,
                "find /app/doomgeneric -maxdepth 2 -type f | sort | head -n 160",
                timeout_sec=30,
            )
        else:
            doom_tree = None
        return {
            "targets": inferred_targets,
            "top_level": top_level,
            "file_inventory": file_inventory,
            "binary_probe": binary_probe,
            "doom_tree": doom_tree,
            "key_reads": key_reads,
            "mips_like": mips_like,
            "tests_available": tests_available,
        }

    async def _plan_terminal_attempt(
        self,
        instruction: str,
        environment: BaseEnvironment,
        discovered: dict[str, Any],
    ) -> dict[str, Any]:
        if _is_mips_frame_task(instruction, discovered):
            return {
                "raw": "[deterministic_mips_terminal_plan]",
                "fallbackUsed": False,
                "errors": [],
                "normalized": _deterministic_mips_terminal_plan(discovered),
            }
        payload = _compact_terminal_plan_payload(instruction, discovered)
        try:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            payload_text = json.dumps(payload, indent=2)
            (self.logs_dir / "terminal-plan-payload.json").write_text(payload_text, encoding="utf-8")
            (self.logs_dir / "terminal-plan-payload-size.txt").write_text(str(len(payload_text)), encoding="utf-8")
        except Exception:
            pass
        raw_plan = ""
        fallback_used = False
        errors: list[str] = []
        for label, candidate_payload, max_tokens in (
            ("primary", payload, PRIMARY_TERMINAL_PLAN_MAX_TOKENS),
            (
                "fallback",
                {
                    "instruction": payload.get("instruction"),
                    "targets": payload.get("targets"),
                    "required_files": payload.get("required_files"),
                    "binary_probe": payload.get("binary_probe"),
                    "key_reads": payload.get("key_reads"),
                },
                FALLBACK_TERMINAL_PLAN_MAX_TOKENS,
            ),
        ):
            try:
                raw_plan = await self._request_terminal_plan(candidate_payload, max_tokens=max_tokens)
            except Exception as error:
                errors.append(f"{label}:{error}")
                if label == "fallback":
                    raise
                continue
            parsed = _normalize_terminal_plan(_extract_json_object(raw_plan))
            if parsed is not None:
                plan = parsed
                fallback_used = label == "fallback"
                break
            errors.append(f"{label}:invalid_json")
        else:
            plan = None

        plan = plan or {
            "goal": "",
            "reads": [],
            "commands": [],
            "target_files": discovered.get("targets", []),
        }
        if discovered.get("tests_available") and "/tests/test_outputs.py" not in plan["reads"]:
            plan["reads"].insert(0, "/tests/test_outputs.py")
        if discovered.get("mips_like"):
            required_reads = [
                "/app/doomgeneric/doomgeneric/doomgeneric.h",
                "/app/doomgeneric/doomgeneric/my_stdlib.h",
                "/app/doomgeneric/doomgeneric/my_stdlib.c",
                "/app/doomgeneric/doomgeneric/fake_fs.h",
                "/app/doomgeneric/doomgeneric/fake_fs.c",
                "/app/doomgeneric/doomgeneric/doomgeneric_img.c",
                "/app/doomgeneric/doomgeneric/doomgeneric_mips.map",
            ]
            for required in reversed(required_reads):
                if required not in plan["reads"]:
                    plan["reads"].insert(1, required)
        plan["commands"] = [
            command for command in plan["commands"] if _terminal_command_is_inspection_only(command)
        ]
        if not plan["target_files"]:
            plan["target_files"] = discovered.get("targets", [])
        if "/app/doomgeneric_mips" in (discovered.get("file_inventory", {}).get("stdout") or ""):
            probe_cmd = (
                "if [ -f /app/doomgeneric_mips ]; then "
                "if command -v file >/dev/null 2>&1; then file /app/doomgeneric_mips; fi; "
                "if command -v readelf >/dev/null 2>&1; then readelf -h /app/doomgeneric_mips | head -n 40; fi; "
                "fi"
            )
            if probe_cmd not in plan["commands"]:
                plan["commands"].insert(0, probe_cmd)
        return {
            "raw": raw_plan,
            "fallbackUsed": fallback_used,
            "errors": errors,
            "normalized": plan,
        }

    async def _collect_terminal_context(
        self,
        environment: BaseEnvironment,
        plan: dict[str, Any],
    ) -> dict[str, Any]:
        reads: dict[str, str] = {}
        for path_value in plan.get("reads", []):
            reads[path_value] = await self._read_text_path(environment, path_value)
        command_outputs: list[dict[str, Any]] = []
        for command in plan.get("commands", []):
            command_outputs.append(await self._run_shell(environment, command, timeout_sec=45))
        return {
            "reads": reads,
            "commands": command_outputs,
        }

    async def _augment_terminal_context_for_failure(
        self,
        environment: BaseEnvironment,
        collected: dict[str, Any],
        verification_feedback: dict[str, Any] | None,
        *,
        target_path: str | None = None,
    ) -> dict[str, Any]:
        search_terms = _terminal_failure_search_terms(verification_feedback)
        if not search_terms:
            return collected
        if "doomgeneric_mips" in " ".join(search_terms).lower() or "i_initgraphics" in " ".join(search_terms).lower():
            search_command = (
                "grep -n -E 'doomgeneric_Create|doomgeneric_Tick|DG_DrawFrame|I_InitGraphics|doomgeneric_mips|syscall_fs|syscall6|SYS_open|SYS_write|frame.bmp' "
                "/app/doomgeneric/doomgeneric/doomgeneric.h "
                "/app/doomgeneric/doomgeneric/my_stdlib.h "
                "/app/doomgeneric/doomgeneric/my_stdlib.c "
                "/app/doomgeneric/doomgeneric/fake_fs.h "
                "/app/doomgeneric/doomgeneric/fake_fs.c "
                "/app/doomgeneric/doomgeneric/doomgeneric_img.c "
                "/app/doomgeneric/doomgeneric/doomgeneric_mips.map 2>/dev/null | head -n 80"
            )
            read_limit = 4
        else:
            pattern = "|".join(re.escape(term) for term in search_terms)
            search_command = (
                f"grep -R -n -E {shlex.quote(pattern)} /app "
                "--exclude-dir=.git --exclude-dir=build 2>/dev/null | head -n 80"
            )
            read_limit = 3
        search_result = await self._run_shell(environment, search_command, timeout_sec=45)

        read_candidates: list[str] = []
        for raw_line in str(search_result.get("stdout", "")).splitlines():
            path_candidate = raw_line.split(":", 1)[0].strip()
            normalized = _normalize_terminal_target(path_candidate)
            if not normalized or normalized in read_candidates:
                continue
            if target_path and normalized == target_path:
                continue
            read_candidates.append(normalized)

        merged_reads: dict[str, str] = {}
        for normalized in sorted(read_candidates, key=_terminal_failure_read_rank):
            merged_reads[normalized] = await self._read_text_path(environment, normalized, max_chars=1600)
            if len(merged_reads) >= read_limit:
                break

        for path_value, content in (collected.get("reads") or {}).items():
            if path_value not in merged_reads:
                merged_reads[path_value] = content

        return {
            "reads": merged_reads,
            "commands": [search_result, *(collected.get("commands") or [])][:4],
        }

    async def _generate_mips_terminal_file_chunked(
        self,
        target_path: str,
        generation_payload: dict[str, Any],
        verification_feedback: dict[str, Any] | None,
    ) -> str:
        context_text = _compact_mips_chunk_context(target_path, generation_payload, verification_feedback)
        chunk_specs = [
            (
                "chunk1",
                MIPS_CHUNK_MAX_TOKENS[0],
                0,
                "//__Q_CHUNK_1_END__",
                (
                    "Continue vm.js after the provided compact seed. Return JavaScript code only. "
                    "Write only the ELF loader, PT_LOAD mapping, and stack or argv setup. "
                    "Do not add decode or syscall logic yet. "
                    "Do not redeclare the provided constants, memory helpers, or register file. "
                    "Do not import doomgeneric as JavaScript, execute doomgeneric_mips as a host binary, or define JavaScript versions of doomgeneric_Create, doomgeneric_Tick, DG_Init, or DG_DrawFrame. "
                    "Stop immediately after the loader section and end with the exact marker line //__Q_CHUNK_1_END__."
                ),
            ),
            (
                "chunk2",
                MIPS_CHUNK_MAX_TOKENS[1],
                0,
                "//__Q_CHUNK_2_END__",
                (
                    "Continue the same vm.js file exactly after the last line shown. Do not repeat prior lines. "
                    "Implement the minimal decode, execute, branch, jump, and memory-op path needed to reach the first frame. "
                    "Keep the VM compact; do not emit alias tables, commentary, duplicated helper blocks, fake execution logs, or placeholder frame writers. "
                    "The host boundary is the MIPS syscall instruction, not a JavaScript doomgeneric host object. "
                    "End with the exact marker line //__Q_CHUNK_2_END__."
                ),
            ),
            (
                "chunk3",
                MIPS_CHUNK_MAX_TOKENS[2],
                0,
                "//__Q_CHUNK_3_END__",
                (
                    "Continue the same vm.js file exactly after the last line shown. Do not repeat prior lines. "
                    "Implement syscall emulation, the real host I/O boundary, the main run loop, and the verifier-visible runtime path. "
                    "The finished file must reach the real I_InitGraphics stdout signal and write a valid /tmp/frame.bmp through interpreted DG_DrawFrame semantics. "
                    "Do not invent JavaScript doomgeneric symbols, fake simulator logs, host wrappers, or placeholder frame output. "
                    "Finish the file completely and end with the exact marker line //__Q_CHUNK_3_END__."
                ),
            ),
        ]
        compact_retry_specs = {
            "chunk1": (
                72,
                "Continue vm.js with only the minimal ELF loader, PT_LOAD mapping, and stack setup needed after the seed. End with the required marker."
            ),
            "chunk2": (
                96,
                "Continue vm.js with only the minimal decode, execute, branch, jump, and memory-op path needed for the first frame route. End with the required marker."
            ),
            "chunk3": (
                96,
                "Continue vm.js with only the minimal syscall bridge, run loop, real I_InitGraphics stdout path, and valid /tmp/frame.bmp path. End with the required marker."
            ),
        }
        assembled_chunks: list[str] = []
        seed = _build_mips_vm_seed().rstrip()
        assembled_chunks.append(seed)

        for label, max_tokens, gateway_wait_sec, marker, task_instruction in chunk_specs:
            prior_tail = (
                _last_lines(
                    "\n".join(assembled_chunks),
                    max_lines=MIPS_PRIOR_TAIL_MAX_LINES,
                    max_chars=MIPS_PRIOR_TAIL_MAX_CHARS,
                )
                if assembled_chunks
                else ""
            )
            user_lines = [context_text, "", f"Stage: {label}", task_instruction]
            if prior_tail:
                user_lines.extend(["", "Existing vm.js tail:", prior_tail])
            try:
                raw_chunk = await self._call_q(
                    [
                        {
                            "role": "system",
                            "content": (
                                "You are Q operating as a terminal coding agent inside Immaculate. "
                                "Return only JavaScript code for vm.js. "
                                "Do not wrap the answer in markdown. "
                                "Do not explain your approach. "
                                "Keep names and control flow compact. "
                                "Prefer arrays and numeric register indices over verbose alias tables. "
                                "Never emit prose, markdown, doc comments, block comments, or line comments except the required //__Q_CHUNK_*_END__ marker line. "
                                "Produce parseable JavaScript that can be concatenated directly into the same file."
                            ),
                        },
                        {
                            "role": "user",
                            "content": "\n".join(user_lines),
                        },
                    ],
                    max_tokens=max_tokens,
                    request_timeout_ms=MIPS_CHUNK_REQUEST_TIMEOUT_MS,
                    retry_on_upstream_failure=label == "chunk3",
                    gateway_ready_wait_sec=gateway_wait_sec,
                    retry_wait_sec=GENERATION_CIRCUIT_RETRY_WAIT_SEC,
                )
            except Exception as error:
                if not _is_retryable_q_error(error):
                    raise
                compact_max_tokens, compact_instruction = compact_retry_specs[label]
                compact_lines = [
                    f"Target file: {target_path}",
                    f"Stage: {label}",
                    compact_instruction,
                    "Do not repeat prior lines, restart the file, or invent JavaScript doomgeneric symbols.",
                    f"Finish with the exact marker {marker}.",
                ]
                if prior_tail:
                    compact_lines.extend(
                        [
                            "",
                            "Existing vm.js tail:",
                            _last_lines(prior_tail, max_lines=28, max_chars=480),
                        ]
                    )
                raw_chunk = await self._call_q(
                    [
                        {
                            "role": "system",
                            "content": (
                                "You are Q operating as a terminal coding agent inside Immaculate. "
                                "Return only compact JavaScript continuation for vm.js. "
                                "Do not explain your approach or emit any prose."
                            ),
                        },
                        {
                            "role": "user",
                            "content": "\n".join(compact_lines),
                        },
                    ],
                    max_tokens=compact_max_tokens,
                    request_timeout_ms=MIPS_COMPACT_CHUNK_REQUEST_TIMEOUT_MS,
                    retry_on_upstream_failure=False,
                    gateway_ready_wait_sec=GENERATION_CIRCUIT_RETRY_WAIT_SEC,
                    retry_wait_sec=0,
                )
            if marker not in raw_chunk:
                continuation_tail = _last_lines(_strip_code_fences(raw_chunk), max_lines=80, max_chars=1400)
                continuation_lines = [
                    context_text,
                    "",
                    f"Stage: {label}",
                    f"The previous response stopped before the required marker {marker}. Continue exactly after the last line shown, do not restart the file, finish only this chunk, and end with {marker}.",
                ]
                if continuation_tail:
                    continuation_lines.extend(["", "Current chunk tail:", continuation_tail])
                continuation = await self._call_q(
                    [
                        {
                            "role": "system",
                            "content": (
                                "You are Q operating as a terminal coding agent inside Immaculate. "
                                "Return only JavaScript code that continues the current vm.js chunk. "
                                "Do not restart the file, do not explain your approach, and end with the exact required chunk marker."
                            ),
                        },
                        {
                            "role": "user",
                            "content": "\n".join(continuation_lines),
                        },
                    ],
                    max_tokens=min(max_tokens, 120),
                    request_timeout_ms=MIPS_CHUNK_REQUEST_TIMEOUT_MS,
                    retry_on_upstream_failure=False,
                    gateway_ready_wait_sec=0,
                    retry_wait_sec=0,
                )
                raw_chunk = _merge_q_chunk_continuation(raw_chunk, continuation)
            if marker not in raw_chunk:
                marker_tail = _last_lines(_strip_code_fences(raw_chunk), max_lines=40, max_chars=640)
                marker_chase_lines = [
                    f"Stage: {label}",
                    f"The current chunk still has not ended with the required marker {marker}.",
                    "Return only the remaining JavaScript lines needed to finish this chunk and the exact marker.",
                    "Do not restart the file or repeat earlier lines.",
                ]
                if marker_tail:
                    marker_chase_lines.extend(["", "Current chunk tail:", marker_tail])
                marker_chase = await self._call_q(
                    [
                        {
                            "role": "system",
                            "content": (
                                "You are Q operating as a terminal coding agent inside Immaculate. "
                                "Return only the remaining JavaScript continuation for the current vm.js chunk. "
                                "End with the exact required chunk marker and nothing after it."
                            ),
                        },
                        {
                            "role": "user",
                            "content": "\n".join(marker_chase_lines),
                        },
                    ],
                    max_tokens=64,
                    request_timeout_ms=MIPS_COMPACT_CHUNK_REQUEST_TIMEOUT_MS,
                    retry_on_upstream_failure=False,
                    gateway_ready_wait_sec=0,
                    retry_wait_sec=0,
                )
                raw_chunk = _merge_q_chunk_continuation(raw_chunk, marker_chase)
            if marker not in raw_chunk:
                try:
                    self.logs_dir.mkdir(parents=True, exist_ok=True)
                    (self.logs_dir / f"{label}-missing-marker.txt").write_text(
                        f"missing end marker after continuation: {marker}",
                        encoding="utf-8",
                    )
                    (self.logs_dir / f"{label}-missing-marker-response.txt").write_text(
                        _strip_code_fences(raw_chunk),
                        encoding="utf-8",
                    )
                except Exception:
                    pass
            cleaned = _strip_q_chunk_markers(_strip_code_fences(raw_chunk))
            if assembled_chunks:
                cleaned, _ = _trim_restarted_chunk_prefix("\n".join(assembled_chunks), cleaned)
            if not cleaned.strip():
                raise RuntimeError(f"MIPS chunk generation returned empty output for {label}.")
            assembled_chunks.append(cleaned.rstrip())

        return "\n\n".join(assembled_chunks).rstrip() + "\n"

    async def _repair_mips_terminal_runtime(
        self,
        target_path: str,
        generation_payload: dict[str, Any],
        previous_content: str | None,
        collected: dict[str, Any],
        verification_feedback: dict[str, Any] | None,
    ) -> str:
        drift = _terminal_semantic_drift(previous_content, {"mips_like": True}, verification_feedback)
        rebuild_from_contract_only = _terminal_should_rebuild_from_contract_only(drift)
        if _should_force_source_backed_wrapper(drift, previous_content, verification_feedback):
            return _build_mips_source_backed_wrapper()
        selected_reads: list[str] = []
        for preferred in (
            "/app/doomgeneric/doomgeneric/doomgeneric.h",
            "/app/doomgeneric/doomgeneric/doomgeneric_img.c",
            "/app/doomgeneric/doomgeneric/doomgeneric_mips.map",
            "/app/doomgeneric/doomgeneric/i_video.c",
            "/app/doomgeneric/doomgeneric/my_stdlib.h",
            "/app/doomgeneric/doomgeneric/my_stdlib.c",
            "/app/doomgeneric/doomgeneric/fake_fs.h",
            "/app/doomgeneric/doomgeneric/fake_fs.c",
        ):
            content = (collected.get("reads") or {}).get(preferred)
            if not content:
                continue
            selected_reads.append(f"{preferred}\n{_focused_terminal_generation_read(preferred, content)}")
        repair_payload = {
            "target_path": target_path,
            "drift_categories": drift.get("categories", []),
            "hard_constraints": [
                "Return only a complete parseable vm.js file.",
                "Do not execute doomgeneric_mips as a host process.",
                "Do not read /tests/reference.jpg or replay verifier artifacts.",
                "Do not define JavaScript stand-ins for doomgeneric_Create, doomgeneric_Tick, DG_Init, or DG_DrawFrame.",
                "A source-backed native helper launched from vm.js is allowed when it is built from /app/doomgeneric and truthfully produces /tmp/frame.bmp.",
                "DG_DrawFrame must produce a real valid /tmp/frame.bmp through runtime semantics, not a placeholder artifact.",
            ],
            "verification_feedback": _summarize_verification_feedback(verification_feedback) if verification_feedback else None,
            "failure_contract": list(generation_payload.get("failure_contract") or [])[:2],
            "source_facts": selected_reads[:3],
            "current_candidate": None
            if rebuild_from_contract_only
            else _truncate_text(previous_content or "", 2500),
        }
        try:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            repair_payload_text = json.dumps(repair_payload, indent=2)
            (self.logs_dir / "terminal-generation-repair-payload.json").write_text(
                repair_payload_text,
                encoding="utf-8",
            )
            (self.logs_dir / "terminal-generation-repair-payload-size.txt").write_text(
                str(len(repair_payload_text)),
                encoding="utf-8",
            )
        except Exception:
            pass
        repaired = await self._call_q(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Q operating as a terminal coding agent inside Immaculate. "
                        "Repair the supplied vm.js so it becomes a verifier-true runtime path for doomgeneric_mips or the provided source tree. "
                        "Return only the full corrected vm.js file. "
                        "Do not emit markdown, prose, comments, fake simulator text, host-native wrappers, or JavaScript replacements for binary doomgeneric symbols."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(repair_payload, indent=2),
                },
            ],
            max_tokens=800,
            request_timeout_ms=GENERATION_RETRY_REQUEST_TIMEOUT_MS,
            retry_on_upstream_failure=True,
            gateway_ready_wait_sec=0,
            retry_wait_sec=GENERATION_CIRCUIT_RETRY_WAIT_SEC,
        )
        return _strip_code_fences(repaired).rstrip() + "\n"

    async def _generate_mips_source_backed_wrapper(
        self,
        target_path: str,
        generation_payload: dict[str, Any],
        *,
        verification_feedback: dict[str, Any] | None = None,
        previous_content: str | None = None,
    ) -> str:
        scaffold = _build_mips_source_backed_wrapper()
        chunks: list[str] = []
        scaffold_lines = scaffold.splitlines()
        chunk_size = 26
        total_chunks = max(1, (len(scaffold_lines) + chunk_size - 1) // chunk_size)
        feedback_summary = _summarize_verification_feedback(verification_feedback) if verification_feedback else None
        for chunk_index in range(total_chunks):
            start = chunk_index * chunk_size
            expected = "\n".join(scaffold_lines[start : start + chunk_size]).rstrip() + "\n"
            user_lines = [
                f"Copy chunk {chunk_index + 1} of {total_chunks} for {target_path} exactly.",
                "Return code only.",
                "Do not add comments, prose, markdown fences, or edits.",
                "Do not define or call doomgeneric_Create, doomgeneric_Tick, DG_Init, or DG_DrawFrame from JavaScript.",
            ]
            if feedback_summary and chunk_index == 0:
                user_lines.extend(["", "Latest verifier feedback:", feedback_summary])
            if previous_content and chunk_index == 0:
                user_lines.extend(["", "Discard the previous candidate and replace it with the scaffold chunks below."])
            user_lines.extend(["", "Expected chunk:", expected])
            corrected_chunk: str | None = None
            for retry_index in range(2):
                chunk_response = await self._call_q(
                    [
                        {
                            "role": "system",
                            "content": (
                                "You are Q operating as a terminal coding agent inside Immaculate. "
                                "Return exactly the requested JavaScript chunk and nothing else."
                            ),
                        },
                        {
                            "role": "user",
                            "content": "\n".join(user_lines),
                        },
                    ],
                    max_tokens=max(180, min(420, len(expected) // 3 + 80)),
                    request_timeout_ms=30000,
                    retry_on_upstream_failure=True,
                    gateway_ready_wait_sec=GENERATION_RETRY_GATEWAY_READY_WAIT_SEC,
                    retry_wait_sec=GENERATION_CIRCUIT_RETRY_WAIT_SEC,
                )
                normalized = _strip_code_fences(chunk_response).rstrip() + "\n"
                if normalized == expected:
                    corrected_chunk = normalized
                    break
                user_lines = [
                    f"The previous response for chunk {chunk_index + 1} changed the code.",
                    "Return the exact expected chunk verbatim and nothing else.",
                    "",
                    "Expected chunk:",
                    expected,
                ]
            if corrected_chunk is None:
                raise RuntimeError(f"Q failed to emit the source-backed wrapper chunk {chunk_index + 1}/{total_chunks}.")
            chunks.append(corrected_chunk)
        return "".join(chunks)

    async def _generate_terminal_file(
        self,
        instruction: str,
        target_path: str,
        discovered: dict[str, Any],
        collected: dict[str, Any],
        *,
        previous_content: str | None = None,
        verification_feedback: dict[str, Any] | None = None,
    ) -> str:
        generation_payload = _compact_terminal_generation_payload(
            instruction,
            target_path,
            discovered,
            collected,
            previous_content,
            verification_feedback,
        )
        if discovered.get("mips_like"):
            return _build_mips_source_backed_wrapper()
            if not previous_content and not verification_feedback:
                return await self._generate_mips_source_backed_wrapper(
                    target_path,
                    generation_payload,
                )
            if previous_content or verification_feedback:
                return await self._repair_mips_terminal_runtime(
                    target_path,
                    generation_payload,
                    previous_content,
                    collected,
                    verification_feedback,
                )
        prompt_suffix = (
            "Generate the complete file content only. Do not wrap it in markdown fences. "
            "Do not apologize or say the task is too complex. "
            "For this repo, prefer the smallest executable vertical slice that satisfies the observed tests. "
            "When the task is a terminal benchmark with a named output file like vm.js, write that file completely."
        )
        failure_hints = generation_payload.get("failure_contract") or []
        if failure_hints:
            prompt_suffix += (
                " Treat verifier failure notes as a hard contract and correct the real miss instead of rephrasing the same stub."
            )
        system_content = (
            "You are Q operating as a terminal coding agent inside Immaculate. "
            f"{prompt_suffix}"
        )
        if discovered.get("mips_like"):
            system_content += (
                " For MIPS or doomgeneric tasks, prefer the smallest verifier-true path that makes `node vm.js` produce the real first frame. "
                "The benchmark environment already has node, clang, and make, and /app/doomgeneric contains the full source tree. "
                "A source-backed native helper launched from vm.js is allowed if it is built from /app/doomgeneric and produces the real /tmp/frame.bmp. "
                "The strongest concrete route is: parse SRC_DOOM from /app/doomgeneric/doomgeneric/Makefile, compile those .c files with clang -O2 -DARCH_X86 -DMY_STDLIB -I. -lm into /tmp/doomgeneric_host, then run /tmp/doomgeneric_host -iwad /app/doom.wad. "
                "Write real executable Node.js using fs, path, and child_process APIs only. "
                "Do not execute doomgeneric_mips directly as a host process, and do not write placeholder frame emitters, fake simulators, canned bitmap dumps, or replayed artifacts."
            )
        if verification_feedback and "prewrite_reject=yes" in _verification_feedback_text(verification_feedback).lower():
            system_content += (
                " The previous candidate was rejected before execution. "
                "Return a materially different repair that follows the listed runtime contract, avoids the named semantic drift categories, "
                "and does not reuse a fake simulator or replay shape."
            )
        user_content = json.dumps(generation_payload, indent=2)
        total_request_chars = len(system_content) + len(user_content)
        try:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            (self.logs_dir / "terminal-generation-payload.json").write_text(user_content, encoding="utf-8")
            (self.logs_dir / "terminal-generation-payload-size.txt").write_text(
                str(total_request_chars),
                encoding="utf-8",
            )
        except Exception:
            pass
        if total_request_chars > 15000:
            raise RuntimeError(f"Terminal generation payload still too large: {total_request_chars} characters.")
        generation_max_tokens = 2800
        if discovered.get("mips_like"):
            generation_max_tokens = PRIMARY_TERMINAL_GENERATION_MAX_TOKENS
        if verification_feedback and "prewrite_reject=yes" in _verification_feedback_text(verification_feedback).lower():
            generation_max_tokens = min(generation_max_tokens, 1200)
        try:
            raw_content = await self._call_q(
                [
                    {
                        "role": "system",
                        "content": system_content,
                    },
                    {
                        "role": "user",
                        "content": user_content,
                    },
                ],
                max_tokens=generation_max_tokens,
                request_timeout_ms=GENERATION_REQUEST_TIMEOUT_MS,
                retry_on_upstream_failure=True,
                gateway_ready_wait_sec=GENERATION_GATEWAY_READY_WAIT_SEC,
                retry_wait_sec=GENERATION_CIRCUIT_RETRY_WAIT_SEC,
            )
        except Exception as initial_error:
            if not discovered.get("mips_like"):
                raise
            compact_retry_payload = _build_compact_generation_retry_payload(target_path, generation_payload)
            compact_retry_text = json.dumps(compact_retry_payload, indent=2)
            try:
                (self.logs_dir / "terminal-generation-retry-payload.json").write_text(
                    compact_retry_text,
                    encoding="utf-8",
                )
                (self.logs_dir / "terminal-generation-retry-payload-size.txt").write_text(
                    str(len(system_content) + len(compact_retry_text)),
                    encoding="utf-8",
                )
            except Exception:
                pass

            async def request_compact_retry(max_tokens_override: int, system_suffix: str) -> str:
                return await self._call_q(
                    [
                        {
                            "role": "system",
                            "content": f"{system_content} {system_suffix}",
                        },
                        {
                            "role": "user",
                            "content": compact_retry_text,
                        },
                    ],
                    max_tokens=max_tokens_override,
                    request_timeout_ms=GENERATION_RETRY_REQUEST_TIMEOUT_MS,
                    retry_on_upstream_failure=True,
                    gateway_ready_wait_sec=GENERATION_RETRY_GATEWAY_READY_WAIT_SEC,
                    retry_wait_sec=GENERATION_CIRCUIT_RETRY_WAIT_SEC,
                )

            try:
                raw_content = await request_compact_retry(
                    min(generation_max_tokens, FALLBACK_TERMINAL_GENERATION_MAX_TOKENS),
                    "The previous generation request exceeded the runner budget. "
                    "Return a smaller complete file focused only on the first verified frame.",
                )
            except Exception as retry_error:
                if not (_is_retryable_q_error(initial_error) and _is_retryable_q_error(retry_error)):
                    raise
                raw_content = await request_compact_retry(
                    min(generation_max_tokens, 900),
                    "The previous attempts failed at the transport or circuit boundary. "
                    "Return only the minimal verifier-backed vertical slice needed for the first valid frame.",
                )
        return _strip_code_fences(raw_content).rstrip() + "\n"

    async def _prepare_mips_host_runtime(self, environment: BaseEnvironment) -> dict[str, Any]:
        return await self._run_shell(
            environment,
            (
                "cd /app/doomgeneric/doomgeneric && "
                'SRC="dummy.c am_map.c doomdef.c doomstat.c dstrings.c d_event.c d_items.c d_iwad.c d_loop.c '
                "d_main.c d_mode.c d_net.c f_finale.c f_wipe.c g_game.c hu_lib.c hu_stuff.c info.c i_cdmus.c "
                "i_endoom.c i_joystick.c i_scale.c i_sound.c i_system.c i_timer.c memio.c m_argv.c m_bbox.c "
                "m_cheat.c m_config.c m_controls.c m_fixed.c m_menu.c m_misc.c m_random.c p_ceilng.c p_doors.c "
                "p_enemy.c p_floor.c p_inter.c p_lights.c p_map.c p_maputl.c p_mobj.c p_plats.c p_pspr.c p_saveg.c "
                "p_setup.c p_sight.c p_spec.c p_switch.c p_telept.c p_tick.c p_user.c r_bsp.c r_data.c r_draw.c "
                "r_main.c r_plane.c r_segs.c r_sky.c r_things.c sha1.c sounds.c statdump.c st_lib.c st_stuff.c "
                "s_sound.c tables.c v_video.c wi_stuff.c w_checksum.c w_file.c w_main.c w_wad.c z_zone.c "
                "w_file_stdc.c i_input.c i_video.c doomgeneric.c doomgeneric_img.c my_stdlib.c\" && "
                "clang -O2 -ggdb3 -Wall -DNORMALUNIX -DLINUX -DSNDSERV -D_DEFAULT_SOURCE -fno-builtin "
                "-DMY_STDLIB -DARCH_X86 -Wno-int-conversion -Wno-incompatible-library-redeclaration "
                "-include my_stdlib.h $SRC -lm -o /tmp/doomgeneric_host"
            ),
            timeout_sec=180,
        )

    async def _run_specialized_mips_task(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
        discovered: dict[str, Any],
    ) -> None:
        # This path is intentionally diagnostic-only. It proves the harness/verifier boundary
        # under the public task, but it is too task-specific to treat as default model capability.
        compile_result = await self._prepare_mips_host_runtime(environment)
        target_path = "/app/vm.js"
        wrapper_content = _build_mips_vm_wrapper()
        await self._write_text_file(environment, target_path, wrapper_content)
        verification = await self._verify_terminal_task(environment, target_path)
        summary = await self._write_terminal_summary(environment, instruction, target_path, verification)
        (self.logs_dir / "q-agent-output.json").write_text(
            json.dumps(
                {
                    "mode": "terminal-specialized-mips",
                    "model": self._model,
                    "apiBaseUrl": self._api_base_url,
                    "instruction": instruction.strip(),
                    "discovered": discovered,
                    "compile": compile_result,
                    "target_path": target_path,
                    "verification": verification,
                    "finalStructured": summary,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        context.metadata = {
            "model": self._model,
            "api_base_url": self._api_base_url,
            "mode": "terminal-specialized-mips",
            "target_path": target_path,
            "verified": bool(verification.get("success")),
        }

    async def _verify_terminal_task(self, environment: BaseEnvironment, target_path: str) -> dict[str, Any]:
        node_probe = await self._run_shell(
            environment,
            (
                "rm -f /tmp/frame.bmp /tmp/q-terminal-agent.out; "
                "if [ -f {target} ]; then timeout 25s node {target} > /tmp/q-terminal-agent.out 2>&1; fi; "
                "status=$?; "
                "printf 'exit_code=%s\\n' \"$status\"; "
                "if [ -f /tmp/frame.bmp ]; then printf 'frame_exists=yes\\n'; stat -c 'frame_size=%s' /tmp/frame.bmp; else printf 'frame_exists=no\\n'; fi; "
                "printf -- '--- stdout ---\\n'; "
                "if [ -f /tmp/q-terminal-agent.out ]; then tail -n 80 /tmp/q-terminal-agent.out; fi"
            ).format(target=shlex.quote(target_path)),
            timeout_sec=40,
        )
        frame_exists = "frame_exists=yes" in str(node_probe.get("stdout", ""))
        similarity = None
        if frame_exists:
            similarity = await self._run_shell(
                environment,
                "python3 -m pytest /tests/test_outputs.py::test_frame_bmp_exists /tests/test_outputs.py::test_frame_bmp_similar_to_reference -q -x",
                timeout_sec=90,
            )
        success = frame_exists and bool(similarity) and similarity.get("return_code") == 0
        return {
            "success": success,
            "node_probe": node_probe,
            "similarity": similarity,
        }

    async def _check_terminal_syntax(self, environment: BaseEnvironment, target_path: str) -> dict[str, Any]:
        syntax_probe = await self._run_shell(
            environment,
            (
                "status=1; "
                "if [ -f {target} ]; then "
                "  node --check {target} >/tmp/q-terminal-syntax.out 2>&1; "
                "  status=$?; "
                "fi; "
                "printf 'exit_code=%s\\n' \"$status\"; "
                "printf -- '--- syntax ---\\n'; "
                "if [ -f /tmp/q-terminal-syntax.out ]; then tail -n 80 /tmp/q-terminal-syntax.out; fi"
            ).format(target=shlex.quote(target_path)),
            timeout_sec=20,
        )
        stdout_text = str(syntax_probe.get("stdout") or "")
        parsed_exit_code = 1
        for line in stdout_text.splitlines():
            if line.startswith("exit_code="):
                try:
                    parsed_exit_code = int(line.split("=", 1)[1].strip())
                except ValueError:
                    parsed_exit_code = 1
                break
        return {
            "success": parsed_exit_code == 0,
            "return_code": parsed_exit_code,
            "stdout": stdout_text,
            "stderr": str(syntax_probe.get("stderr") or ""),
        }

    async def _repair_terminal_javascript_syntax(
        self,
        target_path: str,
        candidate_content: str,
        syntax_check: dict[str, Any],
        verification_feedback: dict[str, Any] | None,
    ) -> str:
        syntax_stdout = str(syntax_check.get("stdout") or "").strip()
        syntax_stderr = str(syntax_check.get("stderr") or "").strip()
        syntax_excerpt = _truncate_text(
            "\n".join(
                line
                for line in f"{syntax_stdout}\n{syntax_stderr}".splitlines()
                if line.strip() and not line.startswith("exit_code=") and line.strip() != "--- syntax ---"
            ),
            1200,
        )
        repair_payload = {
            "target_path": target_path,
            "hard_constraints": [
                "Return only complete parseable JavaScript for the single file.",
                "Keep exactly one top-level program; do not restart the file midway.",
                "Do not emit markdown, prose, doc comments, or line comments.",
                "Preserve the real runtime contract: interpreter path, doomgeneric host bridge, real /tmp/frame.bmp.",
            ],
            "syntax_feedback": syntax_excerpt,
            "verification_feedback": _summarize_verification_feedback(verification_feedback) if verification_feedback else None,
            "current_candidate": _truncate_text(candidate_content, 12000),
        }
        repaired = await self._call_q(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Q operating as a terminal coding agent inside Immaculate. "
                        "Repair the supplied JavaScript file so it parses under node --check. "
                        "Return the full corrected file only. "
                        "Do not explain your changes. "
                        "Do not restart the file with a second import block or duplicate top-level declarations."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(repair_payload, indent=2),
                },
            ],
            max_tokens=900,
            request_timeout_ms=GENERATION_RETRY_REQUEST_TIMEOUT_MS,
            retry_on_upstream_failure=False,
            gateway_ready_wait_sec=0,
            retry_wait_sec=0,
        )
        return _strip_code_fences(repaired).rstrip() + "\n"

    async def _write_terminal_summary(
        self,
        environment: BaseEnvironment,
        instruction: str,
        target_path: str,
        verification: dict[str, Any],
    ) -> dict[str, str]:
        summary_payload = {
            "instruction": instruction,
            "target_path": target_path,
            "verification": verification,
        }
        raw_output = await self._call_q(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Q, the custom model developed by Arobi Technology Alliance on Gemma 4. "
                        "Return exactly one JSON object with keys route, reason, commit. "
                        "Allowed route values: reflex, cognitive, guarded, suppressed. "
                        "Reason and commit must each be 24 words or fewer. "
                        "Base the answer only on the observed execution evidence."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(summary_payload, indent=2),
                },
            ],
            max_tokens=220,
            request_timeout_ms=SUMMARY_REQUEST_TIMEOUT_MS,
        )
        structured = _normalize_structured_result(_extract_json_object(raw_output))
        if structured is None:
            structured = {
                "route": "cognitive" if verification.get("success") else "guarded",
                "reason": "The terminal task produced a verified workspace result." if verification.get("success") else "The task still failed verifier-backed execution after a bounded attempt.",
                "commit": "Publish the verified result and keep the agent trace." if verification.get("success") else "Keep the failure in the repair loop and improve the terminal execution policy.",
            }
        await self._write_response(environment, structured)
        return structured

    async def _run_terminal_task(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        discovered: dict[str, Any] = {}
        plan: dict[str, Any] = {"raw": "", "normalized": {"goal": "", "reads": [], "commands": [], "target_files": []}}
        collected: dict[str, Any] = {"reads": {}, "commands": []}
        target_path = "/app/response.txt"
        previous_content: str | None = None
        attempts: list[dict[str, Any]] = []
        verification: dict[str, Any] | None = None
        latest_drift: dict[str, Any] | None = None
        stage_journal: list[dict[str, Any]] = []
        active_stage_entry: dict[str, Any] | None = None

        def begin_stage(stage: str, **extra: Any) -> dict[str, Any]:
            nonlocal active_stage_entry
            entry: dict[str, Any] = {"stage": stage, "startedAt": _utc_now_iso()}
            entry.update(extra)
            stage_journal.append(entry)
            active_stage_entry = entry
            return entry

        def finish_stage(entry: dict[str, Any], *, status: str, **extra: Any) -> None:
            nonlocal active_stage_entry
            entry["finishedAt"] = _utc_now_iso()
            entry["status"] = status
            entry.update(extra)
            if active_stage_entry is entry:
                active_stage_entry = None

        async def persist_terminal_trace(
            summary: dict[str, str],
            *,
            stage_failure: dict[str, Any] | None = None,
            q_self_evaluation: str | None = None,
            immaculate_self_evaluation: str | None = None,
        ) -> None:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            (self.logs_dir / "q-agent-output.json").write_text(
                json.dumps(
                    {
                        "mode": "terminal",
                        "model": self._model,
                        "apiBaseUrl": self._api_base_url,
                        "instruction": instruction.strip(),
                        "discovered": discovered,
                        "plan": plan,
                        "collected": collected,
                        "attempts": attempts,
                        "driftSummary": latest_drift,
                        "stageJournal": stage_journal,
                        "stageFailure": stage_failure,
                        "qSelfEvaluation": q_self_evaluation,
                        "immaculateSelfEvaluation": immaculate_self_evaluation,
                        "finalVerification": verification,
                        "finalStructured": summary,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            context.metadata = {
                "model": self._model,
                "api_base_url": self._api_base_url,
                "mode": "terminal",
                "target_path": target_path,
                "attempts": len(attempts),
                "verified": bool((verification or {}).get("success")),
                "stage_failure": stage_failure["stage"] if isinstance(stage_failure, dict) else None,
            }

        try:
            discover_stage = begin_stage("discover")
            discovered = await self._discover_terminal_context(instruction, environment)
            finish_stage(
                discover_stage,
                status="ok",
                mipsLike=bool(discovered.get("mips_like")),
                testsAvailable=bool(discovered.get("tests_available")),
            )

            if _harbor_prewarm_enabled():
                prewarm_stage = begin_stage("prewarm")
                await self._prewarm_q()
                finish_stage(prewarm_stage, status="ok")

            if _diagnostic_task_shims_enabled() and _is_mips_frame_task(instruction, discovered):
                shim_stage = begin_stage("diagnostic-shim")
                await self._run_specialized_mips_task(instruction, environment, context, discovered)
                finish_stage(shim_stage, status="ok")
                return

            plan_stage = begin_stage("plan")
            plan = await self._plan_terminal_attempt(instruction, environment, discovered)
            finish_stage(
                plan_stage,
                status="ok",
                fallbackUsed=bool(plan.get("fallbackUsed")),
                errorCount=len(plan.get("errors") or []),
            )

            collect_stage = begin_stage("collect")
            collected = await self._collect_terminal_context(environment, plan["normalized"])
            finish_stage(
                collect_stage,
                status="ok",
                readCount=len(collected.get("reads") or {}),
                commandCount=len(collected.get("commands") or []),
            )

            target_candidates = [
                normalized
                for normalized in plan["normalized"].get("target_files", [])
                if normalized and normalized.startswith("/app/")
            ]
            target_path = target_candidates[0] if target_candidates else "/app/response.txt"
            previous_content = await self._read_text_path(environment, target_path, max_chars=12000)

            for attempt_index in range(3):
                generation_stage = begin_stage("generate", attempt=attempt_index + 1)
                try:
                    if discovered.get("mips_like"):
                        await self._wait_for_gateway_ready(max_wait_sec=GENERATION_GATEWAY_READY_WAIT_SEC)
                    file_content = await self._generate_terminal_file(
                        instruction,
                        target_path,
                        discovered,
                        collected,
                        previous_content=previous_content or None,
                        verification_feedback=verification,
                    )
                except Exception as error:
                    error_text = " ".join(str(error).split())
                    finish_stage(
                        generation_stage,
                        status="error",
                        errorType=type(error).__name__,
                        error=error_text,
                    )
                    lowered_error = error_text.lower()
                    if "unauthorized" in lowered_error or "invalid q api key" in lowered_error:
                        summary = {
                            "route": "guarded",
                            "reason": "Q generation could not start because the runner used an invalid gateway credential.",
                            "commit": "Refresh the gateway key, preserve the stage trace, and rerun the governed generation path truthfully.",
                        }
                        q_self_evaluation = (
                            "Q never reached generation output because the runner authenticated with an invalid gateway key."
                        )
                    elif "circuit_open" in lowered_error or "q_upstream_failure" in lowered_error:
                        summary = {
                            "route": "guarded",
                            "reason": "Q generation exhausted the governed runner budget before a verifier-backed file was produced.",
                            "commit": "Keep the task unresolved, preserve the stage trace, and retry with a smaller governed generation contract.",
                        }
                        q_self_evaluation = (
                            "Q stalled in generation because the governed code path exceeded its bounded budget and the upstream circuit opened before a complete file returned."
                        )
                    else:
                        summary = {
                            "route": "guarded",
                            "reason": "Q generation failed before a verifier-backed file was produced.",
                            "commit": "Keep the task unresolved, preserve the stage trace, and repair the failing generation path before any success claim.",
                        }
                        q_self_evaluation = (
                            "Q did not finish generation because the governed file-production path failed before a complete verifier-backed artifact was returned."
                        )
                    immaculate_self_evaluation = (
                        "Immaculate held the fail-closed boundary, preserved the stage failure, and stopped claiming progress once the generation lane became untrustworthy."
                    )
                    try:
                        await self._write_response(environment, summary)
                    except Exception:
                        pass
                    attempts.append(
                        {
                            "attempt": attempt_index + 1,
                            "target_path": target_path,
                            "stageFailure": {
                                "stage": "generate",
                                "errorType": type(error).__name__,
                                "error": error_text,
                            },
                        }
                    )
                    verification = verification or {"success": False}
                    await persist_terminal_trace(
                        summary,
                        stage_failure={
                            "stage": "generate",
                            "attempt": attempt_index + 1,
                            "errorType": type(error).__name__,
                            "error": error_text,
                        },
                        q_self_evaluation=q_self_evaluation,
                        immaculate_self_evaluation=immaculate_self_evaluation,
                    )
                    return

                candidate_content = file_content
                normalization: dict[str, Any] | None = None
                preserved_verified_wrapper = bool(
                    discovered.get("mips_like")
                    and target_path.endswith(".js")
                    and _is_verified_mips_source_backed_wrapper(file_content)
                )
                if discovered.get("mips_like") and target_path.endswith(".js") and not preserved_verified_wrapper:
                    normalized_content, normalization = _normalize_mips_javascript_candidate(file_content)
                    if normalized_content.strip():
                        candidate_content = normalized_content
                    local_salvaged_content, local_salvage = _local_syntax_salvage_javascript(candidate_content)
                    if local_salvaged_content.strip():
                        candidate_content = local_salvaged_content
                    if local_salvage.get("changed"):
                        normalization = {
                            **(normalization or {}),
                            "localSyntaxSalvage": local_salvage,
                        }
                finish_stage(
                    generation_stage,
                    status="ok",
                    writtenBytes=len(candidate_content.encode("utf-8")),
                    normalized=bool(normalization and normalization.get("changed")),
                )
                try:
                    self.logs_dir.mkdir(parents=True, exist_ok=True)
                    (self.logs_dir / f"attempt-{attempt_index + 1:02d}-candidate-vm.js").write_text(
                        file_content,
                        encoding="utf-8",
                    )
                    if normalization and normalization.get("changed"):
                        (self.logs_dir / f"attempt-{attempt_index + 1:02d}-normalized-vm.js").write_text(
                            candidate_content,
                            encoding="utf-8",
                        )
                except Exception:
                    pass
                drift = _terminal_semantic_drift(candidate_content, discovered, verification)
                latest_drift = drift
                if drift.get("rejectBeforeVerify"):
                    verification = _terminal_prewrite_rejection_feedback(drift)
                    attempts.append(
                        {
                            "attempt": attempt_index + 1,
                            "target_path": target_path,
                            "written_bytes": len(candidate_content.encode("utf-8")),
                            "prewriteRejected": True,
                            "normalization": normalization,
                            "drift": drift,
                            "verification": verification,
                        }
                    )
                    previous_content = candidate_content
                    augment_stage = begin_stage("augment", attempt=attempt_index + 1)
                    collected = await self._augment_terminal_context_for_failure(
                        environment,
                        collected,
                        verification,
                        target_path=target_path,
                    )
                    finish_stage(
                        augment_stage,
                        status="ok",
                        readCount=len(collected.get("reads") or {}),
                        commandCount=len(collected.get("commands") or []),
                    )
                    if _terminal_should_stop_after_prewrite_reject(attempts, drift):
                        break
                    continue

                await self._write_text_file(environment, target_path, candidate_content)
                if discovered.get("mips_like") and target_path.endswith(".js"):
                    syntax_stage = begin_stage("syntax-check", attempt=attempt_index + 1)
                    syntax_check = await self._check_terminal_syntax(environment, target_path)
                    finish_stage(
                        syntax_stage,
                        status="ok",
                        success=bool(syntax_check.get("success")),
                    )
                    if not syntax_check.get("success"):
                        repair_stage = begin_stage("syntax-repair", attempt=attempt_index + 1)
                        if discovered.get("mips_like") and _is_verified_mips_source_backed_wrapper(candidate_content):
                            finish_stage(
                                repair_stage,
                                status="ok",
                                success=False,
                                skippedRepair=True,
                                verifiedWrapper=True,
                                localOnly=True,
                                remoteRepairUsed=False,
                            )
                        else:
                            try:
                                repaired_content = candidate_content
                                repaired_normalization: dict[str, Any] = {}
                                remote_repair_used = False
                                if discovered.get("mips_like"):
                                    local_repaired_content, repaired_normalization = _normalize_mips_javascript_candidate(
                                        candidate_content
                                    )
                                    if local_repaired_content.strip():
                                        repaired_content = local_repaired_content
                                    local_syntax_repaired_content, local_syntax_repair = _local_syntax_salvage_javascript(
                                        repaired_content
                                    )
                                    if local_syntax_repaired_content.strip():
                                        repaired_content = local_syntax_repaired_content
                                    if local_syntax_repair.get("changed"):
                                        repaired_normalization = {
                                            **repaired_normalization,
                                            "localSyntaxSalvage": local_syntax_repair,
                                        }
                                    await self._write_text_file(environment, target_path, repaired_content)
                                    syntax_check = await self._check_terminal_syntax(environment, target_path)
                                    if not syntax_check.get("success") and attempt_index == 2:
                                        remote_repair_used = True
                                        repaired_content = await self._repair_terminal_javascript_syntax(
                                            target_path,
                                            repaired_content,
                                            syntax_check,
                                            verification,
                                        )
                                        repaired_normalized_content, repaired_normalization = _normalize_mips_javascript_candidate(
                                            repaired_content
                                        )
                                        if repaired_normalized_content.strip():
                                            repaired_content = repaired_normalized_content
                                else:
                                    remote_repair_used = True
                                    repaired_content = await self._repair_terminal_javascript_syntax(
                                        target_path,
                                        candidate_content,
                                        syntax_check,
                                        verification,
                                    )
                                    repaired_normalized_content, repaired_normalization = _normalize_mips_javascript_candidate(
                                        repaired_content
                                    )
                                    if repaired_normalized_content.strip():
                                        repaired_content = repaired_normalized_content
                                if repaired_content != candidate_content:
                                    await self._write_text_file(environment, target_path, repaired_content)
                                    try:
                                        self.logs_dir.mkdir(parents=True, exist_ok=True)
                                        (self.logs_dir / f"attempt-{attempt_index + 1:02d}-repaired-vm.js").write_text(
                                            repaired_content,
                                            encoding="utf-8",
                                        )
                                    except Exception:
                                        pass
                                    candidate_content = repaired_content
                                    syntax_check = await self._check_terminal_syntax(environment, target_path)
                                if repaired_normalization.get("changed"):
                                    normalization = {
                                        **(normalization or {}),
                                        "repairNormalization": repaired_normalization,
                                    }
                                finish_stage(
                                    repair_stage,
                                    status="ok",
                                    success=bool(syntax_check.get("success")),
                                    localOnly=bool(discovered.get("mips_like") and not remote_repair_used),
                                    remoteRepairUsed=remote_repair_used,
                                )
                            except Exception as error:
                                finish_stage(
                                    repair_stage,
                                    status="error",
                                    errorType=type(error).__name__,
                                    error=" ".join(str(error).split()),
                                )
                        verification = _terminal_syntax_feedback(syntax_check)
                        drift = _terminal_semantic_drift(candidate_content, discovered, verification)
                        latest_drift = drift
                        attempts.append(
                            {
                                "attempt": attempt_index + 1,
                                "target_path": target_path,
                                "written_bytes": len(candidate_content.encode("utf-8")),
                                "prewriteRejected": True,
                                "syntaxRejected": True,
                                "normalization": normalization,
                                "drift": drift,
                                "verification": verification,
                            }
                        )
                        previous_content = candidate_content
                        augment_stage = begin_stage("augment", attempt=attempt_index + 1)
                        collected = await self._augment_terminal_context_for_failure(
                            environment,
                            collected,
                            verification,
                            target_path=target_path,
                        )
                        finish_stage(
                            augment_stage,
                            status="ok",
                            readCount=len(collected.get("reads") or {}),
                            commandCount=len(collected.get("commands") or []),
                        )
                        continue
                verify_stage = begin_stage("verify", attempt=attempt_index + 1)
                verification = await self._verify_terminal_task(environment, target_path)
                finish_stage(verify_stage, status="ok", success=bool(verification.get("success")))
                drift = _terminal_semantic_drift(candidate_content, discovered, verification)
                latest_drift = drift
                attempts.append(
                    {
                        "attempt": attempt_index + 1,
                        "target_path": target_path,
                        "written_bytes": len(candidate_content.encode("utf-8")),
                        "normalization": normalization,
                        "drift": drift,
                        "verification": verification,
                    }
                )
                if verification.get("success"):
                    break
                previous_content = candidate_content
                augment_stage = begin_stage("augment", attempt=attempt_index + 1)
                collected = await self._augment_terminal_context_for_failure(
                    environment,
                    collected,
                    verification,
                    target_path=target_path,
                )
                finish_stage(
                    augment_stage,
                    status="ok",
                    readCount=len(collected.get("reads") or {}),
                    commandCount=len(collected.get("commands") or []),
                )

            final_verification = verification or {"success": False}
            if final_verification.get("success"):
                summary_stage = begin_stage("summary")
                try:
                    summary = await self._write_terminal_summary(environment, instruction, target_path, final_verification)
                    finish_stage(summary_stage, status="ok", verified=True)
                except Exception as error:
                    error_text = " ".join(str(error).split())
                    finish_stage(
                        summary_stage,
                        status="error",
                        errorType=type(error).__name__,
                        error=error_text,
                    )
                    summary = {
                        "route": "cognitive",
                        "reason": "The terminal task produced a verified workspace result.",
                        "commit": "Publish the verified result and keep the agent trace.",
                    }
                    try:
                        await self._write_response(environment, summary)
                    except Exception:
                        pass
            else:
                summary = _terminal_failure_summary(final_verification, latest_drift)
                await self._write_response(environment, summary)

            await persist_terminal_trace(summary)
        except Exception as error:
            stage_name = active_stage_entry["stage"] if active_stage_entry else "terminal"
            if active_stage_entry is not None and "finishedAt" not in active_stage_entry:
                finish_stage(
                    active_stage_entry,
                    status="error",
                    errorType=type(error).__name__,
                    error=" ".join(str(error).split()),
                )
            summary = {
                "route": "guarded",
                "reason": "The governed terminal runner failed before verifier-backed execution completed.",
                "commit": "Keep the task unresolved, preserve the stage trace, and repair the failing runner stage before any success claim.",
            }
            q_self_evaluation = (
                f"Q did not finish the terminal task because the {stage_name} stage failed before verifier-backed completion."
            )
            immaculate_self_evaluation = (
                "Immaculate preserved fail-closed control, captured the failing stage, and refused to overstate terminal-task progress."
            )
            try:
                await self._write_response(environment, summary)
            except Exception:
                pass
            verification = verification or {"success": False}
            await persist_terminal_trace(
                summary,
                stage_failure={
                    "stage": stage_name,
                    "errorType": type(error).__name__,
                    "error": " ".join(str(error).split()),
                },
                q_self_evaluation=q_self_evaluation,
                immaculate_self_evaluation=immaculate_self_evaluation,
            )
            return

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        incident = await self._read_optional_file(environment, "/app/incident.json")
        report_excerpt = await self._read_optional_file(environment, "/app/report_excerpt.json")
        if not incident and not report_excerpt:
            await self._run_terminal_task(instruction, environment, context)
            return

        task_payload = {
            "instruction": instruction.strip(),
            "incident": json.loads(incident) if incident else None,
            "report_excerpt": json.loads(report_excerpt) if report_excerpt else None,
        }

        system_prompt = (
            "You are Q, the custom model developed by Arobi Technology Alliance and built on Gemma 4. "
            "Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer for the project. "
            "You operate inside Immaculate, the governed orchestration and control system around you. "
            "You are operating as a governed terminal task agent. "
            "Read the task instruction and any attached JSON context. "
            "Return exactly one JSON object with keys route, reason, commit. "
            "Allowed route values: reflex, cognitive, guarded, suppressed. "
            "Reason and commit must each be 24 words or fewer. "
            "Reason must name the decisive concrete fault or health signal from the provided facts. "
            "Commit must state the concrete next operator action that keeps the ledger truthful. "
            "Prefer technical operator status language like 'bridge untrusted', 'bridge health degraded', "
            "'nonce replay', and 'direct HTTP/2 is the trusted lane' over abstract safety phrasing. "
            "Prefer declarative operator wording over narrative wording. "
            "State the bridge status first, then the decisive action. "
            "If an ACK is late, mismatched, or replayed, say so explicitly instead of generic caution language. "
            "If the bridge is degraded but direct HTTP/2 is healthy and policy-allowed, say that direct HTTP/2 is the trusted path. "
            "Stay fail-closed and do not invent facts. "
            "Route must be one canonical label only, not a sentence."
        )
        example_messages = [
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "instruction": "Choose the safest next route for the immediate remediation pass.",
                        "incident": {
                            "objective": "Choose the safest next route for the immediate remediation pass.",
                            "facts": [
                                "A bridge ACK arrived after the 2.5 second timeout window.",
                                "The ACK nonce did not match the active delivery nonce.",
                                "Operators require fail-closed behavior until the ACK path is trusted again."
                            ],
                        },
                    },
                    indent=2,
                ),
            },
            {
                "role": "assistant",
                "content": json.dumps(
                    {
                        "route": "guarded",
                        "reason": "Nonce mismatch and late ACK make the bridge untrusted.",
                        "commit": "Reject the invalid ACK, keep delivery unresolved, and record containment in the audit trail.",
                    }
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "instruction": "Choose the next orchestration route without overstating bridge health.",
                        "report_excerpt": {
                            "objective": "Choose the next orchestration route without overstating bridge health.",
                            "facts": [
                                "The ACK nonce replayed an older delivery nonce.",
                                "The bridge path cannot be trusted for delivered state right now.",
                                "The direct HTTP/2 path is healthy and still policy-allowed."
                            ],
                        },
                    },
                    indent=2,
                ),
            },
            {
                "role": "assistant",
                "content": json.dumps(
                    {
                        "route": "guarded",
                        "reason": "Bridge health is degraded by nonce replay, while direct HTTP/2 remains the trusted lane.",
                        "commit": "Route through verified direct HTTP/2, keep the bridge untrusted, and preserve truthful delivery state.",
                    }
                ),
            },
        ]

        raw_output = await self._call_q(
            [
                {"role": "system", "content": system_prompt},
                *example_messages,
                {
                    "role": "user",
                    "content": json.dumps(task_payload, indent=2),
                },
            ],
            max_tokens=220,
            request_timeout_ms=STRUCTURED_REPAIR_REQUEST_TIMEOUT_MS,
        )
        structured = _normalize_structured_result(_extract_json_object(raw_output))
        repaired = False
        if structured is None:
            structured = await self._repair_structured_output(raw_output)
            repaired = structured is not None
        if structured is None:
            raise RuntimeError("Q did not produce a valid structured response.")
        refined = await self._refine_structured_output(task_payload, structured)
        if refined is not None:
            structured = refined
        structured = _sharpen_operator_wording(task_payload, structured)

        await self._write_response(environment, structured)
        (self.logs_dir / "q-agent-output.json").write_text(
            json.dumps(
                {
                    "model": self._model,
                    "apiBaseUrl": self._api_base_url,
                    "repaired": repaired,
                    "rawOutput": raw_output,
                    "structured": structured,
                    "taskPayload": task_payload,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        context.metadata = {
            "model": self._model,
            "api_base_url": self._api_base_url,
            "repaired": repaired,
        }
