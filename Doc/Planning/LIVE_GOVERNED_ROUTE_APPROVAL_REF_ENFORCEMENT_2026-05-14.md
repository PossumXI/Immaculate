# Live Governed Route Approval-Ref Enforcement

Date: 2026-05-14

## Root Cause

The governed tool registry already classified high-risk actions and the goal
planner already required approval references for Tier 3+ tool admission. The
live route prehandler still stopped at policy purpose and consent checks, then
relied on separate real-world engagement evidence for reachable routes.

That left a gap for Discord/OpenJaws button workflows: an operator could provide
consent and real-world engagement evidence, but the live route did not require
the approval reference that ties a serious action back to a human/operator
confirmation receipt.

## Change

The live route admission path now applies the tool-risk approval check to the
highest-risk reachable routes first:

- `operator-control`
- `actuation-dispatch`
- `actuation-device-link`
- `benchmark-publication`

The prehandler accepts approval references through
`x-immaculate-approval-ref`, `approvalRef`, `approval_ref`, or
`x-immaculate-approval-ref` query parameters. Tier 4/5 routes require
`human:*` or `operator:*`; Tier 3 benchmark publication requires an approval
reference. Existing purpose, consent-scope, and real-world engagement evidence
checks still run.

## Non-Goals

- This does not globally gate every Tier 3 route yet.
- This does not auto-approve LinkedIn, email, DM, calendar, payment, deployment,
  or actuation actions.
- This does not create Discord buttons by itself; it makes the backend route
  reject serious actions unless the button or operator surface passes the
  approval reference.

## Verification

Run from the repo root:

```powershell
node --import tsx --test apps/harness/src/tool-governance.test.ts apps/harness/src/governance.test.ts apps/harness/src/q-model.test.ts apps/harness/src/goal-state.test.ts apps/harness/src/real-world-engagement.test.ts apps/harness/src/dashboard-socket-ticket.test.ts
npm run typecheck -w @immaculate/harness
```
