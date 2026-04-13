import argparse
import json
from pathlib import Path

from datasets import load_dataset
from transformers import TrainingArguments
from trl import SFTTrainer
from unsloth import FastModel


def load_config(path_value: str) -> dict:
    return json.loads(Path(path_value).read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, help="Path to the Q LoRA training config JSON")
    args = parser.parse_args()

    config = load_config(args.config)
    dataset = load_dataset("json", data_files=config["curated_dataset_path"], split="train")

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
                "output_dir": config["output_dir"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
