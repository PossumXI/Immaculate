# Q Hybrid Training

This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.

- Generated: `2026-04-18T02:39:32Z`
- Release: `0.1.0+35ab7e8`
- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v16`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa`
- Dataset rows: `109`
- Immaculate orchestration bundle: `immaculate-orchestration-35ab7e8-ec4b3cb6`
- HF Jobs training surface: `docs/wiki/HF-Jobs-Training.md`
- Colab free training surface: `docs/wiki/Colab-Free-Training.md`
- OCI GPU advisor: `docs/wiki/OCI-GPU-Advisor.md`
- OCI region capacity probe: `docs/wiki/OCI-Region-Capacity.md`

## Plain English Status

- Local lane: `ready` in mode `dry-run`
- Cloud lane: `ready` on provider `hf_jobs` in mode `launch`
- Hugging Face token or secret path ready: `True` via `HF_TOKEN`
- W&B state ready: `True` via `WANDB_MODE=offline`

## Q Fine-Tune Lane

- Training lock: `.training-output/q/latest-training-lock.json`
- Config: `.training-output/q/q-lora-config-harbor-opt-2384cf5-bench-v16.json`
- Dataset: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16.jsonl`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16.manifest.json`
- Curation run id: `n/a`
- Curation run path: `n/a`
- Benchmark corpus: `docs/wiki/Q-Benchmark-Corpus.json`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus records: `54`
- Failure corpus: `docs/wiki/Q-Failure-Corpus.json`
- Local command: `C:\Users\Knight\AppData\Local\Microsoft\WindowsApps\python.EXE C:\Users\Knight\Desktop\Immaculate\Immaculate-push-harbor\training\q\train_q_lora_unsloth.py --config C:\Users\Knight\Desktop\Immaculate\Immaculate-push-harbor\.training-output\q\q-lora-config-harbor-opt-2384cf5-bench-v16.json --session-manifest C:\Users\Knight\Desktop\Immaculate\Immaculate-push-harbor\.training-output\q\sessions\q-hybrid-harbor-opt-2384cf5-bench-v16\hybrid-session.manifest.json --dry-run`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-q-hybrid-harbor-opt-2384cf5-bench-v16.json`
- Signal count: `14`
- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.

## Cloud Bundle

- Bundle id: `q-hybrid-harbor-opt-2384cf5-bench-v16-35ab7e8`
- Archive: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v16/cloud-bundle/q-hybrid-harbor-opt-2384cf5-bench-v16-cloud-bundle.tar.gz`
- Archive SHA-256: `f29b60bc788c1a2e5c3af04867cf0a170456d10cecb78b33a2bc63074e627db5`
- Bundle manifest: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v16/cloud-bundle/bundle-manifest.json`
- Included file count: `9`

## Cloud Doctor

- Provider: `hf_jobs`
- Launch command configured: `True`
- Cloud ready: `True`
- Env file: `C:/Users/Knight/Desktop/cheeks/Asgard/.env` exists `True`
- HF CLI path: `C:\Users\Knight\Desktop\Immaculate\Immaculate-push-harbor\.tools\foundry-venv\Scripts\hf.exe`
- HF auth mode: `token`
- HF auth source: `HF_TOKEN`
- HF authenticated user: `TruLumecreator`
- HF bundle repo: `TruLumecreator/immaculate-q-cloud-bundles`
- HF bundle staged: `True`
- HF jobs visible: `0`
- HF GPU flavors visible: `t4-small, t4-medium, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, h200, h200x2, h200x4, l4x1, l4x4, l40sx1, l40sx4`
- HF smoke attempted: `False`
- HF smoke blocker: n/a
- HF launch blocker: n/a

## HF Jobs Surface

- Recommended next step: Hugging Face Jobs is authenticated and hardware is visible. Launch the staged Q hybrid session when ready.
- Staged archive path: `sessions/q-hybrid-harbor-opt-2384cf5-bench-v16/q-hybrid-harbor-opt-2384cf5-bench-v16-cloud-bundle.tar.gz`
- Staged manifest path: `sessions/q-hybrid-harbor-opt-2384cf5-bench-v16/bundle-manifest.json`

## Colab Free Surface

- Recommended next step: Open the notebook in Colab, provide HF_TOKEN, and use the free runtime for doctor plus dry-run or a bounded Q micro-train when a large enough GPU appears.
- Notebook path: `deploy/colab/notebooks/q-hybrid-harbor-opt-2384cf5-bench-v16-colab-free.ipynb`
- Open in Colab: `https://colab.research.google.com/github/PossumXI/Immaculate/blob/main/deploy/colab/notebooks/q-hybrid-harbor-opt-2384cf5-bench-v16-colab-free.ipynb`
- Micro-train max steps: `24`
- Micro-train max sequence length: `2048`
- Minimum GPU memory for real train: `20 GB`

## Truth Boundary

- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.
- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.
- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.
- Missing provider auth, staging proof, launch targets, or billing headroom keeps the cloud lane explicit as `not-configured` or `launch-blocked` instead of being papered over.
