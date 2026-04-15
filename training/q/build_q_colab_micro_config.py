import argparse
import json
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
    parser = argparse.ArgumentParser(description="Build a bounded Colab-ready Q micro-train config from the tracked session config.")
    parser.add_argument("--config", required=True, help="Path to the tracked Q LoRA config JSON.")
    parser.add_argument("--output", required=True, help="Output path for the Colab micro config JSON.")
    parser.add_argument("--tag", default="colab-free", help="Suffix tag to append to the run name.")
    parser.add_argument("--max-steps", type=int, default=24, help="Maximum train steps for the bounded Colab run.")
    parser.add_argument("--max-seq-length", type=int, default=2048, help="Maximum sequence length for the bounded Colab run.")
    parser.add_argument(
        "--gradient-accumulation-steps",
        type=int,
        default=8,
        help="Gradient accumulation steps for the bounded Colab run.",
    )
    parser.add_argument(
        "--output-dir",
        help="Optional output directory override for the bounded Colab run.",
    )
    parser.add_argument(
        "--disable-wandb",
        action="store_true",
        help="Drop report_to integrations for a secrets-light Colab run.",
    )
    args = parser.parse_args()

    config_path = resolve_repo_path(args.config)
    output_path = resolve_repo_path(args.output)
    if config_path is None or not config_path.exists():
        raise FileNotFoundError(f"Config not found: {args.config}")
    if output_path is None:
        raise ValueError("Output path could not be resolved.")

    config = load_json(config_path)
    run_name = str(config.get("run_name", "q-colab")).strip() or "q-colab"
    tag = str(args.tag).strip() or "colab-free"
    micro_run_name = run_name if run_name.endswith(tag) else f"{run_name}-{tag}"
    output_dir = args.output_dir or str(root / ".training-output" / "q" / "runs" / micro_run_name)

    micro_config = dict(config)
    micro_config["run_name"] = micro_run_name
    micro_config["output_dir"] = output_dir
    micro_config["max_seq_length"] = min(int(config.get("max_seq_length", args.max_seq_length)), args.max_seq_length)
    micro_config["gradient_accumulation_steps"] = args.gradient_accumulation_steps
    micro_config["max_steps"] = args.max_steps
    micro_config["logging_steps"] = min(int(config.get("logging_steps", 10)), 5)
    micro_config["save_steps"] = args.max_steps
    micro_config["colab_micro_profile"] = {
        "enabled": True,
        "tag": tag,
        "maxSteps": args.max_steps,
        "maxSeqLength": micro_config["max_seq_length"],
        "gradientAccumulationSteps": args.gradient_accumulation_steps,
    }
    if args.disable_wandb:
        micro_config["report_to"] = []

    save_json(output_path, micro_config)
    print(
        json.dumps(
            {
                "generated": True,
                "configPath": str(config_path.resolve()),
                "outputPath": str(output_path.resolve()),
                "runName": micro_run_name,
                "outputDir": output_dir,
                "maxSteps": args.max_steps,
                "maxSeqLength": micro_config["max_seq_length"],
                "wandbDisabled": args.disable_wandb,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
