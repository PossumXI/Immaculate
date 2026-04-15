# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-15T03:28:28.558Z
- Immaculate release: `0.1.0+bd38cef`
- Repo commit: `bd38ceffdd4e588f48df31e00461c2682ee9383f`
- Branch: `detached`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q`
- Q alias: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`
- Q hybrid session: `q-hybrid-cur-fnv1a-8f551a5c`

## What This Means In Plain English

- Immaculate build `0.1.0+bd38cef` is the current repo build stamp.
- Q is served and benchmarked as `Q` across the current repo surfaces.
- The latest tracked Q training bundle is `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`, tied to dataset `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-mix-longctx-cur-fnv1a-8f551a5c.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-hybrid-cur-fnv1a-8f551a5c`, with local lane `ready` and cloud lane `not-configured` on provider `oci`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-15T02:35:08.392Z` via `docs/wiki/BridgeBench.json`
- Q structured contract benchmark: `2026-04-15T02:25:01.093Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-15T02:35:16.060Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-15T02:32:19.275Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q hybrid training: `2026-04-15T03:26:47Z` via `docs/wiki/Q-Hybrid-Training.json`
- Q benchmark corpus: `2026-04-15T03:28:28Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- W&B benchmark export: `2026-04-14T21:39:44.220516+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-14T15:26:05Z`
- Run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c`
- Training dataset rows: `1013`
- Training dataset SHA-256: `5c329cc58772a0dc52e12dafcc421caa5458c6a7c37b96f2970d8a04e937c64f`
- Mix manifest: `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-mix-longctx-cur-fnv1a-8f551a5c.manifest.json`
- Curation run: `cur-fnv1a-8f551a5c`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c/hybrid-session.json`
- Session generated: `2026-04-15T03:26:47Z`
- Local lane status: `ready`
- Cloud lane status: `not-configured`
- Cloud provider: `oci`
- Immaculate orchestration bundle: `immaculate-orchestration-bd38cef-3dd4365f`

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
