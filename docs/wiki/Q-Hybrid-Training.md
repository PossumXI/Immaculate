# Q Hybrid Training

This page records the current Q training state in plain English. It ties the live Q fine-tune lock and the paired Immaculate orchestration bundle together, then says clearly where the cloud lane is still blocked.

- Generated: `2026-04-16T18:56:30Z`
- Release: `0.1.0+2384cf5`
- Session id: `q-hybrid-harbor-opt-2384cf5`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-2384cf5-57097d65`
- Dataset rows: `31`
- Immaculate orchestration bundle: `immaculate-orchestration-2384cf5-497211ed`
- HF Jobs training surface: `docs/wiki/HF-Jobs-Training.md`

## Plain English Status

- Local lane: `ready` in mode `dry-run`
- Cloud lane: `not-configured` on provider `hf_jobs` in mode `launch`
- Hugging Face token path ready: `True` via `HF_TOKEN`
- W&B mode for the current session: `offline`

## Q Fine-Tune Lane

- Training lock: `.training-output/q/latest-training-lock.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5.json`
- Dataset: `.training-output/q/q-mix-longctx-harbor-opt-2384cf5.jsonl`
- Mix manifest: `.training-output/q/q-mix-longctx-harbor-opt-2384cf5.manifest.json`
- Curation run: `not present in this checkout`
- Benchmark corpus: `docs/wiki/Q-Benchmark-Corpus.json`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus records: `19`
- Failure corpus: `docs/wiki/Q-Failure-Corpus.json`
- Failure corpus records: `3`
- Local dry-run command: `python training/q/train_q_lora_unsloth.py --config .training-output/q/q-lora-config-harbor-opt-2384cf5.json --dry-run`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-harbor-opt-2384cf5.json`
- Signal count: `14`
- This lane improves Immaculate through current Harbor, BridgeBench, model-comparison, gateway-validation, and readiness-gate evidence while keeping Q as the only model-training lane.

## Cloud Lane

- Session manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5/hybrid-session.manifest.json`
- Cloud bundle: `not staged for the harbor-opt session in this checkout`
- Auth env file: `C:/Users/Knight/Desktop/cheeks/Asgard/.env`
- Blocker: `The hybrid session controller requires a concrete curation-run artifact to materialize a staged cloud bundle, and that artifact is not present in this checkout.`
- Last authenticated HF Jobs page: `docs/wiki/HF-Jobs-Training.md`

## Truth Boundary

- The current harbor-opt Q lock is real and current in this checkout.
- The current Immaculate orchestration bundle is real and current in this checkout.
- No cloud fine-tune, staged harbor-opt cloud bundle, or OCI launch is claimed from this page.
- The HF Jobs page remains useful as the last authenticated cloud-path proof, but it is not the active harbor-opt session bundle.
