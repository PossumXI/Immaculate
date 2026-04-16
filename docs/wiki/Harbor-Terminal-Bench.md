# Harbor Terminal Bench

This page records the repo-local Harbor task pack for Immaculate and Q. It is a real executed benchmark surface, not a claim about leaderboard submission.

- Generated: `2026-04-16T13:05:23.427Z`
- Release: `0.1.0+555b65c`
- Repo commit: `555b65c753e642cbb1adb3082561f1cc92e7476b`
- Q serving label: `Q`
- Q training bundle: `none generated yet`

## What Ran

- Harbor ran in WSL on Docker Desktop.
- Oracle validated both repo-local tasks before the Q lane was accepted.
- The published Q scores below are the combined RewardKit result from programmatic checks plus the local Q LLM judge.
- The answer key is mounted only under `/tests/reference.json` in the task pack, so the live agent cannot read it from `/app`.

## Q structured contract

- Oracle score: `1.000`
- Oracle duration: `79.03 s`
- Q gateway score: `0.817`
- Q programmatic score: `0.933`
- Q LLM-judge score: `0.700`
- Q gateway duration: `70.14 s`
- Oracle job: `.runtime/harbor-custom/harbor-q-oracle-fixed`
- Q gateway job: `.runtime/harbor-custom/harbor-q-agent-fixed`
- Reference visible to agent: `no`
- Q self-repair needed: `no`
- Q route: `guarded`
- Q reason: Operators require fail-closed behavior due to an unverified ACK path, necessitating caution.
- Q commit: Maintain fail-closed posture until the ACK path is fully trusted again, per operator directive.

## Immaculate bridge fail-closed

- Oracle score: `1.000`
- Oracle duration: `53.20 s`
- Q gateway score: `0.850`
- Q programmatic score: `1.000`
- Q LLM-judge score: `0.700`
- Q gateway duration: `80.76 s`
- Oracle job: `.runtime/harbor-custom/harbor-immaculate-oracle-fixed`
- Q gateway job: `.runtime/harbor-custom/harbor-immaculate-agent-fixed`
- Reference visible to agent: `no`
- Q self-repair needed: `no`
- Q route: `guarded`
- Q reason: Bridge is degraded, so a guarded route is chosen. The direct HTTP/2 path remains healthy and trustworthy.
- Q commit: Proceed with guarded orchestration, relying on the healthy direct HTTP/2 path as per constraints.

## Truth Boundary

- This is a repo-local Harbor task pack, not a Terminal-Bench leaderboard submission.
- The current Harbor pack covers two structured operator tasks, not the full Terminal-Bench public corpus.
- The published Q scores are real runs against the real Q endpoint on the local Harbor gateway.
