# Roundtable Runtime

This page is generated from a live harness pass. It proves the roundtable planner is not just text: Immaculate seeds a bounded Q source, mediates a governed route, records repo-scoped roundtable actions, and binds those actions to isolated agent worktrees across Immaculate, OpenJaws, and Asgard.

- Generated: 2026-04-20T01:22:35.054Z
- Release: `0.1.0+6399fb1`
- Repo commit: `6399fb1`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`

## Benchmark

- Harness URL: `http://127.0.0.1:56796`
- Scenario count: `3`
- Failed assertions: `0`
- Repo coverage P50: `3`
- Materialized actions P50: `3`
- Recorded roundtable actions P50: `3`
- Workspace-scoped turns P50: `1`
- Seed latency P95: `31575.54` ms
- Mediation latency P95: `119055.29` ms
- Runner path latency P95: `147638.55` ms
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics / 16 cores / Q foundation Gemma 4

## Scenarios

### Immaculate and OpenJaws governed repair

- Status: `completed`
- Route suggestion: `cognitive`
- Guard verdict: `unknown`
- Repo coverage: `3`
- Materialized actions: `3`
- Recorded roundtable actions: `3`
- Workspace-scoped turns: `1`
- Schedule roundtable counts: actions `3` / repos `3`
- Session scope preserved: `true`
- Summary: Roundtable single-lane plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization.

### Asgard audit and ledger continuity

- Status: `completed`
- Route suggestion: `cognitive`
- Guard verdict: `unknown`
- Repo coverage: `3`
- Materialized actions: `3`
- Recorded roundtable actions: `3`
- Workspace-scoped turns: `1`
- Schedule roundtable counts: actions `3` / repos `3`
- Session scope preserved: `true`
- Summary: Roundtable single-lane plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization.

### Mixed-pressure roundtable

- Status: `completed`
- Route suggestion: `cognitive`
- Guard verdict: `unknown`
- Repo coverage: `3`
- Materialized actions: `3`
- Recorded roundtable actions: `3`
- Workspace-scoped turns: `1`
- Schedule roundtable counts: actions `3` / repos `3`
- Session scope preserved: `true`
- Summary: Roundtable single-lane plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization.


## Assertions

- roundtable-runtime-scenarios-green: `pass` | target `all scenarios completed` | actual `3/3`
- roundtable-runtime-worktrees-materialized: `pass` | target `all ready actions materialized on agent branches` | actual `immaculate-openjaws:3/3, asgard-audit-ledger:3/3, mixed-pressure-roundtable:3/3`
- roundtable-runtime-audit-captured: `pass` | target `roundtable actions and scoped turns recorded` | actual `immaculate-openjaws:actions=3,turns=1,scope=true | asgard-audit-ledger:actions=3,turns=1,scope=true | mixed-pressure-roundtable:actions=3,turns=1,scope=true`
