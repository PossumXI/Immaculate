# Live Integration Validation

Generated from the April 21, 2026 cross-project validation pass. This page is the hand-written companion to `docs/wiki/Live-Mission-Readiness.md`, which is now the machine-stamped owner of the current cross-project gate.

## Immaculate

- Roundtable runtime source now keeps the dedicated roundtable Q lane honest. It no longer silently falls back to the shared local Q lane unless `IMMACULATE_ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK=true`.
- Roundtable discovery no longer lets `ASGARD_OPENJAWS_ROOT` redirect the OpenJaws repo lane. OpenJaws resolution now stays on `OPENJAWS_ROOT` or the repo default.
- The roundtable seed leg now gets one bounded retry. This preserves the real latency cost but recovers from the first cold-load failure instead of leaving the whole pass red.

## OpenJaws

- The roundtable runtime now treats `openjaws-updates` as a preferred fallback live-channel alias alongside `q-roundtable` and `q-roundtable-live`.
- The regression lives in `src/utils/discordRoundtableRuntime.test.ts` and proves the session/log overlay no longer preserves the wrong alias when the fallback lane is active.

## Live Checks

- Current machine-stamped gate: `docs/wiki/Live-Mission-Readiness.md` is now the truth surface for `ledger.public`, `ledger.private`, `q.local`, `q.oci`, and `discord.transport`.
- Current public-safe proof package: `docs/wiki/Supervised-Mission-Showcase.md` now carries the fail-closed showcase gate plus the publishable snippet subset for public surfaces and site handoff.
- Current `q.local` state is still green through `docs/wiki/Roundtable-Runtime.md`: `3` scenarios, `0` failed assertions, `seedAcceptedCount=3`, `mediationAcceptedCount=3`, and `decisionTraceStatus=verified`.
- Current `discord.transport` state is blocked, not green: the last receipt in `D:\openjaws\OpenJaws\local-command-station\discord-q-agent-receipt.json` is stale and `http://127.0.0.1:8788/health` is currently refusing connections from this machine.
- Current `q.oci` state is therefore also blocked in the shared gate: the last receipt still reports `oci:Q via OCI IAM`, but the live Discord Q runtime that carried that backend is not currently healthy enough to count as a fresh ready lane.
- Current `ledger.public` state is blocked: the local public-node contract is configured, but the public aura-genesis telemetry edge is synthesized/offline and is not surfacing a fresh governed record right now.
- Current `ledger.private` state is blocked: the latest supervised rerun still shows a private delta, but the verified local node logs also show `Mission treasury signer disabled`, so the private verified lane is not treated as ready.

Historical same-day direct probes from this workstation still matter, but they are now historical notes rather than the current gate:

- Earlier in the same April 21 pass, OpenJaws performed a real `oci:Q` probe through `probeExternalProviderModel('oci:Q')` and the live OCI `/responses` endpoint returned HTTP `200` using OCI IAM auth.
- Earlier in the same April 21 pass, `https://arobi.aura-genesis.org/api/v1/info` and `/api/v1/audit/verify` were reachable.
- Earlier in the same April 21 pass, `https://arobi.aura-genesis.org/api/v1/audit/record` returned HTTP `403` with `This API route is restricted to local admin access`, so this workstation still does not prove a live public write.

## Publish Ownership

- `iorch.net` can consume `docs/wiki/Supervised-Mission-Showcase.md` directly from this Immaculate dashboard workspace.
- `aura-genesis.org/status` source lives in `C:\Users\Knight\Desktop\cheeks\Asgard\Websites`, where the public showcase stays aggregate-only and the sealed `00` lane remains closed.
- `qline.site` canonical source is the external `q-s-unfolding-story` repo; the OpenJaws `website/` folder in this workspace remains a legacy mirror and was not used for a routine production publish in this pass.

## Runtime Result

- The dedicated isolated roundtable lane on `127.0.0.1:11435` remained blocked after the Ollama reinstall. Prewarm timed out and the benchmark did not silently switch to the shared lane.
- The explicit shared roundtable lane on `127.0.0.1:11434` completed cleanly after the bounded seed retry:
  - `3` scenarios
  - `0` failed assertions
  - `seedAcceptedCount=3`
  - `mediationAcceptedCount=3`
  - `executionReceiptsP50=3`
  - `decisionTraceStatus=verified`
- The same green run now also carries the widened mission gate, which leaves `q.oci` and `discord.transport` explicitly unconfigured on the benchmark surface itself and pushes the full cross-project gate into `docs/wiki/Live-Mission-Readiness.md`.

## Truth Boundary

- This pass did not claim live Discord-agent execution beyond transport/auth readiness.
- This pass did not claim a successful fresh public Arobi write.
- This pass did not claim a live OCI daemon; it only claimed a successful live OCI `oci:Q` endpoint probe.
- This page now distinguishes historical same-day direct probes from the current machine-stamped readiness gate.
- Asgard Websites is the live public-site source for `aura-genesis.org/status`; private mission lanes still remain closed on that public surface.
- OpenJaws main was not touched.
