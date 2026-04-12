#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from typing import Any, Dict, List, Optional


def emit(obj: Dict[str, Any], *, stream=sys.stdout) -> None:
    print(json.dumps(obj, separators=(",", ":"), ensure_ascii=False), file=stream, flush=True)


def status(reason: str, **extra: Any) -> None:
    emit({"type": "status", "available": False, "reason": reason, **extra}, stream=sys.stderr)


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


def resolve_value(args: argparse.Namespace, info: Any) -> bool:
    if args.source_id:
        try:
            source_id = info.source_id() or info.uid() or info.name() or ""
            if source_id == args.source_id:
                return True
        except Exception:
            pass
    if args.uid:
        try:
            source_id = info.source_id() or info.uid() or ""
            if source_id == args.uid:
                return True
        except Exception:
            pass
    if args.name:
        try:
            if info.name() == args.name:
                return True
        except Exception:
            pass
    if not args.uid and not args.name:
        return True
    return False


def chunk_sync_jitter_ms(timestamps: List[float], rate_hz: Optional[float]) -> float:
    if len(timestamps) < 2 or not rate_hz or rate_hz <= 0:
        return 0.0
    observed = timestamps[-1] - timestamps[0]
    expected = (len(timestamps) - 1) / rate_hz
    return abs(observed - expected) * 1000.0


def main() -> int:
    parser = argparse.ArgumentParser(description="Connect to an LSL stream and emit NDJSON LiveNeuroPayload rows.")
    parser.add_argument("--source-id")
    parser.add_argument("--uid")
    parser.add_argument("--name")
    parser.add_argument("--label")
    parser.add_argument("--session-id")
    parser.add_argument("--kind")
    parser.add_argument("--rate-hz", type=float)
    parser.add_argument("--window-size", type=int, default=16)
    parser.add_argument("--pull-timeout-ms", type=int, default=250)
    parser.add_argument("--max-rows", type=int, default=0)
    parser.add_argument("--connect-timeout-ms", type=int, default=5000)
    args = parser.parse_args()

    try:
        from pylsl import resolve_streams, StreamInlet
    except Exception as exc:  # pragma: no cover - dependency guard
        status("pylsl-missing", message=str(exc))
        return 0

    wait_time = max(args.connect_timeout_ms, 0) / 1000.0
    try:
        infos = resolve_streams(wait_time=wait_time)
    except Exception as exc:  # pragma: no cover - runtime guard
        status("lsl-resolution-failed", message=str(exc))
        return 0

    selected = None
    for info in infos:
        if resolve_value(args, info):
            selected = info
            break

    if selected is None:
        status("lsl-stream-not-found", requestedSourceId=args.source_id or args.uid or args.name or "unknown")
        return 0

    try:
        inlet = StreamInlet(selected, max_buflen=math.ceil(max(args.window_size, 1) * 4), recover=True)
    except Exception as exc:  # pragma: no cover - runtime guard
        status("lsl-inlet-open-failed", message=str(exc))
        return 0

    try:
        source_id = selected.source_id() or selected.uid() or args.source_id or args.uid or args.name or "lsl-source"
    except Exception:
        source_id = args.source_id or args.uid or args.name or "lsl-source"

    try:
        name = selected.name() or args.label or source_id
    except Exception:
        name = args.label or source_id

    try:
        nominal_rate = float(selected.nominal_srate())
        if nominal_rate <= 0:
            nominal_rate = None
    except Exception:
        nominal_rate = args.rate_hz if args.rate_hz and args.rate_hz > 0 else None

    try:
        channels = int(selected.channel_count())
    except Exception:
        channels = None

    emit({
        "type": "status",
        "available": True,
        "reason": "connected",
        "sourceId": source_id,
        "name": name,
        "kind": stream_kind(getattr(selected, "type", lambda: None)(), name),
    }, stream=sys.stderr)

    emitted = 0
    pull_timeout = max(args.pull_timeout_ms, 0) / 1000.0
    window_size = max(args.window_size, 1)

    while True:
        try:
            samples, timestamps = inlet.pull_chunk(timeout=pull_timeout, max_samples=window_size)
        except Exception as exc:  # pragma: no cover - runtime guard
            status("lsl-pull-failed", message=str(exc), sourceId=source_id)
            return 0

        if not samples:
            continue

        normalized_samples = [[float(value) for value in row] for row in samples]
        timestamp = None
        if timestamps:
            timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(timestamps[0]))
            if "." not in timestamp:
                timestamp = f"{timestamp}.000Z"
        if timestamp is None:
            timestamp = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())

        payload = {
            "sourceId": source_id,
            "label": args.label or name,
            "sessionId": args.session_id,
            "kind": stream_kind(args.kind or getattr(selected, "type", lambda: None)(), name),
            "rateHz": args.rate_hz if args.rate_hz and args.rate_hz > 0 else nominal_rate,
            "syncJitterMs": round(chunk_sync_jitter_ms(timestamps, nominal_rate), 3),
            "timestamp": timestamp,
            "samples": normalized_samples,
            "channels": channels or (len(normalized_samples[0]) if normalized_samples and normalized_samples[0] else 1),
        }
        emit(payload)
        emitted += 1
        if args.max_rows > 0 and emitted >= args.max_rows:
            break

    emit({"type": "status", "available": True, "reason": "completed", "sourceId": source_id}, stream=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
