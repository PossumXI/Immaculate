# Q Hybrid Training

This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.

- Generated: `2026-04-15T19:43:42Z`
- Release: `0.1.0+58a73db`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-86bf2b5-6207dd5e`
- Dataset rows: `1070`
- Immaculate orchestration bundle: `immaculate-orchestration-58a73db-3dd4365f`
- HF Jobs training surface: `docs/wiki/HF-Jobs-Training.md`
- Colab free training surface: `docs/wiki/Colab-Free-Training.md`
- OCI GPU advisor: `docs/wiki/OCI-GPU-Advisor.md`
- OCI region capacity probe: `docs/wiki/OCI-Region-Capacity.md`

## Plain English Status

- Local lane: `ready` in mode `dry-run`
- Cloud lane: `not-configured` on provider `hf_jobs` in mode `launch`
- Hugging Face token or secret path ready: `True` via `HF_TOKEN`
- W&B state ready: `True` via `WANDB_MODE=offline`

## Q Fine-Tune Lane

- Training lock: `.training-output/q/latest-training-lock.json`
- Config: `.training-output/q/q-lora-config-longctx-cur-fnv1a-8f551a5c-bench-v2.json`
- Dataset: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v2.jsonl`
- Mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v2.manifest.json`
- Curation run: `cur-fnv1a-8f551a5c`
- Benchmark corpus: `docs/wiki/Q-Benchmark-Corpus.json`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus records: `57`
- Failure corpus: `docs/wiki/Q-Failure-Corpus.json`
- Local command: `C:\Users\Knight\AppData\Local\Microsoft\WindowsApps\python.EXE C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-oci-advisor\training\q\train_q_lora_unsloth.py --config C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-oci-advisor\.training-output\q\q-lora-config-longctx-cur-fnv1a-8f551a5c-bench-v2.json --session-manifest C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-oci-advisor\.training-output\q\sessions\q-hybrid-cur-fnv1a-8f551a5c-bench-v2\hybrid-session.manifest.json --dry-run`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-q-hybrid-cur-fnv1a-8f551a5c-bench-v2.json`
- Signal count: `14`
- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.

## Cloud Bundle

- Bundle id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2-58a73db`
- Archive: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/cloud-bundle/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-cloud-bundle.tar.gz`
- Archive SHA-256: `4e6fa2b68a8859f69d5f79988cc068b64db78fe7c4d2d208af7276809539ea42`
- Bundle manifest: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/cloud-bundle/bundle-manifest.json`
- Included file count: `10`

## Cloud Doctor

- Provider: `hf_jobs`
- Launch command configured: `True`
- Cloud ready: `False`
- Env file: `C:/Users/Knight/Desktop/cheeks/Asgard/.env` exists `True`
- Env file: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/hf-jobs.env` exists `True`
- Cloud note: HF Jobs smoke launch blocker: Error: Client error '402 Payment Required' for url 'https://huggingface.co/api/jobs/TruLumecreator' (Request ID: Root=1-69dfdfb3-6d068e3b2fa32b847cc2e8ec;644d56af-8af0-4c7d-a5f4-d3a14bca61cd)
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

Pre-paid credit balance is insufficient - add more credits to your account to use Jobs.
- HF CLI path: `C:\Users\Knight\Desktop\Immaculate\.tools\foundry-venv\Scripts\hf.exe`
- HF auth mode: `token`
- HF auth source: `HF_TOKEN`
- HF authenticated user: `TruLumecreator`
- HF bundle repo: `TruLumecreator/immaculate-q-cloud-bundles`
- HF bundle staged: `True`
- HF jobs visible: `0`
- HF GPU flavors visible: `t4-small, t4-medium, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, h200, h200x2, h200x4, l4x1, l4x4, l40sx1, l40sx4`
- HF smoke attempted: `True`
- HF smoke blocker: Error: Client error '402 Payment Required' for url 'https://huggingface.co/api/jobs/TruLumecreator' (Request ID: Root=1-69dfdfb3-6d068e3b2fa32b847cc2e8ec;644d56af-8af0-4c7d-a5f4-d3a14bca61cd)
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

Pre-paid credit balance is insufficient - add more credits to your account to use Jobs.
- HF launch blocker: n/a

## HF Jobs Surface

- Recommended next step: Hugging Face Jobs is authenticated and the bundle is staged, but prepaid credits are insufficient for launch. Add HF credits, then rerun the same session through the HF Jobs launcher.
- Staged archive path: `sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-cloud-bundle.tar.gz`
- Staged manifest path: `sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/bundle-manifest.json`

## Colab Free Surface

- Recommended next step: Open the notebook in Colab, provide HF_TOKEN, and use the free runtime for doctor plus dry-run or a bounded Q micro-train when a large enough GPU appears.
- Notebook path: `deploy/colab/notebooks/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-colab-free.ipynb`
- Open in Colab: `https://colab.research.google.com/github/PossumXI/Immaculate/blob/main/deploy/colab/notebooks/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-colab-free.ipynb`
- Micro-train max steps: `24`
- Micro-train max sequence length: `2048`
- Minimum GPU memory for real train: `20 GB`

## Truth Boundary

- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.
- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.
- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.
- Missing provider auth, staging proof, launch targets, or billing headroom keeps the cloud lane explicit as `not-configured` instead of being papered over.
