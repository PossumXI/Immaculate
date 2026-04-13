import argparse
import json
from pathlib import Path


def build_text_record(row: dict) -> dict:
    prefix = "Q defensive engineering corpus"
    source = row.get("sourceId", "unknown-source")
    language = row.get("language", "text")
    path_value = row.get("relativePath", "unknown-path")
    tags = ", ".join(row.get("tags", []))
    content = row.get("content", "")
    text = (
        f"{prefix}\n"
        f"source={source}\n"
        f"language={language}\n"
        f"path={path_value}\n"
        f"tags={tags}\n\n"
        f"{content}"
    )
    return {
        "text": text,
        "source_id": source,
        "relative_path": path_value,
        "language": language,
        "tags": row.get("tags", []),
        "provenance_record_id": row.get("provenanceRecordId"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Curated JSONL from the Immaculate training-data factory")
    parser.add_argument("--output", required=True, help="Output JSONL with plain text records for QLoRA/CPT")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    row_count = 0
    with input_path.open("r", encoding="utf-8") as source_file, output_path.open(
        "w", encoding="utf-8"
    ) as destination_file:
        for line in source_file:
            line = line.strip()
            if not line:
                continue
            record = build_text_record(json.loads(line))
            destination_file.write(json.dumps(record, ensure_ascii=True) + "\n")
            row_count += 1

    print(json.dumps({"accepted": True, "rows": row_count, "output": str(output_path)}, indent=2))


if __name__ == "__main__":
    main()
