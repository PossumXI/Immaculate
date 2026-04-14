import json
import os
from pathlib import Path

from openai import AsyncOpenAI

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


def _normalize_model_name(model_name: str | None) -> str:
    if not model_name:
        return "Q"
    value = model_name.strip()
    if "/" in value:
        value = value.split("/", 1)[1]
    if ":" in value and value.lower().startswith("openai:"):
        value = value.split(":", 1)[1]
    return value or "Q"


def _extract_text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for entry in content:
            if isinstance(entry, dict) and isinstance(entry.get("text"), str):
                parts.append(entry["text"])
        return "\n".join(parts)
    return ""


def _normalize_words(value: str, max_words: int = 24) -> str:
    return " ".join(value.replace("\n", " ").split()[:max_words]).strip()


def _parse_payload_text(raw_text: str) -> dict:
    try:
        parsed = json.loads(raw_text)
    except Exception:
        return {"raw": raw_text.strip()}
    return parsed if isinstance(parsed, dict) else {"raw": raw_text.strip()}


def _flatten_value(value: object) -> str:
    if isinstance(value, list):
        return " | ".join(str(entry).strip() for entry in value if str(entry).strip())
    if isinstance(value, dict):
        return " | ".join(f"{key}={value[key]}" for key in sorted(value))
    return str(value).strip()


def _build_prompt(payload: dict, instruction: str) -> str:
    objective = str(payload.get("objective") or instruction).strip()
    governance = str(payload.get("governancePressure") or "clear").strip()
    facts = _flatten_value(payload.get("facts") or [])
    constraints = _flatten_value(payload.get("constraints") or [])
    extras = []
    for key in ("surface", "scenarioId", "incidentId", "transportHealth"):
        if key in payload:
            extras.append(f"{key}={_flatten_value(payload[key])}")

    lines = [
        "Immaculate live cognition pass.",
        "Return exactly:",
        "ROUTE: guarded or reflex or cognitive or suppressed",
        "REASON: one sentence, max 18 words.",
        "COMMIT: one sentence, max 18 words.",
        "No bullets. No preamble. No extra sections.",
        "",
        f"objective={objective}",
        f"GOVERNANCE: {governance} pressure | 0 denials (5 min window)",
        f"facts={facts or 'none'}",
        f"constraints={constraints or 'none'}",
        f"context={_flatten_value(extras) if extras else 'none'}",
        "events=none",
    ]
    return "\n".join(lines)


def _extract_structured_line(raw_text: str, field: str) -> str | None:
    token = f"{field}:"
    lines = [line.strip() for line in raw_text.replace("\r", "\n").split("\n") if line.strip()]
    for line in reversed(lines):
        if line.upper().startswith(token):
            return line[len(token) :].strip()
    upper = raw_text.upper()
    marker = f"{field}:"
    index = upper.rfind(marker)
    if index < 0:
        return None
    tail = raw_text[index + len(marker) :]
    segment = tail.split("\n", 1)[0].strip()
    return segment or None


def _normalize_route(value: str | None) -> str:
    candidate = (value or "").strip().lower()
    for route in ("guarded", "reflex", "cognitive", "suppressed"):
        if route in candidate:
            return route
    raise ValueError(f"Q agent returned an unsupported route line: {value!r}")


def _extract_structured_payload(raw_text: str) -> dict[str, str]:
    route_line = _extract_structured_line(raw_text, "ROUTE")
    reason_line = _extract_structured_line(raw_text, "REASON")
    commit_line = _extract_structured_line(raw_text, "COMMIT")
    if not route_line or not reason_line or not commit_line:
        raise ValueError("Q agent did not return complete ROUTE/REASON/COMMIT lines.")
    return {
        "route": _normalize_route(route_line),
        "reason": _normalize_words(reason_line),
        "commit": _normalize_words(commit_line),
    }


class QGatewayAgent(BaseAgent):
    @staticmethod
    def name() -> str:
        return "q-gateway-agent"

    def version(self) -> str:
        return "0.1.0"

    async def setup(self, environment: BaseEnvironment) -> None:
        return

    async def _read_context_payload(self, environment: BaseEnvironment) -> tuple[str, str]:
        for candidate in ("/app/incident.json", "/app/report_excerpt.json"):
            result = await environment.exec(f"bash -lc 'if [ -f {candidate} ]; then cat {candidate}; fi'")
            if result.return_code == 0 and result.stdout and result.stdout.strip():
                return candidate, result.stdout.strip()
        raise FileNotFoundError("No supported Harbor task payload was found in /app.")

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        payload_path, payload_text = await self._read_context_payload(environment)
        prompt = _build_prompt(_parse_payload_text(payload_text), instruction.strip())

        client = AsyncOpenAI(
            api_key=os.environ["OPENAI_API_KEY"],
            base_url=os.environ["OPENAI_API_BASE"],
            max_retries=0,
        )
        response = await client.chat.completions.create(
            model=_normalize_model_name(self.model_name),
            temperature=0.1,
            max_tokens=96,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are Q, the reasoner cognition layer inside Immaculate. "
                        "Convert state into strict ROUTE, REASON, COMMIT lines."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )

        raw_text = _extract_text_content(response.choices[0].message.content)
        payload = _extract_structured_payload(raw_text)

        output_path = self.logs_dir / "response.json"
        output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        await environment.upload_file(output_path, "/app/response.json")

        context.n_input_tokens = response.usage.prompt_tokens if response.usage else None
        context.n_output_tokens = response.usage.completion_tokens if response.usage else None
        context.metadata = {
            "model": _normalize_model_name(self.model_name),
            "payloadPath": payload_path,
            "response": payload,
        }
