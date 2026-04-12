#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, List, Optional


def emit(obj: Dict[str, Any], *, stream=sys.stdout) -> None:
    print(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), file=stream, flush=True)


def stream_kind(stream_type: Optional[str], name: Optional[str]) -> str:
    candidate = f"{stream_type or ''} {name or ''}".lower()
    if "eeg" in candidate:
        return "electrical-series"
    if "lfp" in candidate:
        return "lfp-series"
    if "spike" in candidate:
        return "spike-series"
    if "audio" in candidate:
        return "timeseries"
    return "timeseries"


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover LSL streams and emit NDJSON records.")
    parser.add_argument("--timeout-ms", type=int, default=1500)
    parser.add_argument("--limit", type=int, default=64)
    args = parser.parse_args()

    try:
        from pylsl import resolve_streams
    except Exception as exc:  # pragma: no cover - dependency guard
        emit({
            "type": "status",
            "available": False,
            "reason": "pylsl-missing",
            "message": str(exc),
        })
        return 0

    wait_time = max(args.timeout_ms, 0) / 1000.0
    try:
        infos = resolve_streams(wait_time=wait_time)
    except Exception as exc:  # pragma: no cover - runtime guard
        emit({
            "type": "status",
            "available": False,
            "reason": "lsl-discovery-failed",
            "message": str(exc),
        })
        return 0

    count = 0
    for index, info in enumerate(infos):
        if count >= args.limit:
            break
        try:
            channel_count = int(info.channel_count())
        except Exception:
            channel_count = None
        try:
            rate_hz = float(info.nominal_srate())
            if rate_hz <= 0:
                rate_hz = None
        except Exception:
            rate_hz = None

        try:
            uid = info.source_id() or info.uid() or None
        except Exception:
            uid = None

        try:
            name = info.name() or f"stream-{index}"
        except Exception:
            name = f"stream-{index}"

        try:
            stream_type = info.type() or None
        except Exception:
            stream_type = None

        try:
            session_id = info.session_id() or None
        except Exception:
            session_id = None

        emit({
            "type": "stream",
            "sourceId": uid or f"{name}-{index}",
            "uid": uid,
            "name": name,
            "sessionId": session_id,
            "kind": stream_kind(stream_type, name),
            "rateHz": rate_hz,
            "channelCount": channel_count,
            "description": stream_type,
        })
        count += 1

    emit({
        "type": "summary",
        "available": True,
        "count": count,
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
