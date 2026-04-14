import argparse
import json
from pathlib import Path

def load_config(path_value: str) -> dict:
    return json.loads(Path(path_value).read_text(encoding="utf-8"))


def inspect_jsonl_dataset(path_value: str) -> tuple[int, list[str]]:
    columns = set()
    row_count = 0
    with Path(path_value).open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            if isinstance(payload, dict):
                columns.update(str(key) for key in payload.keys())
            row_count += 1
    return row_count, sorted(columns)


def load_training_lock(path_value: str | None) -> dict | None:
    if not path_value:
        return None
    return json.loads(Path(path_value).read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to the Q LoRA training config JSON")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate config and dataset shape without starting a training run",
    )
    args = parser.parse_args()

    config = load_config(args.config)
    dataset_path = config.get("train_dataset_path") or config.get("curated_dataset_path")
    if not dataset_path:
        raise ValueError("Config requires train_dataset_path or curated_dataset_path.")
    training_lock = load_training_lock(config.get("training_lock_path"))

    row_count, column_names = inspect_jsonl_dataset(dataset_path)
    if "text" not in column_names:
        raise ValueError(
            "Training dataset must already contain a text field. "
            "Run build_q_text_dataset.py and build_q_mixture.py before training."
        )
    if training_lock:
        locked_dataset_path = training_lock.get("run", {}).get("trainDatasetPath")
        if locked_dataset_path and str(Path(locked_dataset_path).resolve()) != str(Path(dataset_path).resolve()):
            raise ValueError("training_lock_path does not match train_dataset_path.")
        locked_base_model = training_lock.get("run", {}).get("baseModel")
        if locked_base_model and locked_base_model != config.get("base_model"):
            raise ValueError("training_lock_path does not match base_model.")

    if args.dry_run:
        print(
            json.dumps(
                {
                    "accepted": True,
                    "dry_run": True,
                    "run_name": config["run_name"],
                    "alias_name": config["alias_name"],
                    "train_dataset_path": dataset_path,
                    "row_count": row_count,
                    "columns": column_names,
                    "training_lock_path": config.get("training_lock_path"),
                    "training_bundle_id": training_lock.get("bundleId") if training_lock else None,
                },
                indent=2,
            )
        )
        return

    from datasets import load_dataset
    from transformers import TrainingArguments
    from trl import SFTTrainer
    from unsloth import FastModel

    dataset = load_dataset("json", data_files=dataset_path, split="train")

    model, tokenizer = FastModel.from_pretrained(
        model_name=config["base_model"],
        max_seq_length=config["max_seq_length"],
        load_in_4bit=True,
    )

    model = FastModel.get_peft_model(
        model,
        r=config["lora_rank"],
        lora_alpha=config["lora_alpha"],
        lora_dropout=config["lora_dropout"],
        target_modules=config["target_modules"],
        bias="none",
        modules_to_save=config["modules_to_save"],
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        args=TrainingArguments(
            output_dir=config["output_dir"],
            per_device_train_batch_size=config["per_device_train_batch_size"],
            gradient_accumulation_steps=config["gradient_accumulation_steps"],
            num_train_epochs=config["num_train_epochs"],
            learning_rate=config["learning_rate"],
            warmup_ratio=config["warmup_ratio"],
            lr_scheduler_type=config["lr_scheduler_type"],
            bf16=config.get("bf16", True),
            logging_steps=config["logging_steps"],
            save_steps=config["save_steps"],
            report_to=config.get("report_to", []),
        ),
    )
    trainer.train()
    model.save_pretrained(config["output_dir"])
    print(
        json.dumps(
            {
                "accepted": True,
                "run_name": config["run_name"],
                "alias_name": config["alias_name"],
                "train_dataset_path": dataset_path,
                "output_dir": config["output_dir"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
