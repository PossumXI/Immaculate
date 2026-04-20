# Roundtable Runtime

This page is generated from a live harness pass. It proves the roundtable planner is not just text: Immaculate runs a governed mediation route, records repo-scoped roundtable actions, and binds those actions to isolated agent worktrees across Immaculate, OpenJaws, and Asgard. The direct seed step is a best-effort warm-up signal; the governed mediation path is the authoritative route.

- Generated: 2026-04-20T18:39:21.299Z
- Release: `0.1.0+dc0ece0`
- Repo commit: `dc0ece0`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`

## Benchmark

- Harness URL: `http://127.0.0.1:57543`
- Scenario count: `3`
- Failed assertions: `0`
- Repo coverage P50: `3`
- Materialized actions P50: `3`
- Probed actions P50: `3`
- Branch-authority matches P50: `3`
- Execution bundles P50: `3`
- Execution-ready lanes P50: `3`
- Task documents P50: `3`
- Recorded roundtable actions P50: `3`
- Workspace-scoped turns P50: `0`
- Tracked files P50: `2241`
- Seed latency P95: `1338.09` ms
- Mediation latency P95: `5375.39` ms
- Runner path latency P95: `6645.55` ms
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics / 16 cores / Q foundation Gemma 4

## Scenarios

### Immaculate and OpenJaws governed repair

- Status: `completed`
- Route suggestion: `unknown`
- Guard verdict: `unknown`
- Repo coverage: `3`
- Materialized actions: `3`
- Probed actions: `3`
- Branch-authority matches: `3`
- Execution bundles: `3`
- Execution-ready lanes: `3`
- Task documents: `3`
- Recorded roundtable actions: `3`
- Workspace-scoped turns: `0`
- Tracked files P50: `2241`
- Schedule roundtable counts: actions `3` / repos `3`
- Session scope preserved: `true`
- Sample files: `Doc/Planning/README.md`, `README.md`, `apps/dashboard/package.json`, `apps/dashboard/tsconfig.json`, `apps/harness/package.json`, `apps/harness/src/server.ts`
- Summary: Roundtable single-lane plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization. Execution bundles prepared for 3/3 lane(s); 3/3 lane(s) remain authority-bound and ready for isolated agent work.

### Asgard audit and ledger continuity

- Status: `completed`
- Route suggestion: `unknown`
- Guard verdict: `unknown`
- Repo coverage: `3`
- Materialized actions: `3`
- Probed actions: `3`
- Branch-authority matches: `3`
- Execution bundles: `3`
- Execution-ready lanes: `3`
- Task documents: `3`
- Recorded roundtable actions: `3`
- Workspace-scoped turns: `0`
- Tracked files P50: `2241`
- Schedule roundtable counts: actions `3` / repos `3`
- Session scope preserved: `true`
- Sample files: `Doc/Planning/README.md`, `README.md`, `apps/dashboard/package.json`, `apps/dashboard/tsconfig.json`, `apps/harness/package.json`, `apps/harness/src/server.ts`
- Summary: Roundtable single-lane plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization. Execution bundles prepared for 3/3 lane(s); 3/3 lane(s) remain authority-bound and ready for isolated agent work.

### Mixed-pressure roundtable

- Status: `completed`
- Route suggestion: `unknown`
- Guard verdict: `unknown`
- Repo coverage: `3`
- Materialized actions: `3`
- Probed actions: `3`
- Branch-authority matches: `3`
- Execution bundles: `3`
- Execution-ready lanes: `3`
- Task documents: `3`
- Recorded roundtable actions: `3`
- Workspace-scoped turns: `0`
- Tracked files P50: `2235`
- Schedule roundtable counts: actions `3` / repos `3`
- Session scope preserved: `true`
- Sample files: `Doc/Planning/README.md`, `README.md`, `apps/dashboard/package.json`, `apps/dashboard/tsconfig.json`, `apps/harness/package.json`, `apps/harness/src/server.ts`
- Summary: Roundtable single-lane plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization. Execution bundles prepared for 3/3 lane(s); 3/3 lane(s) remain authority-bound and ready for isolated agent work.


## Assertions

- roundtable-runtime-scenarios-green: `pass` | target `all scenarios completed` | actual `3/3`
- roundtable-runtime-worktrees-materialized: `pass` | target `all ready actions materialized on agent branches` | actual `immaculate-openjaws:3/3, asgard-audit-ledger:3/3, mixed-pressure-roundtable:3/3`
- roundtable-runtime-branch-authority-bound: `pass` | target `all ready actions probed and bound to their agent branch authority` | actual `immaculate-openjaws:probes=3/3,authority=3/3 | asgard-audit-ledger:probes=3/3,authority=3/3 | mixed-pressure-roundtable:probes=3/3,authority=3/3`
- roundtable-runtime-execution-bundles: `pass` | target `all ready actions emitted execution bundles` | actual `immaculate-openjaws:bundles=3/3,ready=3/3,docs=3 | asgard-audit-ledger:bundles=3/3,ready=3/3,docs=3 | mixed-pressure-roundtable:bundles=3/3,ready=3/3,docs=3`
- roundtable-runtime-audit-captured: `pass` | target `roundtable actions and execution bundles recorded` | actual `immaculate-openjaws:actions=3,turns=0,bundles=3,scope=true | asgard-audit-ledger:actions=3,turns=0,bundles=3,scope=true | mixed-pressure-roundtable:actions=3,turns=0,bundles=3,scope=true`
