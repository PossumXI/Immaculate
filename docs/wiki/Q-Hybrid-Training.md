# Q Hybrid Training

This page records one hybrid Q training session. In plain English: it ties the Q fine-tune lane and the Immaculate orchestration-improvement lane into one stamped session, then tells you exactly which parts are ready or missing.

- Generated: `2026-04-15T12:38:12Z`
- Release: `0.1.0+3ce07ac`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-3ce07ac-cee52e2d`
- Dataset rows: `1070`
- Immaculate orchestration bundle: `immaculate-orchestration-3ce07ac-3dd4365f`

## Plain English Status

- Local lane: `completed` in mode `dry-run`
- Cloud lane: `not-configured` on provider `oci` in mode `launch`
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
- Local command: `C:\Users\Knight\AppData\Local\Microsoft\WindowsApps\python.EXE C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-bench-v2-clean\training\q\train_q_lora_unsloth.py --config C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-bench-v2-clean\.training-output\q\q-lora-config-longctx-cur-fnv1a-8f551a5c-bench-v2.json --session-manifest C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway-push-bench-v2-clean\.training-output\q\sessions\q-hybrid-cur-fnv1a-8f551a5c-bench-v2\hybrid-session.manifest.json --dry-run`

## Immaculate Orchestration Lane

- Bundle path: `.training-output/immaculate/immaculate-training-bundle-q-hybrid-cur-fnv1a-8f551a5c-bench-v2.json`
- Signal count: `14`
- This lane improves Immaculate through benchmark and orchestration evidence while keeping the tracked Q lineage as the only model-training lane in scope.

## Cloud Bundle

- Bundle id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2-3ce07ac`
- Archive: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/cloud-bundle/q-hybrid-cur-fnv1a-8f551a5c-bench-v2-cloud-bundle.tar.gz`
- Archive SHA-256: `fa7a6d51804b493756344cbb27e905ab6e96d98108e34326088ca5692207f3a4`
- Bundle manifest: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/cloud-bundle/bundle-manifest.json`
- Included file count: `10`

## Cloud Doctor

- Provider: `oci`
- Launch command configured: `True`
- OCI CLI path: `C:/Users/Knight/Desktop/Immaculate/Immaculate-q-gateway/.tools/oci-cli-venv/Scripts/oci.exe`
- OCI auth mode: `config_file`
- OCI auth source: `OCI_CLI_CONFIG_FILE`
- OCI auth config: `.training-output/q/oci-controller/DEFAULT.config`
- OCI auth profile: `DEFAULT`
- OCI auth key path: `C:/Users/Knight/.oci/oci_api_key.pem`
- OCI auth key repaired: `False`
- OCI session env updated: `True`
- OCI region: `us-ashburn-1`
- OCI subscribed regions: `us-ashburn-1 (IAD) [home]`
- OCI GPU shapes visible: `none`
- Cloud ready: `False`
- Env file: `C:/Users/Knight/Desktop/cheeks/Asgard/.env` exists `True`
- Env file: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/oci-cloud.env` exists `True`
- Launch target `OCI_COMPARTMENT_OCID`: `True`
- Launch target `OCI_SUBNET_OCID`: `True`
- Launch target `OCI_AVAILABILITY_DOMAIN`: `True`
- Launch target `OCI_IMAGE_OCID`: `True`
- Launch target `OCI_SHAPE`: `False`
- Launch target `OCI_OBJECT_STORAGE_NAMESPACE`: `True`
- Launch target `OCI_OBJECT_STORAGE_BUCKET`: `True`
- Cloud note: Missing cloud launch target env: OCI_SHAPE
- Cloud note: Only subscribed OCI region visible to this tenancy is us-ashburn-1 (IAD) [home].
- Cloud note: No GPU shapes are available in OCI region us-ashburn-1 for the current controller auth.

## Truth Boundary

- One hybrid session can now coordinate local Q preparation, optional local training, optional cloud launch intent, and an Immaculate orchestration bundle in one place.
- A cloud launch is only claimed when the session doctor marks the cloud lane ready and an actual launch command is configured.
- The cloud bundle exists so a remote GPU node can train the exact locked dataset instead of booting without the tracked session inputs.
- Missing OCI auth, missing launch target OCIDs, or missing secret mappings keep the cloud lane explicit as `not-configured` instead of being papered over.
