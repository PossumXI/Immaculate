# Terminal-Bench Receipt

This page records the official public-task Terminal-Bench leaderboard receipt submission for the real `Q` lane. It is a real Harbor job plus a real public PR/discussion on the official leaderboard dataset repo.

- Generated: `2026-04-18T01:43:40.315Z`
- Release: `0.1.0+8874851`
- Repo commit: `887485123b57de8b4c6ea87c8c6911db3cf14dda`
- Q serving label: `Q`
- Measured bundle boundary: this page is tied to the last verified public-task Harbor run and can remain on an older Q bundle than the active release surface until that public task is rerun.
- Leaderboard repo: `harborframework/terminal-bench-2-leaderboard`
- Submission PR/discussion: https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/140
- Submission commit: https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/commit/9a4ad15564f2a3c1303da7c89a08dc10cfec36c3

## What Ran

- Dataset: `terminal-bench/terminal-bench-2`
- Public task: `terminal-bench/make-mips-interpreter`
- Dataset ref: `sha256:c6fc2e2382c1dbae99b2d5ecd2f4f4a60c3c01e0d84642d69b4afd92e99d078b`
- Harbor agent import path: `benchmarks.harbor.q_harbor_agent:HarborQAgent`
- Harbor model: `Q`
- Harbor job name: `q-terminal-bench-public-receipt`
- Attempts: `5`
- Concurrent trials: `1`
- Timeout multiplier: `1`
- Timeout overrides present: `no`
- Resource overrides present: `no`

## Measured Result

- Started: `2026-04-16T11:52:39.729045`
- Finished: `2026-04-16T12:00:16.281122`
- Duration: `456.55 s`
- Trials: `5`
- Errors: `0`
- Mean reward: `0.000`
- pass@2 `0.000`, pass@4 `0.000`, pass@5 `0.000`
- Trial ids: `make-mips-interpreter__8rHSUQ2, make-mips-interpreter__Hho3A4K, make-mips-interpreter__MyvbUq7, make-mips-interpreter__UUSmarr, make-mips-interpreter__zYpyWMm`

## Submission Package

- Agent display name: `Immaculate Q Harbor`
- Agent org: `PossumX.dev`
- Agent URL: `https://github.com/PossumXI/Immaculate`
- Model name: `Q`
- Foundation model: `Gemma 4`
- Model org: `Arobi Technology Alliance`
- Discussion state observed: `open`
- Merge state observed: `ready-to-merge`
- Submission commit verified: `yes`

## Why This Matters

- This is not just a local benchmark note. It is a real public receipt on the official Terminal-Bench leaderboard submission repo.
- The receipt proves the real `Q` lane can be packaged, evaluated on a public Terminal-Bench task, and submitted through the official Harbor/Hugging Face path without hiding behind a repo-local task pack.
- The result is intentionally kept honest: the score here is poor, but the receipt and submission mechanics are real.

## Truth Boundary

- This is one public-task receipt for `terminal-bench/make-mips-interpreter`, not a full Terminal-Bench leaderboard sweep.
- The PR/discussion is currently open and ready to merge; this page does not claim it is already merged unless the discussion page says so later.
- The published score here is `0.000`, so this page proves official receipt and submission, not strong public-task performance.
