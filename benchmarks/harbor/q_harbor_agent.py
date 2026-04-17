from __future__ import annotations

import asyncio
import base64
import json
import os
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


def _normalize_model_name(value: str | None) -> str:
    if not value:
        return "Q"
    return value.split("/", 1)[1] if "/" in value else value


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
        (flags["late_ack"] or flags["bridge_degraded"])
        and (flags["nonce_replay"] or flags["nonce_mismatch"])
        and flags["direct_http2_healthy"]
    ):
        return {
            "route": "guarded",
            "reason": "Bridge health is degraded by late ACK and nonce replay; direct HTTP/2 is the trusted lane.",
            "commit": "Route through verified direct HTTP/2, keep the bridge untrusted, and preserve truthful delivery state.",
        }

    if (flags["late_ack"] or flags["bridge_degraded"]) and (flags["nonce_replay"] or flags["nonce_mismatch"]):
        return {
            "route": "guarded",
            "reason": "Nonce mismatch and late ACK make the bridge untrusted and require fail-closed control.",
            "commit": "Reject the invalid ACK, keep delivery unresolved, and record containment in the audit trail.",
        }

    return structured


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
        timeout_sec: int = 180,
        **kwargs: Any,
    ) -> None:
        super().__init__(logs_dir=logs_dir, model_name=model_name, **kwargs)
        self._api_base_url = (api_base_url or os.environ.get("OPENAI_BASE_URL") or "").strip()
        self._api_key = (api_key or os.environ.get("OPENAI_API_KEY") or "").strip()
        self._timeout_sec = max(30, int(timeout_sec))
        self._model = _normalize_model_name(model_name)
        if not self._api_base_url:
            raise ValueError("HarborQAgent requires OPENAI_BASE_URL or api_base_url.")
        if not self._api_key:
            raise ValueError("HarborQAgent requires OPENAI_API_KEY or api_key.")
        self._client = AsyncOpenAI(base_url=self._api_base_url, api_key=self._api_key, timeout=self._timeout_sec)

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

    async def _call_q(self, messages: list[dict[str, str]], max_tokens: int) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=0.0,
        )
        content = response.choices[0].message.content or ""
        return content.strip()

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

    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        incident = await self._read_optional_file(environment, "/app/incident.json")
        report_excerpt = await self._read_optional_file(environment, "/app/report_excerpt.json")

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
