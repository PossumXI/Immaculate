# Q Training Bundle

`Q` is the truthful Immaculate alias for the local Gemma 4 base model used in the current harness path.

The goal of this folder is not to pretend the fine-tune already happened.
It gives the repo a reproducible bridge from:

1. manifest-first curation
2. curated JSONL output
3. text-dataset shaping
4. cloud or local Unsloth QLoRA launch

## Suggested Flow

1. Create or refresh a corpus run:

```powershell
npm run training-data:curate -- fixtures/training/q-defsec-curation.example.json
```

2. Build a plain-text training dataset from the curated run:

```powershell
python training/q/build_q_text_dataset.py --input .training-output/training-data/runs/<run-id>/curated.jsonl --output .training-output/q/q-train.jsonl
```

3. Copy `q_lora_config.example.json` and adjust paths.
4. Launch `train_q_lora_unsloth.py` on a GPU instance with the required Python packages installed.

## Truth Boundary

- This bundle keeps the training path inside the same provenance and secret-scanning discipline as the rest of Immaculate.
- It does not certify licenses or export-control posture by itself.
- It does not replace evaluation, red-team review, or legal review.

## Adopted Working Policy

The current `Q` training path intentionally keeps only the parts of the larger
defensive-security fine-tuning plan that this repo can enforce directly today:

- manifest-first dataset intake instead of blind scraping
- permissive-license allowlisting plus explicit review-state licenses
- best-effort secret scanning before records become training shards
- provenance chain hashes on curated outputs
- no deliberate inclusion of proprietary-LLM-generated outputs in the tracked
  example corpus path
- a QLoRA-style launch surface for `Q` through the Unsloth training entrypoint

The repo does **not** currently claim that every legal, export-control, or
insurance diligence requirement from the broader plan is already satisfied. It
only claims the policy surfaces that are actually implemented here.
