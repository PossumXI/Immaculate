# Live Integration Validation

Generated from the April 21, 2026 cross-project validation pass. This page records what was actually exercised from this machine and what remained blocked, so the runtime and public surfaces do not over-claim.

## Immaculate

- Roundtable runtime source now keeps the dedicated roundtable Q lane honest. It no longer silently falls back to the shared local Q lane unless `IMMACULATE_ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK=true`.
- Roundtable discovery no longer lets `ASGARD_OPENJAWS_ROOT` redirect the OpenJaws repo lane. OpenJaws resolution now stays on `OPENJAWS_ROOT` or the repo default.
- The roundtable seed leg now gets one bounded retry. This preserves the real latency cost but recovers from the first cold-load failure instead of leaving the whole pass red.

## OpenJaws

- The roundtable runtime now treats `openjaws-updates` as a preferred fallback live-channel alias alongside `q-roundtable` and `q-roundtable-live`.
- The regression lives in `src/utils/discordRoundtableRuntime.test.ts` and proves the session/log overlay no longer preserves the wrong alias when the fallback lane is active.

## Live Checks

- Discord transport: a live Q Discord agent was already listening on port `8788` during this pass. The shared receipt at `local-command-station/discord-q-agent-receipt.json` reported `status=ready`, `gatewayConnected=true`, and `guildCount=1`. No operator command was sent from this pass, so this proves live transport/auth, not live Discord work execution.
- OCI Q: OpenJaws performed a real `oci:Q` probe through `probeExternalProviderModel('oci:Q')` under the local Discord/OCI env. The live OCI `/responses` endpoint returned HTTP `200` using OCI IAM auth.
- Arobi public read path: `https://arobi.aura-genesis.org/api/v1/info` and `/api/v1/audit/verify` were reachable and reported a live `3.3.1` node with a valid chain.
- Arobi public write path: `https://arobi.aura-genesis.org/api/v1/audit/record` returned HTTP `403` with `This API route is restricted to local admin access` from this machine. This pass does not claim a live public write.

## Runtime Result

- The dedicated isolated roundtable lane on `127.0.0.1:11435` remained blocked after the Ollama reinstall. Prewarm timed out and the benchmark did not silently switch to the shared lane.
- The explicit shared roundtable lane on `127.0.0.1:11434` completed cleanly after the bounded seed retry:
  - `3` scenarios
  - `0` failed assertions
  - `seedAcceptedCount=3`
  - `mediationAcceptedCount=3`
  - `executionReceiptsP50=3`
  - `decisionTraceStatus=verified`
- The same green run still reported `ledger.public` blocked because the public writer returned `403` and did not advance the ledger.

## Truth Boundary

- This pass did not claim live Discord-agent execution beyond transport/auth readiness.
- This pass did not claim a successful fresh public Arobi write.
- This pass did not claim a live OCI daemon; it only claimed a successful live OCI `oci:Q` endpoint probe.
- Asgard remained read-only audit context.
- OpenJaws main was not touched.
