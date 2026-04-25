# Q Operator Readiness

Public-safe operator readiness summary for Immaculate, Q, OpenJaws, and the Arobi public safety lane.

- Generated: 2026-04-25T14:33:46.2876303Z
- Current UTC date: 2026-04-25
- Q knowledge horizon: 2024-06
- Public safety ready: True
- Private runtime ready: True
- Voice ready: False
- Benchmark publication ready: False
- Critical findings: 0
- Warning findings: 3

## Public Safety

- Arobi public info HTTP: 200
- Arobi private audit public HTTP: 403
- Public projection guard: passed

## Benchmarks

- Immaculate latest receipt present: True
- BridgeBench receipt present: True
- TerminalBench leaderboard: waiting-for-full-sweep
- Q benchmark corpus records: 58
- W&B credential present locally: False

## OpenJaws Runtime

- Status: warning
- Summary: Runtime coherence warning: 14 ok, 1 warning, 0 failed.

Warnings:
- probe-Viola: Viola unreachable at [local-loopback] - Unable to connect. Is the computer able to access the url?

## Findings

- [warning] wandb-credential-missing: W&B export cannot publish because WANDB_API_KEY or IMMACULATE_WANDB_API_KEY is missing. Next: Set WANDB_API_KEY or IMMACULATE_WANDB_API_KEY, then run npm run benchmark:export:wandb.
- [warning] terminalbench-full-sweep-pending: TerminalBench leaderboard status is waiting-for-full-sweep. Next: Run the full official TerminalBench sweep before claiming leaderboard results.
- [warning] openjaws-probe-Viola: Viola unreachable at [local-loopback] Unable to connect. Is the computer able to access the url? Next: Rotate or update Viola's DISCORD_BOT_TOKEN, then restart the Viola agent.

## Boundary

Public-safe summary only. Raw runtime receipts, local paths, private ledgers, tokens, and private routing details are not included.

Source JSON: `docs/wiki/Q-Operator-Readiness.json`
