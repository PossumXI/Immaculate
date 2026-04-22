# Live Operator Public Export

This page is the public-safe operator export for the current workstation. It mirrors the `fabric.showcase` contract already used by the aura-genesis status page, keeps the private mission lane closed, and only emits aggregate operator activity that is safe to publish on public surfaces.

- Generated: `2026-04-22T01:20:44.169Z`
- Release: `0.1.0+ba51737`
- Repo commit: `ba51737efc2a5b6a7b5234ff2f6fb86fb6b28a04`
- Contract target: `fabric.showcase` v1

## Publication Gate

- Status: `blocked`
- Target: aura-genesis.org/status
- Summary: public publication is blocked by ledger.public: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true

## Public Showcase Status

- Active: `false`
- Mode: `controlled`
- Title: Supervised operator audit export.
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public ledger publication remains blocked: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- Window label: Showcase line closed until public ledger publication is proven
- Results ready: `true`
- Fleet label: Immaculate / OpenJaws / Q operator loop
- Publish targets: aura-genesis.org/status (public-safe aggregate only) | iorch.net (results only) | qline.site (results only; not published from this repo)
- Subsystems: total `5` | online `3` | degraded `2` | offline `0` | unconfigured `0`
- Network version: `3.3.1`
- Verified ledger entries: `394`
- Public height: `34832`
- Orchestration profile: `immaculate-supervised-operator-loop`
- Q auth mode: `oci_iam`
- Last checked: `2026-04-22T01:20:44.169Z`

## Activity Feed

### Supervised operator activity export updated

- Status: `warning`
- Kind: `showcase`
- Timestamp: `2026-04-22T01:20:44.169Z`
- Source: `fabric.showcase`
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public ledger publication remains blocked: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- Subsystems: immaculate, openjaws, q
- Artifacts: showcase:summary, receipt:live-operator-public-export
- Tags: showcase, public, operator

### Public publication gate

- Status: `warning`
- Kind: `publication`
- Timestamp: `2026-04-22T01:20:44.169Z`
- Source: `immaculate.live_operator_activity`
- Summary: public publication is blocked by ledger.public: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
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
- Timestamp: `2026-04-22T01:20:44.169Z`
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
