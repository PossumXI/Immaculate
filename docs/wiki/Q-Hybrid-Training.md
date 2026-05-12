# Q Hybrid Training

This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.

- Generated: `2026-05-12T18:06:56Z`
- Release: `0.1.0+a7e67ff`
- Session id: `q-arobi-main-roots-20260512-bench-v1`
- Q training bundle: `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`
- Dataset rows: `2053`
- Immaculate orchestration bundle: `immaculate-orchestration-a7e67ff-e68f2160`
- HF Jobs training surface: `docs/wiki/HF-Jobs-Training.md`
- Colab free training surface: `docs/wiki/Colab-Free-Training.md`
- OCI GPU advisor: `docs/wiki/OCI-GPU-Advisor.md`
- OCI region capacity probe: `docs/wiki/OCI-Region-Capacity.md`

## Plain English Status

- Local lane: `skipped` in mode `disabled`
- Cloud lane: `skipped` on provider `manual` in mode `disabled`
- Hugging Face token or secret path ready: `True` via `HF_TOKEN`
- W&B state ready: `True` via `WANDB_MODE=offline`

## Q Fine-Tune Lane

- Training lock: `.training-output/q/latest-training-lock.json`
- Config: `.training-output/q/q-lora-config-arobi-main-roots-20260512-bench-v1.json`
- Dataset: `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.jsonl`
- Mix manifest: `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.manifest.json`
- Curation run id: `cur-fnv1a-6e3f6fdf`
- Curation run path: `.training-output/training-data/runs/cur-fnv1a-6e3f6fdf/run.json`
- Benchmark corpus: `docs/wiki/Q-Benchmark-Corpus.json`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus records: `58`
- Failure corpus: `docs/wiki/Q-Failure-Corpus.json`
- Local command: `n/a`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-q-arobi-main-roots-20260512-bench-v1.json`
- Signal count: `14`
- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.

## Cloud Bundle

- Bundle id: `q-arobi-main-roots-20260512-bench-v1-a7e67ff`
- Archive: `.training-output/q/sessions/q-arobi-main-roots-20260512-bench-v1/cloud-bundle/q-arobi-main-roots-20260512-bench-v1-cloud-bundle.tar.gz`
- Archive SHA-256: `d8af87398f6bf27741a8109256e82d1e2a4c4d4d66c97d95914e13f3b20e7bb4`
- Bundle manifest: `.training-output/q/sessions/q-arobi-main-roots-20260512-bench-v1/cloud-bundle/bundle-manifest.json`
- Included file count: `10`

## Cloud Doctor

- Provider: `manual`
- Launch command configured: `False`
- Cloud ready: `False`
- OCI CLI path: `C:\Users\Knight\Desktop\Immaculate\.tools\foundry-venv\Scripts\hf.exe`
- OCI auth mode: `token`
- OCI auth source: `HF_TOKEN`
- OCI auth config: `n/a`
- OCI auth profile: `n/a`
- OCI auth key path: `n/a`
- OCI auth key repaired: `False`
- OCI session env updated: `False`
- OCI region: `n/a`
- OCI subscribed regions: `none discovered`
- OCI GPU shapes visible: `t4-small, t4-medium, a10g-small, a10g-large, a10g-largex2, a10g-largex4, a100-large, a100x4, h200, h200x2, h200x4, l4x1, l4x4, l40sx1, l40sx4`
- OCI target region: `n/a`
- OCI Object Storage region: `n/a`
- Launch target `HF_TOKEN`: `True`

## OCI GPU Advisor

- Recommendation status: `none`
- Recommended region: `n/a`
- Recommended shape: `n/a`
- Recommendation reason: Active hybrid session is using the HF Jobs cloud lane; see OCI-Region-Capacity for the current OCI controller state.
- Public expansion candidates: `none`

## OCI Region Capacity

- Latest attempt status: `blocked`
- Subscription limit reached: `True`
- Recommended next step: OCI support incident creation is still blocked for this controller identity. Current error: The Requested Domain was not found or not Authorized. Open the limit increase manually in OCI/My Oracle Support or fix the support-account identity binding, then rerun the current Q and Immaculate cloud doctor.
- OCI support create ready now: `False`
- OCI support create blocker: The Requested Domain was not found or not Authorized
- OCI discovered support-domain candidate: `Default`
- OCI support-domain binding verified: `False`
- OCI support incident error: The Requested Domain was not found or not Authorized
- Prepared limit-request helper: `python training/q/create_oci_region_limit_request.py --session .training-output/q/sessions/q-arobi-main-roots-20260512-bench-v1/hybrid-session.manifest.json --check`

## Truth Boundary

- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.
- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.
- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.
- Missing provider auth, staging proof, launch targets, or billing headroom keeps the cloud lane explicit as `not-configured` or `launch-blocked` instead of being papered over.
