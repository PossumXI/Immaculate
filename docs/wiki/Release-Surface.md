# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-04-17T20:52:47.953Z
- Immaculate release: `0.1.0+30d48b7`
- Repo commit: `30d48b7e6e99aaacd7284b2c4096d3e68f40f350`
- Branch: `harbor-q-push`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q model name: `Q`
- Q foundation model: `Gemma 4`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14-30d48b7-248a8349`
- Q hybrid session: `q-hybrid-harbor-opt-2384cf5-bench-v14`

## What This Means In Plain English

- Immaculate build `0.1.0+30d48b7` is the current repo build stamp.
- Q is the only public model name used across the repo, and it is built on `Gemma 4`.
- The latest tracked Q training bundle is `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14-30d48b7-248a8349`, tied to dataset `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-hybrid-harbor-opt-2384cf5-bench-v14`, with local lane `ready` and cloud lane `ready` on provider `hf_jobs`.
- The Cloudflare inference lane is currently `auth-blocked` for session `q-hybrid-harbor-opt-2384cf5-bench-v13`, with auth `false`, adapter `false`, worker `false`, eval bundle `true`, and smoke `false`.

## Current Evidence Surfaces

- BridgeBench: `2026-04-17T10:18:04.934Z` via `docs/wiki/BridgeBench.json`
- BridgeBench soak: `2026-04-15T06:15:54.188Z` via `docs/wiki/BridgeBench-Soak.json`
- Q structured contract benchmark: `2026-04-17T10:03:22.220Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-04-17T20:29:42.247Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-04-17T10:12:01.155Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q gateway substrate: `2026-04-17T10:18:33.187Z` via `docs/wiki/Q-Gateway-Substrate.json`
- Q mediation drift: `2026-04-17T20:52:43.143Z` via `docs/wiki/Q-Mediation-Drift.json`
- Q API audit: `2026-04-17T10:09:27Z` via `docs/wiki/Q-API-Audit.json`
- Q hybrid training: `2026-04-17T20:51:59Z` via `docs/wiki/Q-Hybrid-Training.json`
- HF Jobs training: `2026-04-17T20:51:27Z` via `docs/wiki/HF-Jobs-Training.json`
- Colab free training: `2026-04-17T20:51:05Z` via `docs/wiki/Colab-Free-Training.json`
- Cloudflare Q inference: `2026-04-17T10:10:15Z` via `docs/wiki/Cloudflare-Q-Inference.json`
- OCI GPU advisor: `2026-04-17T20:51:59Z` via `docs/wiki/OCI-GPU-Advisor.json`
- OCI region capacity: `2026-04-17T02:02:24Z` via `docs/wiki/OCI-Region-Capacity.json`
- Q benchmark corpus: `2026-04-17T20:51:45Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- Q failure corpus: `2026-04-17T20:51:45Z` via `docs/wiki/Q-Failure-Corpus.json`
- Q benchmark promotion: `2026-04-17T20:29:42Z` via `docs/wiki/Q-Benchmark-Promotion.json`
- W&B benchmark export: `2026-04-17T02:11:36.709380+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench: `2026-04-17T20:29:00.570Z` via `docs/wiki/Harbor-Terminal-Bench.json`
- Terminal-Bench receipt: `2026-04-17T10:09:20.301Z` via `docs/wiki/Terminal-Bench-Receipt.json`
- GitHub checks receipt: `2026-04-16T17:54:12.583Z` via `docs/wiki/GitHub-Checks-Receipt.json`
- Harbor terminal bench soak: `2026-04-16T13:05:24.510Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-17T20:51:08.584Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-04-17T20:29:42Z`
- Run name: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14`
- Training dataset rows: `109`
- Training dataset SHA-256: `248a8349d1f5e1234dfba76ea5d2e3473313496f015e164565fa30d80b0ba094`
- Mix manifest: `.training-output/q/q-defsec-code-longctx-harbor-opt-2384cf5-bench-v14.manifest.json`
- Mix supplemental count: `5`
- Mix supplementals: `training/q/q_harness_identity_seed.json, training/q/q_immaculate_reasoning_seed.json, training/q/bridgebench_seed.json, training/q/coding_long_context_seed.json, .training-output/q/q-failure-corpus.jsonl`
- Curation run: `n/a`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-hybrid-harbor-opt-2384cf5-bench-v14/hybrid-session.json`
- Session generated: `2026-04-17T20:51:59Z`
- Local lane status: `ready`
- Cloud lane status: `ready`
- Cloud provider: `hf_jobs`
- Immaculate orchestration bundle: `immaculate-orchestration-30d48b7-ec4b3cb6`
- Immaculate bundle source: `.training-output/immaculate/latest-training-bundle.json`

## Cloudflare Inference Lane

- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v13`
- Generated: `2026-04-17T10:10:15Z`
- Status: `auth-blocked`
- Auth ready: `false`
- Adapter ready: `false`
- Worker ready: `false`
- Eval bundle ready: `true`
- Smoke ready: `false`
- Recommended next step: Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CLOUDFLARE_Q_BASE_MODEL, then rerun the Cloudflare inference check.

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
