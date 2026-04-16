# Harbor Terminal Bench

This page records the repo-local Harbor task pack for Immaculate and Q. It is a real executed benchmark surface, not a claim about leaderboard submission.

- Generated: `2026-04-15T23:28:51.784Z`
- Release: `0.1.0+a252873`
- Repo commit: `a252873d15b3265e2ee38c22c5907612487722fa`
- Q serving label: `Q`
- Q training bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-86bf2b5-6207dd5e`

## What Ran

- Harbor ran in WSL on Docker Desktop.
- Oracle validated both repo-local tasks before the Q lane was accepted.
- The published scores below come from RewardKit programmatic checks.

## Q structured contract

- Oracle score: `1.000`
- Oracle duration: `15.59 s`
- Q gateway score: `1.000`
- Q gateway duration: `28.62 s`
- Oracle job: `.runtime/harbor-custom/harbor-q-oracle-v7`
- Q gateway job: `.runtime/harbor-custom/harbor-q-agent-custom-v5`
- Q route: `guarded`
- Q reason: The mismatched ACK nonce and timeout suggest a need for cautious, verified state management.
- Q commit: Maintain fail-closed behavior until the acknowledgment path is fully validated.

## Immaculate bridge fail-closed

- Oracle score: `1.000`
- Oracle duration: `19.28 s`
- Q gateway score: `1.000`
- Q gateway duration: `24.90 s`
- Oracle job: `.runtime/harbor-custom/harbor-immaculate-oracle-v7`
- Q gateway job: `.runtime/harbor-custom/harbor-immaculate-agent-custom-v1`
- Q route: `guarded`
- Q reason: The stale ACK and untrusted bridge path necessitate a cautious, verified route.
- Q commit: Proceed via the known healthy direct HTTP/2 path for reliable state updates.

## Truth Boundary

- This is a repo-local Harbor task pack, not a Terminal-Bench leaderboard submission.
- RewardKit programmatic checks are the current scoring gate for the published Harbor results.
- LLM judge attempts were executed and recorded, but they are not counted into the benchmark score until the judge path becomes stable.
