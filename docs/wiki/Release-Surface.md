# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-15T18:58:12.873Z
- Immaculate release: `0.1.0+bb5d749`
- Repo commit: `bb5d74917c953b52af2f71057a4d1cb7cdcd39a4`
- Branch: `detached`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q`
- Q alias: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-86bf2b5-6207dd5e`
- Q hybrid session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`

## What This Means In Plain English

- Immaculate build `0.1.0+bb5d749` is the current repo build stamp.
- Q is served and benchmarked as `Q` across the current repo surfaces.
- The latest tracked Q training bundle is `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-86bf2b5-6207dd5e`, tied to dataset `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v2.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`, with local lane `ready` and cloud lane `not-configured` on provider `hf_jobs`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-15T02:35:08.392Z` via `docs/wiki/BridgeBench.json`
- BridgeBench soak: `2026-04-15T06:15:54.188Z` via `docs/wiki/BridgeBench-Soak.json`
- Q structured contract benchmark: `2026-04-15T02:25:01.093Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-15T02:35:16.060Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-15T02:32:19.275Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q hybrid training: `2026-04-15T18:57:50Z` via `docs/wiki/Q-Hybrid-Training.json`
- HF Jobs training: `2026-04-15T18:57:58Z` via `docs/wiki/HF-Jobs-Training.json`
- OCI GPU advisor: `2026-04-15T18:57:50Z` via `docs/wiki/OCI-GPU-Advisor.json`
- OCI region capacity: `2026-04-15T17:06:51Z` via `docs/wiki/OCI-Region-Capacity.json`
- Q benchmark corpus: `2026-04-15T18:57:45Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- Q benchmark promotion: `2026-04-15T12:37:51Z` via `docs/wiki/Q-Benchmark-Promotion.json`
- W&B benchmark export: `2026-04-15T16:01:53.511299+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench soak: `2026-04-15T08:22:53.565Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-15T08:24:47.464Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-15T12:25:00Z`
- Run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2`
- Training dataset rows: `1070`
- Training dataset SHA-256: `6207dd5ea8c567b6b38d53089aa88d50c1760d4491f3fee9fa9816a9ada5c9d8`
- Mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v2.manifest.json`
- Mix supplemental count: `3`
- Mix supplementals: `training/q/bridgebench_seed.json, training/q/coding_long_context_seed.json, .training-output/q/q-benchmark-corpus.jsonl`
- Curation run: `cur-fnv1a-8f551a5c`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/hybrid-session.json`
- Session generated: `2026-04-15T18:57:50Z`
- Local lane status: `ready`
- Cloud lane status: `not-configured`
- Cloud provider: `hf_jobs`
- Immaculate orchestration bundle: `immaculate-orchestration-bb5d749-3dd4365f`

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
