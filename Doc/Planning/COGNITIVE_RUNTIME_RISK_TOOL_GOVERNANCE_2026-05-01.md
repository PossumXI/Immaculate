# Cognitive Runtime Risk Tool Governance - 2026-05-01

## Root Cause

Immaculate had policy bindings, consent scopes, route-level rate limits, Q API key limits, PoI assessments, and audit receipts, but no shared runtime registry that classified governed actions by operational risk. That meant Q could be told to use approved retrieval/tool lanes while the harness had no compact, machine-readable answer for which action classes were read-only, internal writes, external communication, infrastructure-touching, or regulated/irreversible.

## Change

- Added `apps/harness/src/tool-governance.ts` as the first pure risk-tiered action registry for every `GovernanceAction`.
- Classified each action into Tier 0 through Tier 5:
  - Tier 0: read-only observation
  - Tier 1: draft or suggestion
  - Tier 2: internal write
  - Tier 3: external communication
  - Tier 4: money, credentials, or infrastructure
  - Tier 5: irreversible or regulated action
- Added consent, approval, human-approval, confidence-floor, failure-hold, and pacing metadata for each action class.
- Enriched governance policies and decisions with risk metadata so audit records can show not just whether an action was allowed, but how dangerous that action class was.
- Added read-only `/api/governance/tool-actions` and preflight `/api/governance/tool-actions/admission` endpoints.
- Updated Q runtime context to include a compact governed tool policy summary so Q does not improvise unregistered action paths.

## Validation

Run from the repo root:

```powershell
npm run typecheck -w @immaculate/harness
node --import tsx --test apps/harness/src/tool-governance.test.ts apps/harness/src/governance.test.ts apps/harness/src/q-model.test.ts
npm run test -w @immaculate/harness
npm run build -w @immaculate/harness
```

## Next Operator Notes

This is intentionally the registry and audit layer, not a breaking route-level approval gate. The next pass should wire specific high-risk execution routes into admission enforcement once Discord/OpenJaws callers are updated to send approval references and human approval receipts. Do not flip Tier 3+ enforcement globally without updating callers first.
