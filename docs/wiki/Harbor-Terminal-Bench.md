# Harbor Terminal Bench

This page records the repo-local Harbor task pack for Immaculate and Q. It is a real executed benchmark surface, not a claim about leaderboard submission.

- Generated: `2026-04-16T12:43:37.599Z`
- Release: `0.1.0+eca7765`
- Repo commit: `eca77656e19999c7a76388b1b8ffd2baee7f3c1a`
- Q serving label: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-86bf2b5-6207dd5e`

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

## Q Gateway Transport Fix

- Pre-fix gateway probe: `failed` at `300678` ms. Structured Q gateway request failed around the 300-second mark with fetch failed.
- Direct Ollama probe: `passed` at `412787.48` ms. Direct Ollama /api/chat call returned a valid ROUTE/REASON/COMMIT response.
- Post-fix gateway probe: `passed` at `8029.01` ms. The same structured prompt succeeded through the repaired Q gateway after moving off Node fetch to explicit http/https transport and raising the timeout budget.

## LLM Judge Attempts

- `openai/Q via Q gateway`: `failed` in `667.100` s. RewardKit judge reached the repaired Q gateway but returned malformed non-schema JSON, so the score was not accepted. Error: `JSONDecodeError while parsing judge response under LITELLM_DROP_PARAMS=1`

## Truth Boundary

- This is a repo-local Harbor task pack, not a Terminal-Bench leaderboard submission.
- The current Harbor pack covers two structured operator tasks, not the full Terminal-Bench public corpus.
- The published Q scores are real runs against the real Q endpoint on the local Harbor gateway.
