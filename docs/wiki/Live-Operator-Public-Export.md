# Live Operator Public Export

This page is the public-safe operator export for the current workstation. It mirrors the `fabric.showcase` contract already used by the aura-genesis status page, keeps the private mission lane closed, and only emits aggregate operator activity that is safe to publish on public surfaces.
When the repo-local OpenJaws public showcase mirror is present, this export consumes that shared sanitized activity feed instead of regenerating overlapping Discord/Q/roundtable entries locally.

- Generated: `2026-04-22T14:39:38.286Z`
- Release: `0.1.0+8d26389`
- Repo commit: `8d26389523f3b4bcebde1b54e1841f462e1ba184`
- Contract target: `fabric.showcase` v1

## Publication Gate

- Status: `publishable`
- Target: aura-genesis.org/status
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35656); public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35796)

## Public Showcase Status

- Active: `true`
- Mode: `controlled`
- Title: Controlled live showcase active.
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35656); public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35796)
- Window label: Controlled public verification window
- Results ready: `true`
- Fleet label: ASGARD Core 16
- Publish targets: https://aura-genesis.org/status | https://iorch.net | https://qline.site
- Subsystems: total `16` | online `4` | degraded `0` | offline `0` | unconfigured `0`
- Network version: `v3.3.1`
- Verified ledger entries: `395`
- Public height: `35796`
- Orchestration profile: `immaculate-supervised-operator-loop`
- Q auth mode: `iam`
- Last checked: `2026-04-22T14:28:16.330Z`

## Activity Feed

### Supervised operator activity export updated

- Status: `ok`
- Kind: `showcase`
- Timestamp: `2026-04-22T14:39:38.286Z`
- Source: `fabric.showcase`
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35656); public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35796)
- Subsystems: immaculate, openjaws, q
- Artifacts: showcase:summary, receipt:live-operator-public-export
- Tags: showcase, public, operator

### Public publication gate

- Status: `ok`
- Kind: `publication`
- Timestamp: `2026-04-22T14:39:38.286Z`
- Source: `immaculate.live_operator_activity`
- Summary: Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready; public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35656); public-safe aggregate publication verified on the Arobi public lane (2 audit records accepted at height 35796)
- Subsystems: arobi, immaculate
- Artifacts: gate:publication
- Tags: public, gate

### Supervised runtime activity refreshed

- Status: `warning`
- Kind: `runtime_audit`
- Timestamp: `2026-04-22T14:39:18.338Z`
- Source: `OpenJaws public showcase sync`
- Summary: Supervised OpenJaws audit surfaces are live but still show bounded warnings or incomplete runtime coverage.
- Subsystems: openjaws, apex, nysus, q, roundtable, immaculate, discord
- Artifacts: showcase:activity
- Tags: public, audit, bounded

### Roundtable runtime

- Status: `ok`
- Kind: `roundtable_runtime`
- Timestamp: `2026-04-22T14:38:41.319Z`
- Source: `OpenJaws roundtable lane`
- Summary: Roundtable is completed in #dev_support. roundtable completed
- Subsystems: openjaws, immaculate, discord
- Artifacts: roundtable:session
- Tags: roundtable, bounded, supervised

### Supervised Q patrol update

- Status: `ok`
- Kind: `patrol`
- Timestamp: `2026-04-22T14:35:49.371Z`
- Source: `OpenJaws Discord lane`
- Summary: state changed but routing cooldown held
- Subsystems: openjaws, discord, q
- Artifacts: discord:q-agent-receipt
- Tags: q, discord, openjaws, bounded

### Supervised Blackbeak patrol update

- Status: `ok`
- Kind: `patrol`
- Timestamp: `2026-04-22T14:33:16.151Z`
- Source: `OpenJaws Discord lane`
- Summary: Blackbeak Discord runtime is online through the supervised bounded operator lane.
- Subsystems: openjaws, discord, blackbeak
- Artifacts: discord:blackbeak-agent-receipt
- Tags: blackbeak, discord, openjaws, bounded

### Supervised Viola patrol update

- Status: `ok`
- Kind: `patrol`
- Timestamp: `2026-04-22T14:31:14.689Z`
- Source: `OpenJaws Discord lane`
- Summary: Viola Discord runtime is online through the supervised bounded operator lane.
- Subsystems: openjaws, discord, viola
- Artifacts: discord:viola-agent-receipt
- Tags: viola, discord, openjaws, bounded

### Public ledger visibility

- Status: `warning`
- Kind: `ledger`
- Timestamp: `2026-04-21T22:18:04.712Z`
- Source: `immaculate.arobi_live_ledger`
- Summary: public ledger version 3.3.1 on block 34,832 with 394 visible aggregate entries; fabric source synthesized
- Subsystems: arobi, ledger
- Artifacts: receipt:arobi-live-ledger
- Tags: ledger, public, audit

### Discord transport readiness

- Status: `ok`
- Kind: `transport`
- Timestamp: `2026-04-22T14:39:38.286Z`
- Source: `immaculate.live_mission_readiness`
- Summary: status=ready; gateway=true; guilds=1; health 200; updated 15s ago (budget 900s)
- Subsystems: discord, q
- Artifacts: readiness:discord-transport
- Tags: discord, transport

### Operator state

- Status: `ok`
- Kind: `operator`
- Timestamp: `2026-04-22T00:57:56.085Z`
- Source: `immaculate.live_operator_activity`
- Summary: PossumX | active process present
- Subsystems: openjaws, immaculate
- Artifacts: receipt:operator-state
- Tags: operator, human-in-the-loop

## Truth Boundary

- This export is public-safe aggregate operator activity only; it does not prove that a live Discord operator command or a live mission was executed on this pass.
- This export is shaped to mirror the existing aura-genesis fabric.showcase contract; it does not mutate the public website or the public ledger by itself.
- The private mission lane remains closed here even when local Discord transport, OCI-backed Q, and roundtable receipts are ready.
- Private paths, worktree roots, secrets, Discord tokens, private ledger payloads, and raw chain-of-thought are intentionally excluded from this export.
- Fresh public-safe Arobi public audit writes were accepted during the current controlled publish pass; this still does not open the private mission lane or prove live Discord mission execution.
