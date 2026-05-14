# Immaculate Operator Handoff - 2026-05-14 - Governance Release Gate

## Purpose

This pass closes two accountability gaps:

- live `neuro-streaming` was classified as Tier 3 and approval-required, but
  live route admission did not require an approval reference
- the Q failure corpus existed, but release-surface readiness did not require it

## Changes

- Added `neuro-streaming` to the live approval-ref enforced action set in
  `apps/harness/src/governance.ts`.
- Updated `apps/harness/src/governance.test.ts` so live neuro streaming fails
  without an approval ref and passes with an operator approval ref.
- Added `Q-Failure-Corpus.json` as a required release surface in
  `apps/harness/src/release-surface.ts`.
- Added `listReleaseSurfaceDefinitions()` so tests can assert the required
  release surface contract without parsing source text.
- Regenerated `docs/wiki/Q-Failure-Corpus.*` and `docs/wiki/Release-Surface.*`.
- Refreshed cross-project workflow health and Arobi audit integrity receipts.

## Verification

```powershell
node --import tsx --test apps/harness/src/governance.test.ts apps/harness/src/release-surface.test.ts
npm run q:failure-corpus
npm run release:surface
npm run github:workflow:health
```

## Operator Notes

- This is a governance/readiness change, not a public deployment.
- `neuro-streaming` still requires the existing purpose and consent checks; the
  new behavior adds the missing approval-ref gate for live route admission.
- Release surface readiness now fails closed if the strict Q failure corpus is
  missing, stale, invalid, or unhealthy.
