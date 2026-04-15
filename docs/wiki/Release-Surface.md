# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-15T04:09:30.304Z
- Immaculate release: `0.1.0+c4cbb0a`
- Repo commit: `c4cbb0a5d68b6d0592a2325664014fefefc30422`
- Branch: `detached`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q`
- Q alias: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1-5e51e00-e16a056e`
- Q hybrid session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v1`

## What This Means In Plain English

- Immaculate build `0.1.0+c4cbb0a` is the current repo build stamp.
- Q is served and benchmarked as `Q` across the current repo surfaces.
- The latest tracked Q training bundle is `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1-5e51e00-e16a056e`, tied to dataset `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-mix-longctx-cur-fnv1a-8f551a5c-bench-v1.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-hybrid-cur-fnv1a-8f551a5c-bench-v1`, with local lane `ready` and cloud lane `not-configured` on provider `oci`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-15T02:35:08.392Z` via `docs/wiki/BridgeBench.json`
- Q structured contract benchmark: `2026-04-15T02:25:01.093Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-15T02:35:16.060Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-15T02:32:19.275Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q hybrid training: `2026-04-15T03:43:38Z` via `docs/wiki/Q-Hybrid-Training.json`
- Q benchmark corpus: `2026-04-15T03:43:35Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- Q benchmark promotion: `2026-04-15T04:09:10Z` via `docs/wiki/Q-Benchmark-Promotion.json`
- W&B benchmark export: `2026-04-15T03:31:24.375275+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-15T03:43:15Z`
- Run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1`
- Training dataset rows: `1023`
- Training dataset SHA-256: `e16a056eaf28580a4a91630e9313799d95be945660b7c57bb409710fe8eed676`
- Mix manifest: `C:\Users\Knight\Desktop\Immaculate\Immaculate-q-gateway\.training-output\q\q-mix-longctx-cur-fnv1a-8f551a5c-bench-v1.manifest.json`
- Mix supplemental count: `3`
- Mix supplementals: `training/q/bridgebench_seed.json, training/q/coding_long_context_seed.json, .training-output/q/q-benchmark-corpus.jsonl`
- Curation run: `cur-fnv1a-8f551a5c`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v1/hybrid-session.json`
- Session generated: `2026-04-15T03:43:38Z`
- Local lane status: `ready`
- Cloud lane status: `not-configured`
- Cloud provider: `oci`
- Immaculate orchestration bundle: `immaculate-orchestration-5e51e00-3dd4365f`

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
