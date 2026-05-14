# Release Readiness Handoff - 2026-05-14

This handoff records the Immaculate/Q release-readiness repair made during the
May 14 operator pass.

## Root Cause

The cross-repo fleet scanner surfaced an Immaculate CI failure in the Q release
gate. The failed CI run reported that `Model-Benchmark-Comparison` was stale.

Refreshing the model-comparison receipt exposed the deeper local failure mode:
the first Q structured-contract task completed, then the local Ollama endpoint
was briefly unavailable and the remaining tasks recorded `ECONNREFUSED` as
permanent model failures. That produced a fresh but invalid 1/4 parse-success
receipt, which correctly failed `npm run q:release-gate`.

## Change

- `apps/harness/src/model-comparison.ts`
  - Added `isRetryableModelComparisonRuntimeFailure`.
  - Treats local Ollama restart/loading/connection-refused/timeout transport
    failures as bounded runtime recovery cases.
  - Re-warms the model and retries each affected comparison task up to two times.
  - Keeps `contract_invalid` and other semantic failures non-retryable.
- `apps/harness/src/model-comparison.test.ts`
  - Added a regression test for retryable local runtime failures and the
    non-retryable contract-invalid boundary.

## Receipts Refreshed

- `docs/wiki/Model-Benchmark-Comparison.json`
- `docs/wiki/Model-Benchmark-Comparison.md`
- `docs/wiki/Q-Readiness-Gate.json`
- `docs/wiki/Q-Readiness-Gate.md`
- `docs/wiki/Release-Surface.json`
- `docs/wiki/Release-Surface.md`

Fresh Q comparison result:

- Generated: `2026-05-14T13:16:52.681Z`
- Model: `Q`
- Completed tasks: `4/4`
- Parse success rate: `1.0`
- P95 latency: `45005.82ms`

Fresh Q release gate:

- Generated: `2026-05-14T13:21:02.216Z`
- Ready: `true`
- Threshold: `0.75`
- Model comparison parse success: `1.0`
- BridgeBench parse success: `1.0`
- Gateway contract: ready

Central release surface:

- Generated: `2026-05-14T13:21:02.216Z`
- Release evidence status: `ready`
- Required evidence: `20/20` fresh

## Verification

Commands run from `C:\Users\Knight\Desktop\Immaculate`:

```powershell
node --import tsx --test apps/harness/src/model-comparison.test.ts
npm run test -w @immaculate/harness
npm run build -w @immaculate/harness
npm run q:release-gate
npm run release:surface
git diff --check
npm run typecheck
npm run test
npm run build
```

Results:

- Focused model-comparison test: 2/2 passed.
- Harness test suite: 179/179 passed.
- Harness build: passed.
- Q release gate: ready.
- Release surface: ready, 20 required evidence receipts fresh.
- Root typecheck: passed.
- Root test suite: passed.
- Root build: passed.

## Operator Notes

- Do not commit a model-comparison receipt that is merely fresh if it records
  runtime transport failures as model quality failures.
- If the local Q/Ollama lane is interrupted during a comparison run, rerun the
  comparison after confirming a single default Ollama server is active and no
  duplicate model-comparison process is running.
- The retry guard is intentionally narrow. It covers runtime availability
  failures, not malformed or unsafe model outputs.
- The central release surface intentionally binds its release source to the
  latest non-generated source commit, while Q readiness records the current
  runtime receipt commit.
