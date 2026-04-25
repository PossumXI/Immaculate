# Live Operator Public Export

This page is the public-safe operator export for the current workstation. It mirrors the `fabric.showcase` contract already used by the aura-genesis status page, keeps the private mission lane closed, and only emits aggregate operator activity that is safe to publish on public surfaces.

- Generated: `2026-04-25T18:32:05.367Z`
- Release: `0.1.0+e9175c2`
- Repo commit: `e9175c28a33d3bab5dffbe0d60c38e8234e65d54`
- Contract target: `fabric.showcase` v1

## Publication Gate

- Status: `blocked`
- Target: aura-genesis.org/status
- Summary: public publication is blocked by operator.activity: public publication is blocked until the public ledger, Discord transport, and OCI-backed Q all prove readiness on the current workstation | source.freshness: 3/3 public-export source receipt(s) are stale, missing, or invalid: Live mission readiness stale (4d old, budget 24h); Live operator activity stale (4d old, budget 24h); Arobi live ledger receipt stale (4d old, budget 24h) | ledger.public: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- Source freshness: `blocked` (3/3 public-export source receipt(s) are stale, missing, or invalid: Live mission readiness stale (4d old, budget 24h); Live operator activity stale (4d old, budget 24h); Arobi live ledger receipt stale (4d old, budget 24h))
- Freshness budget: `24h`

## Source Freshness

- Live mission readiness: `stale` via `docs/wiki/Live-Mission-Readiness.json` at `2026-04-22T00:57:50.993Z` - stale (4d old, budget 24h)
- Live operator activity: `stale` via `docs/wiki/Live-Operator-Activity.json` at `2026-04-22T00:57:56.085Z` - stale (4d old, budget 24h)
- Arobi live ledger receipt: `stale` via `docs/wiki/Arobi-Live-Ledger-Receipt.json` at `2026-04-21T22:18:04.712Z` - stale (4d old, budget 24h)

## Public Showcase Status

- Active: `false`
- Mode: `controlled`
- Title: Supervised operator audit export.
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public ledger publication remains blocked: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- Window label: Showcase line closed until public ledger publication is proven
- Results ready: `false`
- Fleet label: Immaculate / OpenJaws / Q operator loop
- Publish targets: aura-genesis.org/status (public-safe aggregate only) | iorch.net (results only) | qline.site (results only; not published from this repo)
- Subsystems: total `5` | online `3` | degraded `2` | offline `0` | unconfigured `0`
- Network version: `3.3.1`
- Verified ledger entries: `394`
- Public height: `34832`
- Orchestration profile: `immaculate-supervised-operator-loop`
- Q auth mode: `oci_iam`
- Last checked: `2026-04-25T18:32:05.367Z`

## Activity Feed

### Supervised operator activity export updated

- Status: `warning`
- Kind: `showcase`
- Timestamp: `2026-04-25T18:32:05.367Z`
- Source: `fabric.showcase`
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public ledger publication remains blocked: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- Subsystems: immaculate, openjaws, q
- Artifacts: showcase:summary, receipt:live-operator-public-export
- Tags: showcase, public, operator

### Public publication gate

- Status: `warning`
- Kind: `publication`
- Timestamp: `2026-04-25T18:32:05.367Z`
- Source: `immaculate.live_operator_activity`
- Summary: public publication is blocked by operator.activity: public publication is blocked until the public ledger, Discord transport, and OCI-backed Q all prove readiness on the current workstation | source.freshness: 3/3 public-export source receipt(s) are stale, missing, or invalid: Live mission readiness stale (4d old, budget 24h); Live operator activity stale (4d old, budget 24h); Arobi live ledger receipt stale (4d old, budget 24h) | ledger.public: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- Subsystems: arobi, immaculate
- Artifacts: gate:publication
- Tags: public, gate

### Q patrol lane

- Status: `ok`
- Kind: `agent`
- Timestamp: `2026-04-22T00:57:56.085Z`
- Source: `immaculate.live_operator_activity`
- Summary: state changed but routing cooldown held
- Subsystems: q, discord
- Artifacts: receipt:q-patrol, layer:Q
- Tags: q, patrol, operator

### Bounded roundtable lane

- Status: `ok`
- Kind: `roundtable`
- Timestamp: `2026-04-22T00:57:56.085Z`
- Source: `immaculate.live_operator_activity`
- Summary: running | Q passed turn 10 | 10 turns | 2/21 recent actions passed verification
- Subsystems: discord, openjaws, immaculate
- Artifacts: receipt:roundtable, receipt:roundtable-actions-21
- Tags: roundtable, accountable, operator

### Discord bot receipts

- Status: `warning`
- Kind: `discord`
- Timestamp: `2026-04-22T00:48:39.358Z`
- Source: `immaculate.live_operator_activity`
- Summary: 2/3 bot receipts are ready (Blackbeak, Viola).
- Subsystems: discord, openjaws, q
- Artifacts: receipt:discord-bots
- Tags: discord, receipts, bots

### Operator state

- Status: `ok`
- Kind: `operator`
- Timestamp: `2026-04-22T00:57:56.085Z`
- Source: `immaculate.live_operator_activity`
- Summary: PossumX | active process present
- Subsystems: openjaws, immaculate
- Artifacts: receipt:operator-state
- Tags: operator, human-in-the-loop

### Discord transport readiness

- Status: `ok`
- Kind: `transport`
- Timestamp: `2026-04-25T18:32:05.367Z`
- Source: `immaculate.live_mission_readiness`
- Summary: status=ready; gateway=true; guilds=1; health 200; updated 15s ago (budget 900s)
- Subsystems: discord, q
- Artifacts: readiness:discord-transport
- Tags: discord, transport

### Public ledger visibility

- Status: `warning`
- Kind: `ledger`
- Timestamp: `2026-04-21T22:18:04.712Z`
- Source: `immaculate.arobi_live_ledger`
- Summary: public ledger version 3.3.1 on block 34,832 with 394 visible aggregate entries; fabric source synthesized
- Subsystems: arobi, ledger
- Artifacts: receipt:arobi-live-ledger
- Tags: ledger, public, audit

## Truth Boundary

- This export is public-safe aggregate operator activity only; it does not prove that a live Discord operator command or a live mission was executed on this pass.
- This export is shaped to mirror the existing aura-genesis fabric.showcase contract; it does not mutate the public website or the public ledger by itself.
- The private mission lane remains closed here even when local Discord transport, OCI-backed Q, and roundtable receipts are ready.
- Private paths, worktree roots, secrets, Discord tokens, private ledger payloads, and raw chain-of-thought are intentionally excluded from this export.
- ledger.public remains blocked until a fresh governed public Arobi write is proven on this machine.
- The public publication gate also fails closed when any source receipt used to produce this aggregate export is stale, missing, or invalid.
