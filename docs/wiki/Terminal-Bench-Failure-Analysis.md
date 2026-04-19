# Terminal-Bench Failure Analysis

This page explains the real public-task Terminal-Bench failure, the fixes already shipped, and the remaining gap.

- Historical single-task leaderboard draft: `0.000` on `terminal-bench/make-mips-interpreter`
- Local diagnostic rerun: `5/5`, diagnostic-only, not a new leaderboard claim
- Latest default-path generic smoke: `1` trial, `0` errors, completed end-to-end at reward `0.0`

## Why It Failed

- The original generic Harbor path was sending too much workspace context into the Q gateway and failed with `400 invalid_request` before the task was really attempted.
- The task itself is hard: it requires long-horizon reasoning over an ELF binary, filesystem effects, frame extraction, and a verifier contract around `/tmp/frame.bmp`.
- After the prompt-overflow fix landed, the failure stopped being a size-bound request problem and became a solve-depth problem under real task pressure.

## What Was Fixed

- The Harbor agent now compacts terminal-task planning and generation payloads instead of dumping the whole workspace into Q.
- Binary files are no longer inlined into prompt context; ELF-like files are marked as omitted instead of being pasted as garbage bytes.
- The MIPS/DOOM special-case runner was kept, but it is now explicitly diagnostic-only behind `IMMACULATE_ENABLE_TERMINAL_BENCH_DIAGNOSTIC_SHIMS`.
- The Harbor agent now waits on the Q gateway health surface and retries once when the gateway returns `q_upstream_failure` with `circuit_open`, instead of failing immediately on an open circuit.

## Current Measured State

- Historical single-task leaderboard draft remains `0.000` and is no longer treated as an eligible official receipt.
- Local diagnostic rerun remains `1.000` / `5` trials and proves the harness plus verifier contract can pass when the explicit diagnostic shim is enabled.
- A fresh default-path generic smoke now completes the full Harbor trial with `0` exceptions, `3` internal attempts, and a final reward of `0.0` after `10m 16s`.
- That completed run used a `2921`-character generation payload and explicitly marked `/app/doomgeneric_mips` as `[binary file omitted: doomgeneric_mips, 1543608 bytes]`.
- The verifier result on that completed run proves the remaining miss: Q produced a simulation-style `vm.js` that exited cleanly and wrote a frame file, but it did not implement the real MIPS interpreter behavior the task expects.
- The earlier fresh generic smokes are still useful history: one moved the failure to `APITimeoutError`, and another briefly failed on `503 q_upstream_failure` / `circuit_open` before the gateway-wait retry landed.

## What This Means

- The primary Terminal-Bench blocker is no longer prompt size or immediate gateway failure.
- The remaining blocker is Q under real task pressure: solve depth, long-horizon execution planning, anti-cheating realism, and better use of verifier feedback.
- Immaculate is doing the right thing by surfacing the drift honestly instead of silently swapping in a hidden fallback.

## Next Fixes

1. Keep the default Harbor path generic and Q-only, then train Q on the real failure seeds already flowing from Terminal-Bench, Harbor wording losses, and the strict Q failure corpus.
2. Add bounded terminal-task retries that preserve the current compact prompt discipline instead of re-expanding the workspace.
3. Train Q harder against “fake simulator” failure patterns so it stops producing superficially successful stubs that satisfy process shape but fail semantic verification.
4. Rerun the same public task without the diagnostic shim and only resubmit once the default path itself is genuinely green.
