# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-16T00:07:10.317Z
- Immaculate release: `0.1.0+a252873`
- Repo commit: `a252873d15b3265e2ee38c22c5907612487722fa`
- Branch: `detached`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q`
- Q alias: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v3-a252873-f274e8c3`
- Q hybrid session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v3`

## What This Means In Plain English

- Immaculate build `0.1.0+a252873` is the current repo build stamp.
- Q is served and benchmarked as `Q` across the current repo surfaces.
- The latest tracked Q training bundle is `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v3-a252873-f274e8c3`, tied to dataset `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v3.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-hybrid-cur-fnv1a-8f551a5c-bench-v3`, with local lane `dry-run` and cloud lane `not-configured` on provider `hf_jobs`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-15T23:26:02.954Z` via `docs/wiki/BridgeBench.json`
- BridgeBench soak: `2026-04-15T06:15:54.188Z` via `docs/wiki/BridgeBench-Soak.json`
- Q structured contract benchmark: `2026-04-15T02:25:01.093Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-15T02:35:16.060Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-15T02:32:19.275Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q hybrid training: `2026-04-16T00:02:31Z` via `docs/wiki/Q-Hybrid-Training.json`
- HF Jobs training: `2026-04-15T18:57:58Z` via `docs/wiki/HF-Jobs-Training.json`
- Colab free training: `2026-04-15T19:49:12Z` via `docs/wiki/Colab-Free-Training.json`
- Cloudflare Q inference: `2026-04-15T22:59:47Z` via `docs/wiki/Cloudflare-Q-Inference.json`
- OCI GPU advisor: `2026-04-16T00:02:31Z` via `docs/wiki/OCI-GPU-Advisor.json`
- OCI region capacity: `2026-04-15T17:06:51Z` via `docs/wiki/OCI-Region-Capacity.json`
- Q benchmark corpus: `2026-04-16T00:02:26Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- Q benchmark promotion: `2026-04-16T00:01:59Z` via `docs/wiki/Q-Benchmark-Promotion.json`
- W&B benchmark export: `2026-04-15T21:49:33.003136+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench soak: `2026-04-15T08:22:53.565Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-15T08:24:47.464Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-16T00:01:59Z`
- Run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v3`
- Training dataset rows: `1069`
- Training dataset SHA-256: `f274e8c3728e621aa7d2cc76488e62f2be8fd17b43ef8c476d251c50f2ff0116`
- Mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v3.manifest.json`
- Mix supplemental count: `3`
- Mix supplementals: `training/q/bridgebench_seed.json, training/q/coding_long_context_seed.json, .training-output/q/q-benchmark-corpus.jsonl`
- Curation run: `cur-fnv1a-8f551a5c`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v3/hybrid-session.json`
- Session generated: `2026-04-16T00:02:31Z`
- Local lane status: `dry-run`
- Cloud lane status: `not-configured`
- Cloud provider: `hf_jobs`
- Immaculate orchestration bundle: `immaculate-orchestration-a252873-56a2e925`

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
