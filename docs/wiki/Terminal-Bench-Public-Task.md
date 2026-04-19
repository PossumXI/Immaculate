# Terminal-Bench Public Task

This page records the latest real local Harbor run against the official public Terminal-Bench task using the default Q-only path.

- Generated: `2026-04-19T14:31:45.217Z`
- Immaculate release: `0.1.0+801fe27`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
- Harbor job: `q-terminal-bench-public-generic-smoke-v32`
- Dataset: `terminal-bench/terminal-bench-2`
- Public task: `terminal-bench/make-mips-interpreter`
- Harbor agent import path: `benchmarks.harbor.q_harbor_agent:HarborQAgent`
- Harbor model name: `Q`

## Latest Measured Result

- Mean reward: `1.000`
- Trials: `5`
- Errors: `0`
- pass@2 `1.000`, pass@4 `1.000`, pass@5 `1.000`
- Attempts: `5`
- Concurrency: `1`
- Timeout multiplier: `1`
- Duration: `494.35 s`
- Trial ids: `make-mips-interpreter__4ar2oRd, make-mips-interpreter__Ai8MJ5R, make-mips-interpreter__BfoWoUZ, make-mips-interpreter__GQfgcuF, make-mips-interpreter__dddRzPB`

## Leaderboard Status

- Status page generated: `2026-04-19T14:30:49.861Z`
- Eligible official receipt active: `no`
- Required unique tasks: `89`
- Status: `waiting-for-full-sweep`
- Note: The official leaderboard validator expects the full 89-task Terminal-Bench 2.0 sweep. A single-task public-task win is not an eligible leaderboard receipt by itself.

## Truth Boundary

- This is a real Harbor run on the official public task `terminal-bench/make-mips-interpreter`.
- It is the latest measured local Q-only win, not an official leaderboard claim by itself.
- Official leaderboard publication remains gated on the full 89-task sweep requirement tracked on `docs/wiki/Terminal-Bench-Receipt.md`.

## Artifact Paths

- Result JSON: `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-v32/result.json`
- Config JSON: `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-v32/config.json`
