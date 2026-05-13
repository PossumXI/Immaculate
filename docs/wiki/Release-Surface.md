# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-05-13T17:50:15.472Z
- Immaculate release: `0.1.0+d733583`
- Repo commit: `d733583967e50faf8b9f3bdb740f095570dd3edd`
- Branch: `main`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q model name: `Q`
- Q foundation model: `Gemma 4`
- Q training bundle: `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`
- Q hybrid session: `q-arobi-main-roots-20260512-bench-v1`

## What This Means In Plain English

- Immaculate build `0.1.0+d733583` is the current repo build stamp.
- Arobi Network is the ledger-backed private and public operator network and audit substrate. Immaculate is the governed harness and orchestrator inside it. Q is the reasoning brain inside that governed stack.
- Q is the only public model name used across the repo, and it is built on `Gemma 4`.
- The latest tracked Q training bundle is `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`, tied to dataset `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-arobi-main-roots-20260512-bench-v1`, with local lane `skipped` and cloud lane `skipped` on provider `manual`.
- A separate Cloudflare inference readiness surface is tracked for session `q-hybrid-harbor-opt-2384cf5-bench-v22`, while the current public wins remain the Terminal-Bench public-task pass, the green mediation/substrate lanes, and the linked Arobi decision review.

## Current Evidence Surfaces

- BridgeBench: `2026-05-07T04:12:53.126Z` via `docs/wiki/BridgeBench.json`
- BridgeBench soak: `2026-04-15T06:15:54.188Z` via `docs/wiki/BridgeBench-Soak.json`
- Q structured contract benchmark: `2026-05-07T06:03:07.620Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-05-13T17:50:15.472Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-05-07T07:32:32.750Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q gateway substrate: `2026-04-19T22:06:38.757Z` via `docs/wiki/Q-Gateway-Substrate.json`
- Q mediation drift: `2026-04-19T22:06:40.025Z` via `docs/wiki/Q-Mediation-Drift.json`
- Arobi audit integrity: `2026-05-12T18:09:17.101Z` via `docs/wiki/Arobi-Audit-Integrity.json`
- Arobi live ledger receipt: `2026-05-13T17:05:15.331Z` via `docs/wiki/Arobi-Live-Ledger-Receipt.json`
- Live mission readiness: `2026-05-13T17:05:26.971Z` via `docs/wiki/Live-Mission-Readiness.json`
- Live operator activity: `2026-05-13T17:05:45.299Z` via `docs/wiki/Live-Operator-Activity.json`
- Live operator public export: `2026-05-13T17:05:58.453Z` via `docs/wiki/Live-Operator-Public-Export.json`
- Cross-project workflow health: `2026-05-13T17:50:13.165Z` via `docs/wiki/Cross-Project-Workflow-Health.json`
- Supervised mission showcase: `2026-04-22T01:20:45.053Z` via `docs/wiki/Supervised-Mission-Showcase.json`
- Roundtable actionability: `2026-05-13T17:06:06.500Z` via `docs/wiki/Roundtable-Actionability.json`
- Roundtable runtime: `2026-04-21T22:19:50.626Z` via `docs/wiki/Roundtable-Runtime.json`
- Q API audit: `2026-04-19T22:47:48Z` via `docs/wiki/Q-API-Audit.json`
- Arobi decision review: `2026-04-19T22:47:51.678Z` via `docs/wiki/Arobi-Decision-Review.json`
- Q hybrid training: `2026-05-13T01:11:39Z` via `docs/wiki/Q-Hybrid-Training.json`
- HF Jobs training: `2026-04-19T05:52:40Z` via `docs/wiki/HF-Jobs-Training.json`
- Colab free training: `2026-04-19T05:52:29Z` via `docs/wiki/Colab-Free-Training.json`
- Kaggle free training: `2026-04-19T05:52:00Z` via `docs/wiki/Kaggle-Free-Training.json`
- Cloudflare Q inference: `2026-04-19T05:52:31Z` via `docs/wiki/Cloudflare-Q-Inference.json`
- OCI GPU advisor: `2026-05-13T01:11:39Z` via `docs/wiki/OCI-GPU-Advisor.json`
- OCI region capacity: `2026-04-17T02:02:24Z` via `docs/wiki/OCI-Region-Capacity.json`
- Q benchmark corpus: `2026-05-13T01:11:30Z` via `docs/wiki/Q-Benchmark-Corpus.json`
- Q benchmark promotion: `2026-05-12T19:01:08Z` via `docs/wiki/Q-Benchmark-Promotion.json`
- W&B benchmark export: `2026-05-13T10:06:59.572421+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench: `2026-04-19T07:43:17.831Z` via `docs/wiki/Harbor-Terminal-Bench.json`
- Terminal-Bench public task: `2026-04-19T14:31:45.217Z` via `docs/wiki/Terminal-Bench-Public-Task.json`
- Terminal-Bench leaderboard status: `2026-04-19T14:31:45.545Z` via `docs/wiki/Terminal-Bench-Receipt.json`
- Terminal-Bench rerun (diagnostic-only): `2026-04-19T14:31:45.730Z` via `docs/wiki/Terminal-Bench-Rerun.json`
- GitHub checks receipt: `2026-05-13T17:49:10.046Z` via `docs/wiki/GitHub-Checks-Receipt.json`
- Harbor terminal bench soak: `2026-04-16T13:05:24.510Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-17T20:56:29.772Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Release Accountability Gaps

- Status: `blocked`
- Summary: 8 blocking release evidence gap(s): BridgeBench soak stale outside 7d budget; Q gateway substrate stale outside 7d budget; Q mediation drift stale outside 7d budget; Arobi live ledger receipt live ledger receipt does not show the latest governed record publicly; Live mission readiness mission readiness receipt reports missionSurfaceReady=false; Live operator activity mission readiness receipt reports missionSurfaceReady=false; Live operator public export publication status is blocked; Roundtable runtime stale outside 24h budget
- Counts: `13 fresh / 8 blocking / 4 unhealthy / 0 optional missing`

### Blocking gaps

- BridgeBench soak: `stale` via `docs/wiki/BridgeBench-Soak.json` - stale outside 7d budget
- Q gateway substrate: `stale` via `docs/wiki/Q-Gateway-Substrate.json` - stale outside 7d budget
- Q mediation drift: `stale` via `docs/wiki/Q-Mediation-Drift.json` - stale outside 7d budget
- Arobi live ledger receipt: `unhealthy` via `docs/wiki/Arobi-Live-Ledger-Receipt.json` - live ledger receipt does not show the latest governed record publicly
- Live mission readiness: `unhealthy` via `docs/wiki/Live-Mission-Readiness.json` - mission readiness receipt reports missionSurfaceReady=false
- Live operator activity: `unhealthy` via `docs/wiki/Live-Operator-Activity.json` - mission readiness receipt reports missionSurfaceReady=false
- Live operator public export: `unhealthy` via `docs/wiki/Live-Operator-Public-Export.json` - publication status is blocked
- Roundtable runtime: `stale` via `docs/wiki/Roundtable-Runtime.json` - stale outside 24h budget

### Non-blocking warnings

- Supervised mission showcase: `stale` via `docs/wiki/Supervised-Mission-Showcase.json` - stale outside 7d budget
- Q API audit: `stale` via `docs/wiki/Q-API-Audit.json` - stale outside 7d budget
- Arobi decision review: `stale` via `docs/wiki/Arobi-Decision-Review.json` - stale outside 7d budget
- HF Jobs training: `stale` via `docs/wiki/HF-Jobs-Training.json` - stale outside 7d budget
- Colab free training: `stale` via `docs/wiki/Colab-Free-Training.json` - stale outside 7d budget
- Kaggle free training: `stale` via `docs/wiki/Kaggle-Free-Training.json` - stale outside 7d budget
- Cloudflare Q inference: `stale` via `docs/wiki/Cloudflare-Q-Inference.json` - stale outside 7d budget
- OCI region capacity: `stale` via `docs/wiki/OCI-Region-Capacity.json` - stale outside 7d budget
- Harbor terminal bench: `stale` via `docs/wiki/Harbor-Terminal-Bench.json` - stale outside 7d budget
- Terminal-Bench public task: `stale` via `docs/wiki/Terminal-Bench-Public-Task.json` - stale outside 7d budget
- Terminal-Bench leaderboard status: `stale` via `docs/wiki/Terminal-Bench-Receipt.json` - stale outside 7d budget
- Terminal-Bench rerun (diagnostic-only): `stale` via `docs/wiki/Terminal-Bench-Rerun.json` - stale outside 7d budget
- Harbor terminal bench soak: `stale` via `docs/wiki/Harbor-Terminal-Bench-Soak.json` - stale outside 7d budget
- Q benchmark sweep (60m): `stale` via `docs/wiki/Q-Benchmark-Sweep-60m.json` - stale outside 7d budget


## Q Training Bundle

- Lock path: `.training-output/q/latest-training-lock.json`
- Lock generated: `2026-05-12T18:26:42Z`
- Run name: `q-arobi-main-roots-20260512-bench-v1`
- Training dataset rows: `2053`
- Training dataset SHA-256: `22043bf3cea9501688346d62e992bc221d9fcc809cb423c19d02075dae13404f`
- Mix manifest: `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.manifest.json`
- Mix supplemental count: `7`
- Mix supplementals: `training/q/q_harness_identity_seed.json, training/q/q_immaculate_reasoning_seed.json, training/q/terminal_bench_semantic_seed.json, training/q/bridgebench_seed.json, training/q/coding_long_context_seed.json, .training-output/q/q-benchmark-corpus.jsonl, .training-output/q/q-failure-corpus.jsonl`
- Curation run: `cur-fnv1a-6e3f6fdf`

## Hybrid Training Session

- Session path: `.training-output/q/sessions/q-arobi-main-roots-20260512-bench-v1/hybrid-session.json`
- Session generated: `2026-05-13T01:11:39Z`
- Local lane status: `skipped`
- Cloud lane status: `skipped`
- Cloud provider: `manual`
- Immaculate orchestration bundle: `immaculate-orchestration-9b85dbc-e68f2160`
- Immaculate bundle source: `.training-output/immaculate/latest-training-bundle.json`

## Cloudflare Inference Readiness

- Session id: `q-hybrid-harbor-opt-2384cf5-bench-v22`
- Generated: `2026-04-19T05:52:31Z`
- Auth ready: `false`
- Adapter ready: `false`
- Worker ready: `false`
- Eval bundle ready: `true`
- Smoke ready: `false`

## Truth Boundary

- This page identifies the current build and bundle. It does not claim a cloud fine-tune or OCI deployment happened unless those surfaces say so explicitly.
- Generated benchmark and gateway pages remain the evidence layer. This page is the index that ties them back to one repo state.
