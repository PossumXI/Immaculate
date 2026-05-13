# Roundtable Runtime

This page is generated from a live harness pass. It proves the roundtable planner is not just text: Immaculate runs a governed mediation route, records repo-scoped roundtable actions, and binds those actions to isolated agent worktrees across Immaculate, OpenJaws, and Asgard. The direct seed step is a best-effort warm-up signal; the governed mediation path is the authoritative route.

- Generated: 2026-05-13T21:36:50.342Z
- Release: `0.1.0+816dbd9`
- Repo commit: `816dbd9`
- Q training bundle: `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`

## Benchmark

- Harness URL: `http://127.0.0.1:56683`
- Scenario count: `0`
- Failed assertions: `1`
- Seed accepted scenarios: `0/0`
- Mediation accepted scenarios: `0/0`
- Repo coverage P50: `0`
- Materialized actions P50: `0`
- Probed actions P50: `0`
- Branch-authority matches P50: `0`
- Execution bundles P50: `0`
- Execution-ready lanes P50: `0`
- Task documents P50: `0`
- Audit receipts P50: `0`
- Execution receipts P50: `0`
- Recorded roundtable actions P50: `0`
- Workspace-scoped turns P50: `0`
- Tracked files P50: `0`
- Seed latency P95: `0` ms
- Mediation latency P95: `0` ms
- Runner path latency P95: `0` ms
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics / 16 cores / Q foundation Gemma 4
- Execution integrity digest: `3142f25e5c9a1435`
- Decision trace ledger: `pending`
- Decision trace events: `0`
- Decision trace findings: `0`
- Decision trace head hash: `none`

## Shared Readiness

- Mission-surface ready: `false`
- Summary: shared readiness blocked: unconfigured: public ledger endpoint not configured for this pass | unconfigured: private ledger endpoint not configured for this pass | http://127.0.0.1:11435: local Q accepted 0/0 seed+mediation scenario pair(s) | unconfigured: OCI-backed Q runtime not configured for this pass | unconfigured: Discord transport not configured for this pass
- ledger.public: `not_configured` | public ledger endpoint not configured for this pass
- ledger.private: `not_configured` | private ledger endpoint not configured for this pass
- q.local: `blocked` @ `http://127.0.0.1:11435` | local Q accepted 0/0 seed+mediation scenario pair(s)
- q.oci: `not_configured` | OCI-backed Q runtime not configured for this pass
- discord.transport: `not_configured` | Discord transport not configured for this pass

## Scenarios


## Assertions

- roundtable-runtime-iteration-error: `fail` | target `loop iteration completes` | actual `Roundtable runtime local Q prewarm failed at http://127.0.0.1:11435: transport_timeout / Ollama request timed out after 60000 ms.`
