# Harbor Terminal Bench

This page records the repo-local Harbor task pack for Immaculate and Q. It is a real executed benchmark surface, not a claim about leaderboard submission.

- Generated: `2026-04-15T02:27:36.196Z`
- Release: `0.1.0+194a8fc`
- Repo commit: `194a8fc18d1f5e54a2f88108827bbe632cd791c6`
- Q serving label: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-f3886f2-5c329cc5`

## What Ran

- Harbor ran in WSL on Docker Desktop.
- Oracle validated both repo-local tasks before the Q lane was accepted.
- The published scores below come from RewardKit programmatic checks.

## Q structured contract

- Oracle score: `1.000`
- Oracle duration: `18.87 s`
- Q gateway score: `1.000`
- Q gateway duration: `37.20 s`
- Oracle job: `.runtime/harbor-custom/harbor-q-oracle-v7`
- Q gateway job: `.runtime/harbor-custom/harbor-q-agent-custom-v5`
- Q route: `guarded`
- Q reason: The mismatched ACK nonce and timeout suggest a need for cautious, verified state management.
- Q commit: Maintain fail-closed behavior until the acknowledgment path is fully validated.

## Immaculate bridge fail-closed

- Oracle score: `1.000`
- Oracle duration: `19.59 s`
- Q gateway score: `1.000`
- Q gateway duration: `30.35 s`
- Oracle job: `.runtime/harbor-custom/harbor-immaculate-oracle-v7`
- Q gateway job: `.runtime/harbor-custom/harbor-immaculate-agent-custom-v1`
- Q route: `guarded`
- Q reason: The stale ACK and untrusted bridge path necessitate a cautious, verified route.
- Q commit: Proceed via the known healthy direct HTTP/2 path for reliable state updates.

## Q Gateway Transport Fix

- Pre-fix gateway probe: `failed` at `300678` ms. Structured Q gateway request failed around the 300-second mark with fetch failed.
- Direct Ollama probe: `passed` at `412787.48` ms. Direct Ollama /api/chat call returned a valid ROUTE/REASON/COMMIT response.
- Post-fix gateway probe: `passed` at `8029.01` ms. The same structured prompt succeeded through the repaired Q gateway after moving off Node fetch to explicit http/https transport and raising the timeout budget.

## LLM Judge Attempts

- `openai/Q via Q gateway`: `failed` in `667.100` s. RewardKit judge reached the repaired Q gateway but returned malformed non-schema JSON, so the score was not accepted. Error: `JSONDecodeError while parsing judge response under LITELLM_DROP_PARAMS=1`

## Truth Boundary

- This is a repo-local Harbor task pack, not a Terminal-Bench leaderboard submission.
- RewardKit programmatic checks are the current scoring gate for the published Harbor results.
- LLM judge attempts were executed and recorded, but they are not counted into the benchmark score until the judge path becomes stable.
