# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-17T02:49:51.979Z
- Immaculate release: `0.1.0+3c3e41d`
- Repo commit: `3c3e41d99de4ee12273359707ffe5f0e2025e851`
- Branch: `harbor-q-push`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q serving label: `Q`
- Q alias: `Q`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2-3c3e41d-766c8ccf`
- Q hybrid session: `q-hybrid-harbor-opt-2384cf5-bench-v2`

## What This Means In Plain English

- Immaculate build `0.1.0+3c3e41d` is the current repo build stamp.
- Q is served and benchmarked as `Q` across the current repo surfaces.
- The latest tracked Q training bundle is `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2-3c3e41d-766c8ccf`, tied to dataset `.training-output/q/q-mix-longctx-harbor-opt-2384cf5-bench-v2.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-hybrid-harbor-opt-2384cf5-bench-v2`, with local lane `ready` and cloud lane `launch-blocked` on provider `hf_jobs`.
- The Cloudflare inference lane is currently `auth-blocked` for session `q-hybrid-harbor-opt-2384cf5-bench-v2`, with auth `false`, adapter `false`, worker `false`, eval bundle `true`, and smoke `false`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-17T02:43:07.635Z` via `docs/wiki/BridgeBench.json`
- BridgeBench soak: `2026-04-15T06:15:54.188Z` via `docs/wiki/BridgeBench-Soak.json`
- Q structured contract benchmark: `2026-04-17T02:40:21.770Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-17T02:49:49.403Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-17T02:48:43.496Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q gateway substrate: `2026-04-17T02:49:30.783Z` via `docs/wiki/Q-Gateway-Substrate.json`
- Q API audit: `2026-04-17T00:16:15Z` via `docs/wiki/Q-API-Audit.json`
- Q hybrid training: `2026-04-17T02:45:56Z` via `docs/wiki/Q-Hybrid-Training.json`
- HF Jobs training: `2026-04-17T00:43:28Z` via `docs/wiki/HF-Jobs-Training.json`
- Colab free training: `2026-04-15T19:49:12Z` via `docs/wiki/Colab-Free-Training.json`
- Cloudflare Q inference: `2026-04-17T02:46:23Z` via `docs/wiki/Cloudflare-Q-Inference.json`
- OCI GPU advisor: `2026-04-17T02:45:56Z` via `docs/wiki/OCI-GPU-Advisor.json`
- OCI region capacity: `2026-04-17T02:02:24Z` via `docs/wiki/OCI-Region-Capacity.json`
- Q benchmark corpus: `2026-04-17T02:49:49Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- Q failure corpus: `2026-04-17T02:49:49Z` via `docs/wiki/Q-Failure-Corpus.json`
- Q benchmark promotion: `2026-04-17T02:45:47Z` via `docs/wiki/Q-Benchmark-Promotion.json`
- W&B benchmark export: `2026-04-17T00:58:35.193636+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench: `2026-04-17T02:45:25.427Z` via `docs/wiki/Harbor-Terminal-Bench.json`
- Terminal-Bench receipt: `2026-04-16T19:02:50.028Z` via `docs/wiki/Terminal-Bench-Receipt.json`
- GitHub checks receipt: `2026-04-16T17:54:12.583Z` via `docs/wiki/GitHub-Checks-Receipt.json`
- Harbor terminal bench soak: `2026-04-16T13:05:24.510Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-15T08:24:47.464Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-17T02:45:48Z`
- Run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2`
- Training dataset rows: `31`
- Training dataset SHA-256: `766c8ccf551f183e006a9553d9fd6e1fad396a2bfc6f6fb9740a19af284ea1e8`
- Mix manifest: `.training-output/q/q-mix-longctx-harbor-opt-2384cf5-bench-v2.manifest.json`
- Mix supplemental count: `2`
- Mix supplementals: `training/q/bridgebench_seed.json, training/q/coding_long_context_seed.json`
- Curation run: `n/a`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v2/hybrid-session.json`
- Session generated: `2026-04-17T02:45:56Z`
- Local lane status: `ready`
- Cloud lane status: `launch-blocked`
- Cloud provider: `hf_jobs`
- Immaculate orchestration bundle: `immaculate-orchestration-3c3e41d-7aa3136b`
- Immaculate bundle source: `.training-output/immaculate/latest-training-bundle.json`

## Cloudflare Inference Lane

- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v2`
- Generated: `2026-04-17T02:46:23Z`
- Status: `auth-blocked`
- Auth ready: `false`
- Adapter ready: `false`
- Worker ready: `false`
- Eval bundle ready: `true`
- Smoke ready: `false`
- Recommended next step: Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then rerun the Cloudflare inference check.

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
