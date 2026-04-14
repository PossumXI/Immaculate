# Q Hybrid Training

This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.

- Generated: `2026-04-14T20:47:00Z`
- Release: `0.1.0+b4e599d`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`
- Base model: `unsloth/gemma-4-31B-it`
- Dataset rows: `1013`
- Immaculate orchestration bundle: `immaculate-orchestration-b4e599d-4c759c95`

## Plain English Status

- Local lane: `completed` in mode `dry-run`
- Cloud lane: `not-configured` on provider `oci`
- Hugging Face token present: `True`
- W&B publish env ready: `False`

## Q Fine-Tune Lane

- Training lock: `.training-output/q/latest-training-lock.json`
- Config: `.training-output/q/q-lora-config-longctx-cur-fnv1a-8f551a5c.json`
- Dataset: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c.jsonl`
- Mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c.manifest.json`
- Curation run: `cur-fnv1a-8f551a5c`
- Failure corpus: `docs/wiki/Q-Failure-Corpus.json`
- Local command: `C:\Users\Knight\AppData\Local\Microsoft\WindowsApps\python.EXE C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\training\q\train_q_lora_unsloth.py --config C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-lora-config-longctx-cur-fnv1a-8f551a5c.json --session-manifest C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\sessions\q-hybrid-cur-fnv1a-8f551a5c\hybrid-session.manifest.json --dry-run`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-q-hybrid-cur-fnv1a-8f551a5c.json`
- Signal count: `14`
- This lane improves Immaculate through benchmark and orchestration evidence, not by pretending Immaculate is a separate base model.

## Cloud Doctor

- Provider: `oci`
- Launch command configured: `False`
- Cloud ready: `False`
- Cloud note: OCI CLI is not installed.
- Cloud note: OCI auth is not configured through instance principals, OCI_CONFIG_FILE, or explicit OCI_* identity variables.

## Truth Boundary

- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.
- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.
- On this machine, missing cloud auth or tooling keeps the cloud lane explicit as `not-configured` instead of being papered over.
