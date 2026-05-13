# Release Readiness Handoff - 2026-05-13

This handoff records the current high-value release-readiness pass for Immaculate, Q, Arobi Network, OpenJaws, and the Discord operator lane.

## What Changed

- `apps/harness/src/bridgebench-soak.ts`
  - Fixed soak duration parsing when npm workspace forwarding passes a bare numeric argument such as `120`.
  - Added `--max-attempts`, `--prewarm-timeout-ms`, `--execution-timeout-ms`, and `--retry-timeout-ms` parsing so future soak refreshes can be bounded.
  - Guarded CLI execution so tests can import parser logic without launching a soak.
- `apps/harness/src/bridgebench.ts`
  - Added run options for prewarm, execution, and retry timeouts and passed them into the local Q/Ollama execution lane.
- `apps/harness/src/release-surface.ts`
  - Made health inference label-aware:
    - `Live mission readiness` still fails closed when `missionSurfaceReady=false`.
    - `Roundtable runtime` is judged by runtime assertions/local-Q readiness instead of double-counting the private-ledger mission blocker.
    - `Live operator activity` is judged by its publication contract instead of double-counting the private-ledger mission blocker.
- Added focused tests:
  - `apps/harness/src/bridgebench-soak.test.ts`
  - New release-surface health inference cases in `apps/harness/src/release-surface.test.ts`

## Verification Run

Commands run from `C:\Users\Knight\Desktop\Immaculate`:

```powershell
node --import tsx --test apps/harness/src/release-surface.test.ts apps/harness/src/bridgebench-soak.test.ts
npm run typecheck -w @immaculate/harness
npm run bridgebench:soak -w @immaculate/harness -- 120 --max-attempts=1 --prewarm-timeout-ms=30000 --execution-timeout-ms=90000 --retry-timeout-ms=1000
npm run live:mission:readiness
npm run live:operator:activity
npm run release:surface
```

Results:

- Focused tests: 15/15 passed.
- Harness typecheck: passed.
- BridgeBench soak: 1/1 run succeeded, 4/4 parse success, 0 bridge runtime failed assertions, generated `2026-05-13T22:36:02.143Z`.
- Release surface: blocked by 1 remaining release evidence gap.

## Current Release Blocker

Resolved in the follow-up governance-readiness pass.

`Live mission readiness` had been blocked because the verified private Arobi node logs a disabled legacy `public-chain-verified/mission_treasury_wallet.json` signer warning.

Observed from `C:\Users\Knight\.arobi\public-chain-verified\logs\verified-node.log`:

- The verified private node loaded the audit ledger and started its API.
- The mission treasury signer was disabled because the wallet address does not match the verified chain genesis treasury address.

Root cause:

- This was an obsolete readiness assumption. The March 29 treasury recovery intentionally moved mission treasury control from a hot wallet file to governance-controlled release mode.
- The verified node now reports `control_mode=governance_release` from `http://127.0.0.1:8101/api/v1/autonomo/mission/treasury`.
- A disabled legacy hot-wallet warning is only non-blocking when that treasury endpoint proves governance release mode and a funded treasury address.

Additional isolated temp probe:

- The root `C:\Users\Knight\.arobi\mission_treasury_wallet.json` has the expected public address, but the Arobi binary rejects it as internally inconsistent.
- Do not copy that root wallet into `public-chain-verified`; it does not repair the signer.

Implemented remediation:

1. `apps/harness/src/live-mission-readiness.ts` now probes the verified node treasury endpoint.
2. The private Arobi lane stays blocked if a signer warning appears without governance-control proof.
3. The private Arobi lane is ready when the verified ledger/API contract is intact, the private ledger advanced, and `governance_release` treasury control is proven.
4. `apps/harness/src/live-mission-readiness.test.ts` covers both the accepted governance path and the fail-closed no-governance path.

Safe operator path if this regresses:

1. Do not restore or regenerate a mission treasury hot wallet as the first fix.
2. Keep signer material out of public/exported/documentation paths.
3. Confirm `GET http://127.0.0.1:8101/api/v1/autonomo/mission/treasury` reports `control_mode=governance_release`.
4. Restart the verified private node with `C:\Users\Knight\.arobi\start-private-verified-node.ps1` only if the endpoint is unreachable.
5. Rerun:

```powershell
npm run live:mission:readiness
npm run live:operator:activity
npm run release:surface
```

Current release-surface result after the governance-control fix: `releaseEvidence.status=ready`.

## Do Not Repeat

- Do not rerun a default one-hour BridgeBench soak just to refresh stale evidence; use a bounded explicit duration or run the full 60-minute lane only when an hour-class benchmark is intentionally required.
- Do not deploy qline.site, iorch.net, or aura-genesis.org from this pass. No public surface source files were edited here.
- Do not copy invalid or quarantined wallet files across Arobi node directories. The readiness gate is correctly fail-closed until the signer is valid.
