import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


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


def relative_path(root: Path, path_value: Path | None) -> str | None:
    if path_value is None:
        return None
    try:
        return str(path_value.resolve().relative_to(root.resolve())).replace("\\", "/")
    except ValueError:
        return str(path_value.resolve()).replace("\\", "/")


def load_json(path_value: Path) -> dict:
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path_value} must contain a JSON object.")
    return payload


def save_json(path_value: Path, payload: dict) -> None:
    path_value.parent.mkdir(parents=True, exist_ok=True)
    path_value.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    root = repo_root()
    parser = argparse.ArgumentParser(description="Build a Cloudflare eval bundle from the tracked Q benchmark corpus.")
    parser.add_argument("session_path", nargs="?", help="Optional positional hybrid session manifest JSON for npm wrapper compatibility.")
    parser.add_argument("--session", help="Optional hybrid session manifest JSON.")
    parser.add_argument("--source-jsonl", help="Optional benchmark corpus JSONL path.")
    parser.add_argument("--output-dir", help="Optional output directory.")
    parser.add_argument("--limit", type=int, default=24, help="Maximum number of eval rows to emit.")
    args = parser.parse_args()

    session_arg = args.session_path or args.session
    session_path = resolve_repo_path(session_arg) if session_arg else None
    session = load_json(session_path) if session_path and session_path.exists() else {}
    session_id = str(session.get("sessionId", "")).strip() or "standalone"

    source_jsonl = resolve_repo_path(args.source_jsonl) or (root / ".training-output" / "q" / "q-benchmark-corpus.jsonl")
    if source_jsonl is None or not source_jsonl.exists():
        raise FileNotFoundError("Cloudflare eval bundle requires the tracked Q benchmark corpus JSONL.")

    output_dir = resolve_repo_path(args.output_dir) or (root / ".training-output" / "q" / "cloudflare" / session_id / "eval")
    output_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = output_dir / "cloudflare-q-eval-bundle.jsonl"
    manifest_path = output_dir / "cloudflare-q-eval-bundle.json"

    records: list[dict] = []
    with source_jsonl.open("r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            payload = json.loads(line)
            if not isinstance(payload, dict):
                continue
            objective = str(payload.get("objective", "")).strip() or str(payload.get("label", "")).strip() or "Q task"
            facts = payload.get("facts")
            fact_lines = [str(entry).strip() for entry in facts] if isinstance(facts, list) else []
            request_text = "\n".join(
                part
                for part in [
                    f"Objective: {objective}",
                    "Return a strict Q response with route, reason, and commit.",
                    f"Facts: {'; '.join(fact_lines)}" if fact_lines else "",
                ]
                if part
            )
            records.append(
                {
                    "id": payload.get("id"),
                    "model": "Q",
                    "messages": [{"role": "user", "content": request_text}],
                    "metadata": {
                        "surface": str(payload.get("source_surface", "benchmark")),
                        "rowId": str(payload.get("row_id", payload.get("id", "unknown"))),
                        "session": session_id,
                        "quality": str(payload.get("quality", {}).get("status", "unknown")) if isinstance(payload.get("quality"), dict) else "unknown",
                    },
                    "reference": payload.get("output"),
                }
            )
            if len(records) >= max(args.limit, 1):
                break

    with jsonl_path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record) + "\n")

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sessionId": session_id,
        "sourceJsonlPath": relative_path(root, source_jsonl),
        "recordCount": len(records),
        "limit": max(args.limit, 1),
        "output": {
            "jsonlPath": relative_path(root, jsonl_path),
            "manifestPath": relative_path(root, manifest_path),
        },
    }
    save_json(manifest_path, manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
