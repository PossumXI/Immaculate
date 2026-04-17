# Harbor Terminal Bench

This page records the repo-local Harbor task pack for Immaculate and Q. It is a real executed benchmark surface, not a claim about leaderboard submission.

- Generated: `2026-04-17T02:45:25.427Z`
- Release: `0.1.0+3c3e41d`
- Repo commit: `3c3e41d99de4ee12273359707ffe5f0e2025e851`
- Q serving label: `Q`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v1-45280d5-a181f850`

## What Ran

- Harbor ran in WSL on Docker Desktop.
- Oracle validated both repo-local tasks before the Q lane was accepted.
- The published Q scores below are the combined RewardKit result from programmatic checks plus the local Q LLM judge.
- The answer key is mounted only under `/tests/reference.json` in the task pack, so the live agent cannot read it from `/app`.

## Q structured contract

- Oracle score: `1.000`
- Oracle duration: `121.72 s`
- Q gateway score: `0.950`
- Q programmatic score: `1.000`
- Q LLM-judge score: `0.900`
- Q gateway duration: `121.27 s`
- Oracle job: `.runtime/harbor-custom/harbor-q-oracle-fixed`
- Q gateway job: `.runtime/harbor-custom/harbor-q-agent-fixed`
- Reference visible to agent: `no`
- Q self-repair needed: `no`
- Q route: `guarded`
- Q reason: Late ACK and nonce mismatch violate ledger truthfulness; fail-closed is required.
- Q commit: Ignore the invalid ACK, maintain the current delivery state, and await trusted confirmation.

## Immaculate bridge fail-closed

- Oracle score: `1.000`
- Oracle duration: `117.54 s`
- Q gateway score: `0.925`
- Q programmatic score: `1.000`
- Q LLM-judge score: `0.850`
- Q gateway duration: `173.12 s`
- Oracle job: `.runtime/harbor-custom/harbor-immaculate-oracle-fixed`
- Q gateway job: `.runtime/harbor-custom/harbor-immaculate-agent-fixed`
- Reference visible to agent: `no`
- Q self-repair needed: `no`
- Q route: `guarded`
- Q reason: Bridge ACK is late and nonce replayed, but direct HTTP/2 is healthy and allowed.
- Q commit: Use direct HTTP/2 for orchestration, maintaining fail-closed posture regarding the bridge.

## Truth Boundary

- This is a repo-local Harbor task pack, not a Terminal-Bench leaderboard submission.
- The current Harbor pack covers two structured operator tasks, not the full Terminal-Bench public corpus.
- The published Q scores are real runs against the real Q endpoint on the local Harbor gateway.
