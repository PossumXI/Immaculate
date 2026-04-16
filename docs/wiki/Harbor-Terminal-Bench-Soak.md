# Harbor Terminal Bench Soak

This page records the repeated Q-only Harbor task-pack lane. Oracle and Q run side by side on the same terminal tasks so the repo can keep the control truth and the Q truth in one surface.

- Generated: `2026-04-16T13:05:24.510Z`
- State: `completed`
- Started: `2026-04-15T03:36:39.719958`
- Finished: `2026-04-15T04:07:11.653011`
- Duration target: `3600s`
- Elapsed seconds: `1831.93`
- Duration target met: `no`
- Release: `0.1.0+555b65c`
- Repo commit: `555b65c`
- Q serving label: `Q`
- Runtime root: `.runtime/harbor-soak/2026-04-15T07-36-33-729Z`
- Total runs: `90`

## Aggregate

- Oracle runs: `45` | avg score `1.000` | avg duration `8.99 s`
- Q runs: `45` | avg score `1.000` | avg duration `17.49 s`
- Overall runs: `90` | avg score `1.000` | avg duration `13.24 s`

## Q structured contract

- Oracle: `23` runs | avg score `1.000` | avg duration `9.09 s`
- Q: `23` runs | avg score `1.000` | avg duration `17.19 s`

## Immaculate bridge fail-closed

- Oracle: `22` runs | avg score `1.000` | avg duration `8.88 s`
- Q: `22` runs | avg score `1.000` | avg duration `17.81 s`

## Truth Boundary

- Oracle and Q are measured on the same Harbor task pack, but this remains a repo-local task lane rather than a W&B publication lane.
- A `running` state means the soak was interrupted or is still in flight; a `completed` state means the runtime root was fully collected, not that the duration target was necessarily met.
