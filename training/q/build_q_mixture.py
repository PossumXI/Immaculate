import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


def iter_jsonl(path_value: Path):
    with path_value.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)


def iter_json(path_value: Path):
    payload = json.loads(path_value.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield item


def sha256_file(path_value: Path) -> str:
    digest = hashlib.sha256()
    with path_value.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def load_records(path_value: Path) -> list[dict]:
    iterator: Iterable[dict]
    iterator = iter_jsonl(path_value) if path_value.suffix.lower() == ".jsonl" else iter_json(path_value)
    return [record for record in iterator if isinstance(record, dict)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="Base shaped JSONL dataset")
    parser.add_argument(
        "--supplemental",
        action="append",
        required=True,
        help="Supplemental JSON or JSONL dataset. Pass more than once to blend multiple seed sets.",
    )
    parser.add_argument("--output", required=True, help="Combined output JSONL path")
    parser.add_argument(
        "--manifest-output",
        help="Optional JSON sidecar manifest path. Defaults to <output stem>.manifest.json.",
    )
    args = parser.parse_args()

    base_path = Path(args.base)
    supplemental_paths = [Path(value) for value in args.supplemental]
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_output_path = (
        Path(args.manifest_output)
        if args.manifest_output
        else output_path.with_name(f"{output_path.stem}.manifest.json")
    )

    seen = set()
    rows = []
    skipped_duplicates = 0
    base_records = load_records(base_path)
    base_accepted_count = 0

    for record in base_records:
        text = str(record.get("text", "")).strip()
        if not text or text in seen:
            if text in seen:
                skipped_duplicates += 1
            continue
        seen.add(text)
        rows.append(record)
        base_accepted_count += 1

    supplemental_summaries = []
    for supplemental_path in supplemental_paths:
        supplemental_records = load_records(supplemental_path)
        accepted_count = 0
        for record in supplemental_records:
            text = str(record.get("text", "")).strip()
            if not text or text in seen:
                if text in seen:
                    skipped_duplicates += 1
                continue
            seen.add(text)
            tags = record.get("tags", record.get("labels", ["q", "supplemental"]))
            rows.append(
                {
                    "text": text,
                    "source_id": record.get("source_id", supplemental_path.stem),
                    "relative_path": record.get("relative_path", record.get("id", supplemental_path.stem)),
                    "language": record.get("language", "text"),
                    "tags": tags,
                    "provenance_record_id": record.get("provenance_record_id", record.get("id")),
                }
            )
            accepted_count += 1
        supplemental_summaries.append(
            {
                "path": str(supplemental_path),
                "row_count": len(supplemental_records),
                "accepted_row_count": accepted_count,
                "sha256": sha256_file(supplemental_path),
            }
        )

    with output_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "base": {
            "path": str(base_path),
            "row_count": len(base_records),
            "accepted_row_count": base_accepted_count,
            "sha256": sha256_file(base_path),
        },
        "supplemental": supplemental_summaries,
        "output": {
            "path": str(output_path),
            "row_count": len(rows),
            "sha256": sha256_file(output_path),
        },
        "dedup": {
            "skipped_duplicates": skipped_duplicates,
        },
    }
    manifest_output_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    result = {
        "accepted": True,
        "base": str(base_path),
        "supplemental": [str(path_value) for path_value in supplemental_paths],
        "rows": len(rows),
        "output": str(output_path),
        "manifest_output": str(manifest_output_path),
    }
    print(
        json.dumps(
            result,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
