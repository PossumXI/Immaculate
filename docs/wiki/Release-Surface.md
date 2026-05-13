# Release Surface

This page is generated from repo state. It is the plain-English answer to a simple question: what exact build and training bundle do the current Immaculate and Q docs describe?

- Generated: 2026-05-13T17:01:25.956Z
- Immaculate release: `0.1.0+5e64812`
- Repo commit: `5e64812c5415bdafa990085f235371b20b670abf`
- Branch: `main`
- Root package version: `0.1.0`
- Harness package version: `0.1.0`
- Core package version: `0.1.0`
- Q model name: `Q`
- Q foundation model: `Gemma 4`
- Q training bundle: `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`
- Q hybrid session: `q-arobi-main-roots-20260512-bench-v1`

## What This Means In Plain English

- Immaculate build `0.1.0+5e64812` is the current repo build stamp.
- Arobi Network is the ledger-backed private and public operator network and audit substrate. Immaculate is the governed harness and orchestrator inside it. Q is the reasoning brain inside that governed stack.
- Q is the only public model name used across the repo, and it is built on `Gemma 4`.
- The latest tracked Q training bundle is `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`, tied to dataset `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.jsonl` and config/provenance captured in `.training-output/q/latest-training-lock.json`.
- The latest hybrid session is `q-arobi-main-roots-20260512-bench-v1`, with local lane `skipped` and cloud lane `skipped` on provider `manual`.
- A separate Cloudflare inference readiness surface is tracked for session `q-hybrid-harbor-opt-2384cf5-bench-v22`, while the current public wins remain the Terminal-Bench public-task pass, the green mediation/substrate lanes, and the linked Arobi decision review.

## Current Evidence Surfaces

- BridgeBench: `2026-05-07T04:12:53.126Z` via `docs/wiki/BridgeBench.json`
- BridgeBench soak: `2026-04-15T06:15:54.188Z` via `docs/wiki/BridgeBench-Soak.json`
- Q structured contract benchmark: `2026-05-07T06:03:07.620Z` via `docs/wiki/Model-Benchmark-Comparison.json`
- Q readiness gate: `2026-05-07T07:32:49.907Z` via `docs/wiki/Q-Readiness-Gate.json`
- Q gateway validation: `2026-05-07T07:32:32.750Z` via `docs/wiki/Q-Gateway-Validation.json`
- Q gateway substrate: `2026-04-19T22:06:38.757Z` via `docs/wiki/Q-Gateway-Substrate.json`
- Q mediation drift: `2026-04-19T22:06:40.025Z` via `docs/wiki/Q-Mediation-Drift.json`
- Arobi audit integrity: `2026-05-12T18:09:17.101Z` via `docs/wiki/Arobi-Audit-Integrity.json`
- Arobi live ledger receipt: `2026-04-21T22:18:04.712Z` via `docs/wiki/Arobi-Live-Ledger-Receipt.json`
- Live mission readiness: `2026-04-22T00:57:50.993Z` via `docs/wiki/Live-Mission-Readiness.json`
- Live operator activity: `2026-04-22T00:57:56.085Z` via `docs/wiki/Live-Operator-Activity.json`
- Live operator public export: `2026-04-25T18:32:05.367Z` via `docs/wiki/Live-Operator-Public-Export.json`
- Cross-project workflow health: `2026-05-07T07:45:24.059Z` via `docs/wiki/Cross-Project-Workflow-Health.json`
- Supervised mission showcase: `2026-04-22T01:20:45.053Z` via `docs/wiki/Supervised-Mission-Showcase.json`
- Roundtable actionability: `2026-04-21T16:11:05.129Z` via `docs/wiki/Roundtable-Actionability.json`
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
- W&B benchmark export: `2026-05-12T10:07:09.017944+00:00` via `docs/wiki/Benchmark-Wandb-Export.json`
- Harbor terminal bench: `2026-04-19T07:43:17.831Z` via `docs/wiki/Harbor-Terminal-Bench.json`
- Terminal-Bench public task: `2026-04-19T14:31:45.217Z` via `docs/wiki/Terminal-Bench-Public-Task.json`
- Terminal-Bench leaderboard status: `2026-04-19T14:31:45.545Z` via `docs/wiki/Terminal-Bench-Receipt.json`
- Terminal-Bench rerun (diagnostic-only): `2026-04-19T14:31:45.730Z` via `docs/wiki/Terminal-Bench-Rerun.json`
- GitHub checks receipt: `2026-04-16T17:54:12.583Z` via `docs/wiki/GitHub-Checks-Receipt.json`
- Harbor terminal bench soak: `2026-04-16T13:05:24.510Z` via `docs/wiki/Harbor-Terminal-Bench-Soak.json`
- Q benchmark sweep (60m): `2026-04-17T20:56:29.772Z` via `docs/wiki/Q-Benchmark-Sweep-60m.json`

## Release Accountability Gaps

- Status: `blocked`
- Summary: 11 blocking release evidence gap(s): BridgeBench soak stale (28d old, budget 7d); Q gateway substrate stale (24d old, budget 7d); Q mediation drift stale (24d old, budget 7d); Arobi live ledger receipt stale (22d old, budget 24h); Live mission readiness stale (22d old, budget 24h); Live operator activity stale (22d old, budget 24h); Live operator public export stale (18d old, budget 24h); Cross-project workflow health stale (6d old, budget 24h); Roundtable actionability stale (22d old, budget 24h); Roundtable runtime stale (22d old, budget 24h); GitHub checks receipt stale (27d old, budget 24h)
- Counts: `10 fresh / 11 blocking / 0 optional missing`

### Blocking gaps

- BridgeBench soak: `stale` via `docs/wiki/BridgeBench-Soak.json` - stale (28d old, budget 7d)
- Q gateway substrate: `stale` via `docs/wiki/Q-Gateway-Substrate.json` - stale (24d old, budget 7d)
- Q mediation drift: `stale` via `docs/wiki/Q-Mediation-Drift.json` - stale (24d old, budget 7d)
- Arobi live ledger receipt: `stale` via `docs/wiki/Arobi-Live-Ledger-Receipt.json` - stale (22d old, budget 24h)
- Live mission readiness: `stale` via `docs/wiki/Live-Mission-Readiness.json` - stale (22d old, budget 24h)
- Live operator activity: `stale` via `docs/wiki/Live-Operator-Activity.json` - stale (22d old, budget 24h)
- Live operator public export: `stale` via `docs/wiki/Live-Operator-Public-Export.json` - stale (18d old, budget 24h)
- Cross-project workflow health: `stale` via `docs/wiki/Cross-Project-Workflow-Health.json` - stale (6d old, budget 24h)
- Roundtable actionability: `stale` via `docs/wiki/Roundtable-Actionability.json` - stale (22d old, budget 24h)
- Roundtable runtime: `stale` via `docs/wiki/Roundtable-Runtime.json` - stale (22d old, budget 24h)
- GitHub checks receipt: `stale` via `docs/wiki/GitHub-Checks-Receipt.json` - stale (27d old, budget 24h)

### Non-blocking warnings

- Supervised mission showcase: `stale` via `docs/wiki/Supervised-Mission-Showcase.json` - stale (22d old, budget 7d)
- Q API audit: `stale` via `docs/wiki/Q-API-Audit.json` - stale (24d old, budget 7d)
- Arobi decision review: `stale` via `docs/wiki/Arobi-Decision-Review.json` - stale (24d old, budget 7d)
- HF Jobs training: `stale` via `docs/wiki/HF-Jobs-Training.json` - stale (24d old, budget 7d)
- Colab free training: `stale` via `docs/wiki/Colab-Free-Training.json` - stale (24d old, budget 7d)
- Kaggle free training: `stale` via `docs/wiki/Kaggle-Free-Training.json` - stale (24d old, budget 7d)
- Cloudflare Q inference: `stale` via `docs/wiki/Cloudflare-Q-Inference.json` - stale (24d old, budget 7d)
- OCI region capacity: `stale` via `docs/wiki/OCI-Region-Capacity.json` - stale (27d old, budget 7d)
- Harbor terminal bench: `stale` via `docs/wiki/Harbor-Terminal-Bench.json` - stale (24d old, budget 7d)
- Terminal-Bench public task: `stale` via `docs/wiki/Terminal-Bench-Public-Task.json` - stale (24d old, budget 7d)
- Terminal-Bench leaderboard status: `stale` via `docs/wiki/Terminal-Bench-Receipt.json` - stale (24d old, budget 7d)
- Terminal-Bench rerun (diagnostic-only): `stale` via `docs/wiki/Terminal-Bench-Rerun.json` - stale (24d old, budget 7d)
- Harbor terminal bench soak: `stale` via `docs/wiki/Harbor-Terminal-Bench-Soak.json` - stale (27d old, budget 7d)
- Q benchmark sweep (60m): `stale` via `docs/wiki/Q-Benchmark-Sweep-60m.json` - stale (26d old, budget 7d)


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
