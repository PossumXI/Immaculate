# Codex Guardrails And Mistakes (2026-04-18)

This file is internal. It is not a wins-only public surface.

Purpose:
- record the concrete mistakes made while advancing Q and Immaculate
- turn them into rules and preflight checks
- stop the same avoidable misses from repeating on benchmark, deploy, CI, and public-surface work

## Mistakes Made

### 1. I trusted the wrong deployment path

Mistake:
- I treated the website deployment path like Cloudflare when `iorch.net` was actually deployed through Netlify.

Correction:
- Before talking about live website deploys, inspect the repo deployment config and the authenticated CLI on the machine.
- Required proof before making claims:
  - find the real deploy config in the repo
  - confirm the matching CLI is installed
  - confirm the matching auth is present locally

Rule:
- Never assume the hosting provider from memory or adjacent infra. Verify the actual live deploy path first.

### 2. I trusted GitHub classic commit status instead of the real checks surface

Mistake:
- I treated empty or misleading classic commit status as if CI had not surfaced yet.

Correction:
- For this repo, CI truth comes from GitHub workflow-runs and check-runs, not the classic combined-status API.

Rule:
- Never claim missing CI completion until workflow-runs and check-runs have been checked directly.

### 3. I let failure-oriented wording bleed into public surfaces

Mistake:
- Public-facing surfaces were allowed to carry failure, underperformance, and diagnostic wording that should have stayed out of wins-first repo/wiki/site copy.

Correction:
- Keep failure detail in strict eval and training surfaces only.
- Keep README, wiki home, release surface, and website wins-first and latest-state only.

Rule:
- Never promote failures, regressions, or diagnostic-only reruns into public marketing/release copy.

### 4. I treated missing hidden chat context like recoverable state

Mistake:
- I assumed a previously pasted OCI support identifier could be recovered from hidden/truncated chat context.

Correction:
- If a secret or identifier is not present in current accessible context, require a local env/file source or ask for it again.

Rule:
- Never pretend inaccessible chat history is a reliable secret store.

### 5. I ran Harbor through the wrong interface before checking the actual CLI

Mistake:
- I used stale Harbor flags and wrapper assumptions before checking the installed CLI help and the actual custom-agent invocation shape.

Correction:
- Check `harbor run -h` before long official reruns.
- Use the isolated Harbor venv when the global CLI or dependency stack is broken.
- For this repo’s custom Harbor agent, use `--agent-import-path ...` directly and do not force a built-in `-a` wrapper that conflicts with it.

Rule:
- Never launch a long benchmark job against an unverified CLI invocation path.

### 6. I initially mixed transport failure with semantic failure

Mistake:
- The first Terminal-Bench miss looked like a task-semantics problem, but the real initial blocker was transport: Q planning timed out at the gateway and opened the circuit.

Correction:
- Separate failure classes:
  - transport: timeout, circuit-open, auth, gateway
  - semantic: fake simulator, missing runtime signal, invalid frame artifact
- Only feed semantic misses into the semantic training loop after transport is green enough to reach verifier-backed execution.

Rule:
- Never let transport noise contaminate the semantic fine-tuning target.

### 7. I did not verify the active worktree early enough

Mistake:
- The outer checkout and nested worktrees diverged, which made it easy to inspect or patch the wrong repo copy.

Correction:
- Start every major pass by checking:
  - current worktree path
  - current branch
  - current HEAD
  - whether the edited surface is the active release worktree

Rule:
- Never edit before confirming the active worktree and release branch.

### 8. I let benchmark identity overhead ride into the Harbor task path

Mistake:
- Benchmark traffic initially paid the full Q identity overhead even though the official Harbor path only needed fast governed task execution.

Correction:
- Benchmark requests must explicitly set `x-immaculate-benchmark-skip-q-identity: 1`.
- Keep public identity behavior for normal user traffic, not for synthetic benchmark transport.

Rule:
- Never benchmark the production Q runner with avoidable identity prompt overhead.

### 9. I allowed the Harbor planning payload to stay broader than the verifier needed

Mistake:
- The first planning payload carried too much tree/context noise for the public MIPS task.

Correction:
- For the public `make-mips-interpreter` task, the minimal planning context is:
  - instruction
  - `/app/vm.js` target
  - focused contract reads from:
    - `/app/doomgeneric/README.md`
    - `/app/doomgeneric/doomgeneric/doomgeneric.h`
    - `/app/doomgeneric/doomgeneric/i_video.c`
    - `/app/doomgeneric/doomgeneric/doomgeneric_img.c`
  - `/tests/test_outputs.py` only if `/tests` exists

Rule:
- Never widen the Harbor planning prompt beyond the verifier-visible contract unless the compact path already failed.

### 10. I did not write down the stage-shift when the blocker moved

Mistake:
- After the latest Harbor rerun, the blocker moved from planning transport to generation transport, but that kind of shift is easy to lose without explicit notes.

Correction:
- Record the active blocker stage every time it changes:
  - first blocker: planning request timed out at 120s and opened the circuit
  - current blocker after compaction/header fix: planning succeeds, generation still times out and opens the circuit

Rule:
- Never describe “Terminal-Bench failed” as one undifferentiated thing. Name the failing stage.

### 11. I created a gateway key after startup and treated auth failure like a model miss

Mistake:
- I launched a fresh Q gateway and then minted the Harbor key afterward, which meant the live process had not loaded that key yet.

Correction:
- For a freshly isolated gateway runtime:
  - create the key first, then start the gateway, or
  - if the gateway is already running, mint the key into the same store and explicitly verify authenticated chat before launching Harbor

Rule:
- Never start a long Harbor rerun until the exact gateway key has already succeeded against `/v1/chat/completions`.

### 12. I reused an occupied gateway port and accidentally tested the wrong process

Mistake:
- I attempted to start a new gateway on a port that was already in use, then hit health/auth on the older process instead of the intended one.

Correction:
- Before any isolated benchmark gateway launch:
  - check the port is free
  - confirm the new process actually bound
  - verify the health response matches the intended runtime dir and port

Rule:
- Never trust a gateway health response until the newly started process has a verified listening socket on the requested port.

### 13. I treated a single-task Terminal-Bench draft as an official leaderboard receipt

Mistake:
- I conflated “the submission package uploaded successfully” with “the submission is leaderboard-eligible.”
- The official validator rejected the single-task draft because the leaderboard expects the full `89`-task Terminal-Bench 2.0 sweep.

Correction:
- Treat single-task public-task wins as local/public engineering evidence only.
- Treat the leaderboard as a separate publication surface with its own eligibility rules.
- Before calling anything an official leaderboard receipt, verify the validator result and unique-task coverage.

Rule:
- Never describe a Terminal-Bench draft as an official leaderboard receipt unless the validator accepts the full required task coverage.

## Current Verified State

As of the latest official Harbor rerun on `2026-04-18`:
- job: `q-terminal-bench-public-generic-smoke-postfix16`
- official Harbor result: `0.000`
- agent exceptions: `0`
- total runtime: `2m 44s`
- planning now succeeds deterministically under Immaculate-owned task planning
- the agent now preserves `q-agent-output.json` with stage journal, Q self-evaluation, and Immaculate self-evaluation even on failure
- active failure stage: terminal file generation, not terminal planning
- active remaining blocker: generation still hits `q_upstream_failure / circuit_open` before a verifier-backed `vm.js` is produced

## Preflight Checklist

Use this before any official public-task Harbor rerun:

1. Worktree
- confirm active worktree path
- confirm branch and HEAD
- confirm edits are landing in the active release worktree

2. Gateway
- start a clean Q-only gateway on a dedicated port
- verify `/health`
- verify `/v1/models`
- confirm only `Q` is exposed

3. Harbor
- use the isolated Harbor venv
- run `harbor run -h`
- verify the exact custom-agent invocation before launching a long job

4. Benchmark transport
- send benchmark requests with `x-immaculate-benchmark-skip-q-identity: 1`
- keep planning payload compact
- log planning payload size
- record the first failing stage if the run misses

5. Public surfaces
- keep wins-first public surfaces free of failure copy
- keep failure evidence in failure corpus, training notes, and internal planning docs only

6. CI truth
- verify workflow-runs and check-runs, not just classic commit status

## Immediate Next Actions

1. Keep the compact deterministic planning path and continue shrinking the generation-stage wall clock.
2. Train Q specifically against the semantic MIPS/doomgeneric miss once generation reaches verifier-backed execution again.
3. Keep transport misses out of the semantic training target until generation clears the gateway reliably.
4. Only resubmit a public Terminal-Bench receipt when the default Q-only path is green without diagnostic shims.
5. For the official leaderboard, do not submit again until the run covers the full `89` unique Terminal-Bench 2.0 tasks.
