# Terminal-Bench Public Task

This page records the latest real local Harbor run against the official public Terminal-Bench task using the default Q-only path.

- Generated: `2026-04-19T07:43:11.245Z`
- Immaculate release: `0.1.0+5ed19b9`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v22-5ed19b9-e0c8b138`
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

## Historical Official Receipt

- Historical official receipt generated: `2026-04-18T06:23:47.663Z`
- Historical official receipt mean reward: `0.000`
- Historical discussion: https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/140
- Historical commit: https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/commit/9a4ad15564f2a3c1303da7c89a08dc10cfec36c3

## Truth Boundary

- This is a real Harbor run on the official public task `terminal-bench/make-mips-interpreter`.
- It is the latest measured local Q-only win, not an official leaderboard claim by itself.
- The official leaderboard receipt remains tracked separately on `docs/wiki/Terminal-Bench-Receipt.md` until a new public submission is made.

## Artifact Paths

- Result JSON: `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-v32/result.json`
- Config JSON: `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-v32/config.json`
