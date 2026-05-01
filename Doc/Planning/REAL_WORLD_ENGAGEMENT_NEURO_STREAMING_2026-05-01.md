# Real-World Engagement Neuro Streaming - 2026-05-01

## Root Cause

`neuro-streaming` is a tier-3 governed tool action because it starts or controls live
neurophysiology ingestion streams. The HTTP and websocket live neuro write paths were still using
generic governance only, so a local UI could start, ingest, connect, or stop a live source without
proving an operator receipt target, action summary, explicit confirmation, and rollback plan.

## Fix

- Required real-world engagement evidence on live neuro write/control routes:
  `/api/devices/lsl/connect`, `/api/devices/lsl/:sourceId/stop`,
  `/api/neuro/live/frame`, `/api/neuro/live/:sourceId/stop`, and
  `/stream/neuro/live`.
- Kept live neuro list/discovery routes under generic governance or read-only behavior so dashboard
  discovery remains available without turning every observation into an operator confirmation.
- Added dashboard evidence for live socket ingest and stop actions through route-bound socket
  tickets and proxied HTTP headers.
- Added TUI evidence for live socket ingest and stop actions, including websocket query evidence for
  the browserless socket path.
- Added regression coverage that `neuro-streaming` requires confirmation and rollback evidence and
  that dashboard tickets preserve live neuro engagement claims.

## Operator Notes

- External callers that use `/api/neuro/live/frame` or LSL connect/stop must now include:
  `x-immaculate-receipt-target`, `x-immaculate-operator-summary`,
  `x-immaculate-operator-confirmed: true`, and `x-immaculate-rollback-plan`, plus the existing
  governance purpose, policy, and consent scope headers.
- Browser websocket callers cannot set custom headers, so dashboard uses signed socket tickets and
  the TUI uses query evidence on trusted loopback or explicitly allowed harness origins.
- This closes the live-ingress parity gap from
  `Doc/Planning/REAL_WORLD_ENGAGEMENT_SOCKET_PARITY_2026-05-01.md`.

## Validation

- `npm run test -w @immaculate/harness`
- `npm run typecheck -w @immaculate/harness`
- `npm run typecheck -w @immaculate/dashboard`
- `npm run typecheck -w @immaculate/tui`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
