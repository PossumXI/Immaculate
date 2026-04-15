# Q Hybrid Training

This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.

- Generated: `2026-04-15T03:28:31Z`
- Release: `0.1.0+bd38cef`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`
- Dataset rows: `1013`
- Immaculate orchestration bundle: `immaculate-orchestration-bd38cef-3dd4365f`

## Plain English Status

- Local lane: `ready` in mode `dry-run`
- Cloud lane: `not-configured` on provider `oci` in mode `launch`
- Hugging Face token or secret path ready: `True` via `HF_TOKEN`
- W&B state ready: `True` via `WANDB_MODE=offline`

## Q Fine-Tune Lane

- Training lock: `.training-output/q/latest-training-lock.json`
- Config: `.training-output/q/q-lora-config-longctx-cur-fnv1a-8f551a5c.json`
- Dataset: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c.jsonl`
- Mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c.manifest.json`
- Curation run: `cur-fnv1a-8f551a5c`
- Benchmark corpus: `docs/wiki/Q-Benchmark-Corpus.json`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus records: `10`
- Failure corpus: `docs/wiki/Q-Failure-Corpus.json`
- Local command: `C:\Users\Knight\AppData\Local\Microsoft\WindowsApps\python.EXE C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\training\q\train_q_lora_unsloth.py --config C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-lora-config-longctx-cur-fnv1a-8f551a5c.json --session-manifest C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\sessions\q-hybrid-cur-fnv1a-8f551a5c\hybrid-session.manifest.json --dry-run`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-q-hybrid-cur-fnv1a-8f551a5c.json`
- Signal count: `14`
- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.

## Cloud Bundle

- Bundle id: `q-hybrid-cur-fnv1a-8f551a5c-bd38cef`
- Archive: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c/cloud-bundle/q-hybrid-cur-fnv1a-8f551a5c-cloud-bundle.tar.gz`
- Archive SHA-256: `3eb5d29e795c30bf167c2e444d963ce37a03438c4ecd24ae9eb080c83ed3f3fe`
- Bundle manifest: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c/cloud-bundle/bundle-manifest.json`
- Included file count: `10`

## Cloud Doctor

- Provider: `oci`
- Launch command configured: `True`
- OCI CLI path: `C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway/.tools/oci-cli-venv/Scripts/oci.exe`
- OCI auth mode: `missing`
- Cloud ready: `False`
- Env file: `C:/Users/Knight/Desktop/cheeks/Asgard/.env` exists `True`
- Env file: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c/oci-cloud.env` exists `True`
- Launch target `OCI_COMPARTMENT_OCID`: `False`
- Launch target `OCI_SUBNET_OCID`: `False`
- Launch target `OCI_AVAILABILITY_DOMAIN`: `False`
- Launch target `OCI_IMAGE_OCID`: `False`
- Launch target `OCI_SHAPE`: `False`
- Launch target `OCI_OBJECT_STORAGE_NAMESPACE`: `False`
- Launch target `OCI_OBJECT_STORAGE_BUCKET`: `False`
- Cloud note: Missing cloud launch target env: OCI_COMPARTMENT_OCID, OCI_SUBNET_OCID, OCI_AVAILABILITY_DOMAIN, OCI_IMAGE_OCID, OCI_SHAPE, OCI_OBJECT_STORAGE_NAMESPACE, OCI_OBJECT_STORAGE_BUCKET
- Cloud note: OCI auth is not configured through OCI_CLI_AUTH=instance_principal, OCI_CLI_CONFIG_FILE, or explicit OCI_CLI_* identity variables.

## Truth Boundary

- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.
- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.
- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.
- Missing OCI auth, missing launch target OCIDs, or missing secret mappings keep the cloud lane explicit as `not-configured` instead of being papered over.
