# Real-World Engagement Socket Parity - 2026-05-01

## Root Cause

HTTP operator-control routes required real-world engagement evidence, but dashboard websocket
control messages on `/stream` only passed the generic governance gate. Because browsers cannot set
custom headers on websocket handshakes, the dashboard socket ticket carried only generic governance
metadata and could not prove receipt target, operator confirmation, rollback plan, or bounded
budget to the harness.

## Fix

- Extended dashboard websocket ticket claims to carry signed real-world engagement evidence:
  `receiptTarget`, `operatorSummary`, `operatorConfirmed`, `rollbackPlan`, `sanitizationProof`,
  and `budgetCents`.
- Forwarded those same real-world engagement headers through the dashboard HTTP proxy so
  `governedHarnessFetch` calls preserve evidence before reaching harness routes such as
  `/api/control`, actuation dispatch, and benchmark publication.
- Updated the harness ticket verifier to normalize those optional claims and reject route reuse.
- Updated `getRealWorldEngagementEvidence` so websocket requests can source evidence from the
  verified dashboard socket ticket while retaining header/query support for HTTP and local tools.
- Updated `/stream` operator-control message handling to require the same real-world engagement
  policy as `/api/control`.
- Updated dashboard `/stream` connection metadata to include the required operator-control
  evidence.

## Validation

- `npm run test -w @immaculate/harness`
- `npm run test -w @immaculate/dashboard`
- `npm run typecheck -w @immaculate/harness`
- `npm run typecheck -w @immaculate/dashboard`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Operator Notes

- This change is intentionally scoped to operator-control parity. Neuro live socket ingestion still
  uses generic governance unless a later pass decides it should require real-world engagement.
- The socket ticket remains short-lived and route-bound. Do not move engagement evidence into
  unsigned websocket query parameters unless the route is explicitly local-only.
