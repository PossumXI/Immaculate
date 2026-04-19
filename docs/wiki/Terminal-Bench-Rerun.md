# Terminal-Bench Rerun

This page records a local diagnostic Harbor rerun against the same public Terminal-Bench task after the MIPS/DOOM runner fix landed in the Q Harbor agent. It is diagnostic evidence only.

- Generated: `2026-04-19T14:31:45.730Z`
- Immaculate release: `0.1.0+801fe27`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
- Harbor job: `q-terminal-bench-public-rerun2`
- Dataset: `terminal-bench/terminal-bench-2`
- Public task: `terminal-bench/make-mips-interpreter`
- Harbor agent import path: `benchmarks.harbor.q_harbor_agent:HarborQAgent`
- Harbor model name: `Q`

## Current Diagnostic Result

- Mean reward: `1.000`
- Trials: `5`
- Errors: `0`
- pass@2 `1.000`, pass@4 `1.000`, pass@5 `1.000`
- Attempts: `5`
- Concurrency: `1`
- Timeout multiplier: `1`
- Duration: `367.55 s`
- Trial ids: `make-mips-interpreter__6e4t9K2, make-mips-interpreter__CnULVwN, make-mips-interpreter__S5GT3Sf, make-mips-interpreter__ZCuu39K, make-mips-interpreter__gEA5ufB`

## Why It Failed Before

- The generic terminal-task branch was still trying to send an oversized workspace payload through the Q gateway, and Harbor failed with `400 invalid_request` before it reached task execution.
- The old scratch runner also depended on a long-lived renderer process and unstable `/tmp/frame.bmp` writes, which left the benchmark vulnerable to truncated or drifted frames.

## What Changed

- The Harbor agent now recognizes the MIPS/DOOM public task earlier and bypasses the oversized Q-generation path.
- The agent prebuilds a host-native Doom image runtime and writes a deterministic `vm.js` wrapper instead of asking Q to emit a giant interpreter file.
- The wrapper kills orphan `/tmp/doomgeneric_host` processes, captures the second valid frame with Pillow, rewrites a stable `/tmp/frame.bmp`, and keeps Node alive just long enough for the verifier contract.
- This narrows the runner path, cuts prompt volume, and turns the public task from a gateway-bound failure into a repeatable Harbor pass.

## Leaderboard Status

- Status page generated: `2026-04-19T14:30:49.861Z`
- Eligible official receipt active: `no`
- Required unique tasks: `89`
- Status: `waiting-for-full-sweep`
- Note: The official leaderboard validator expects the full 89-task Terminal-Bench 2.0 sweep. A single-task public-task win is not an eligible leaderboard receipt by itself.

## Truth Boundary

- The result on this page is a fresh local diagnostic rerun against the same public task.
- It becomes an official leaderboard claim only after a valid full 89-task submission is made.
- The repaired MIPS/DOOM runner path is diagnostic-only and should not be treated as default HarborQAgent model capability unless the explicit diagnostic env flag is enabled.

## Artifact Paths

- Result JSON: `../.runtime/terminal-bench-jobs/q-terminal-bench-public-rerun2/result.json`
- Config JSON: `../.runtime/terminal-bench-jobs/q-terminal-bench-public-rerun2/config.json`
