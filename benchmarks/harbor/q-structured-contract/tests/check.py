import json
from pathlib import Path

import rewardkit as rk
from rewardkit import criterion


ALLOWED_ROUTES = {"reflex", "cognitive", "guarded", "suppressed"}
ANCHORS = ("ack", "nonce", "timeout", "fail", "audit")


def _load_response(workspace: Path) -> dict | None:
    path = workspace / "response.json"
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return value if isinstance(value, dict) else None


@criterion
def response_json_shape(workspace: Path) -> float:
    response = _load_response(workspace)
    if response is None:
        return 0.0
    score = 0.0
    if set(response.keys()) == {"route", "reason", "commit"}:
        score += 0.4
    route = str(response.get("route", "")).strip().lower()
    if route in ALLOWED_ROUTES:
        score += 0.2
    if str(response.get("reason", "")).strip():
        score += 0.2
    if str(response.get("commit", "")).strip():
        score += 0.2
    return min(score, 1.0)


@criterion
def response_json_bounds(workspace: Path) -> float:
    response = _load_response(workspace)
    if response is None:
        return 0.0
    score = 0.0
    for field in ("reason", "commit"):
        value = str(response.get(field, "")).strip()
        if value and len(value.split()) <= 24:
            score += 0.5
    return score


@criterion
def response_mentions_core_facts(workspace: Path) -> float:
    response = _load_response(workspace)
    if response is None:
        return 0.0
    text = " ".join(
        [
            str(response.get("route", "")),
            str(response.get("reason", "")),
            str(response.get("commit", "")),
        ]
    ).lower()
    hits = sum(1 for anchor in ANCHORS if anchor in text)
    return min(1.0, hits / 3.0)


rk.file_exists("response.json", weight=1.0)
rk.response_json_shape(weight=3.0)
rk.response_json_bounds(weight=2.0)
rk.response_mentions_core_facts(weight=1.0)
