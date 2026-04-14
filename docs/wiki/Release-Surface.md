# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-14T15:50:13.061Z
- Immaculate release: `0.1.0+f3886f2`
- Repo commit: `f3886f2118cc44447ac7a27c82593d6a6f6e89fa`
- Branch: `detached`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q (gemma4:e4b)`
- Q alias: `Q`
- Q provider model: `gemma4:e4b`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`

## What This Means In Plain English

- Immaculate build `0.1.0+f3886f2` is the current repo build stamp.
- Q is still served as `Q (gemma4:e4b)`, not a mystery renamed model.
- The latest tracked Q training bundle is `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`, tied to dataset `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-mix-longctx-cur-fnv1a-8f551a5c.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-14T15:37:11.471Z` via `docs/wiki/BridgeBench.json`
- Model comparison: `2026-04-14T15:27:29.352Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-14T15:37:16.626Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-14T15:45:30.608Z` via `docs/wiki/Q-Gateway-Validation.json`
- W&B benchmark export: `2026-04-14T15:50:07.491415+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-14T15:26:05Z`
- Run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c`
- Base model: `unsloth/gemma-4-31B-it`
- Training dataset rows: `1013`
- Training dataset SHA-256: `5c329cc58772a0dc52e12dafcc421caa5458c6a7c37b96f2970d8a04e937c64f`
- Mix manifest: `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-mix-longctx-cur-fnv1a-8f551a5c.manifest.json`
- Curation run: `cur-fnv1a-8f551a5c`

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
