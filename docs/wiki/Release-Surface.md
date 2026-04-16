# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-16T16:10:51.625Z
- Immaculate release: `0.1.0+f2a6393`
- Repo commit: `f2a6393b575d1fe996fc26fc27e965a0b6bad0e0`
- Branch: `harbor-q-push`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q`
- Q alias: `Q`
- Q training bundle: `none generated yet`
- Q hybrid session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v3`

## What This Means In Plain English

- Immaculate build `0.1.0+f2a6393` is the current repo build stamp.
- Q is served and benchmarked as `Q` across the current repo surfaces.
- No tracked Q training bundle has been generated yet in this checkout.
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
- W&B benchmark export: `2026-04-16T02:41:20.106697+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench: `2026-04-16T13:05:23.427Z` via `docs/wiki/Harbor-Terminal-Bench.json`
- Terminal-Bench receipt: `2026-04-16T16:09:51.838Z` via `docs/wiki/Terminal-Bench-Receipt.json`
- Harbor terminal bench soak: `2026-04-16T13:05:24.510Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-15T08:24:47.464Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Q Training Bundle

- Lock path: `none`
- Lock generated: `n/a`
- Run name: `n/a`
- Training dataset rows: `n/a`
- Training dataset SHA-256: `n/a`
- Mix manifest: `n/a`
- Mix supplemental count: `n/a`
- Mix supplementals: `n/a`
- Curation run: `n/a`

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
