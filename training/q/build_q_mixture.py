import argparse
import json
from pathlib import Path


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
    args = parser.parse_args()

    base_path = Path(args.base)
    supplemental_paths = [Path(value) for value in args.supplemental]
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    seen = set()
    rows = []

    for record in iter_jsonl(base_path):
        text = str(record.get("text", "")).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        rows.append(record)

    for supplemental_path in supplemental_paths:
        supplemental_iter = iter_jsonl(supplemental_path) if supplemental_path.suffix.lower() == ".jsonl" else iter_json(supplemental_path)
        for record in supplemental_iter:
            text = str(record.get("text", "")).strip()
            if not text or text in seen:
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

    with output_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")

    print(
        json.dumps(
            {
                "accepted": True,
                "base": str(base_path),
                "supplemental": [str(path_value) for path_value in supplemental_paths],
                "rows": len(rows),
                "output": str(output_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
