# Live Operator Activity

This page is the machine-stamped local activity feed for the supervised Discord/Q/OpenJaws loop. It summarizes the canonical OpenJaws receipts so Immaculate can expose one operator-facing activity surface without inventing a duplicate schema.

- Generated: `2026-05-13T17:05:45.299Z`
- Release: `0.1.0+5859730`
- Repo commit: `585973070c9a2cd34de1d38f9675b430bc7421a4`

## Publication Gate

- Status: `blocked`
- Public ledger ready: `false`
- Summary: public publication is blocked until the public ledger, Discord transport, and OCI-backed Q all prove readiness on the current workstation

## Shared Readiness Context

- Mission-surface ready: `false`
- Summary: shared readiness blocked: https://arobi.aura-genesis.org: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true | openjaws/artifacts/fabric-audit-soak-20260420T022653Z: verified private node is blocked by mission treasury signer mismatch despite rerun delta 1
- ledger.public: `blocked` @ `https://arobi.aura-genesis.org` | public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- discord.transport: `ready` @ `http://127.0.0.1:8788/health` | status=ready; gateway=true; guilds=1; health 200; updated 12s ago (budget 900s)
- q.oci: `ready` @ `https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1` | Discord Q receipt reports Q backend: oci:Q via OCI IAM (https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1); gateway=true; guilds=1; health 200; updated 12s ago (budget 900s)

## Q Patrol

- Status: `ready`
- Summary: posted patrol digest after state change -> #q-command-station
- Last decision: `posted patrol digest after state change -> #q-command-station`
- Last posted channel: `q-command-station`
- Last summary: state changed but routing cooldown held
- Queue length: `174`
- Recommended layer: `none`
- Source: `openjaws/local-command-station/discord-q-agent-receipt.json`

## Roundtable Activity

- Status: `ready`
- Session status: `running`
- Channel: `dev_support`
- Turns: `30`
- Next persona: `q`
- Last speaker: `blackbeak`
- Last summary: Blackbeak posted turn 30
- Action receipts: `21`
- Summary: running | Blackbeak posted turn 30 | 30 turns | 2/21 recent actions passed verification | 469 blocked job(s)
- State source: `openjaws/local-command-station/roundtable-runtime/discord-roundtable.state.json`
- Session source: `openjaws/local-command-station/roundtable-runtime/discord-roundtable.session.json`

### Recent bounded actions

- Viola -> Immaculate | `Viola audit-and-tighten pass` | changed files `2` | verification `true` | mergeable `true` | completed `2026-04-20T20:27:08.0109176-04:00`
- Action source: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-apps-viola-mo7vuquk-mo7vursy/receipt.json`
- Verification summary: No repo-specific verification command was detected for this workspace.
- Viola -> Asgard | `Viola audit-and-tighten pass` | changed files `4` | verification `false` | mergeable `false` | completed `2026-04-20T20:14:11.3763035-04:00`
- Action source: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-scripts-viola-mo7vbi4c-mo7vbo7t/receipt.json`
- Verification summary: Verification failed: npm run build
- Q -> OpenJaws | `Q audit-and-tighten pass` | changed files `1` | verification `true` | mergeable `true` | completed `2026-04-20T20:07:03.5429230-04:00`
- Action source: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-q-src-q-mo7uwnkb-mo7uwpbw/receipt.json`
- Verification summary: No repo-specific verification command was detected for this workspace.

## Discord Agents

### Q agent

- Status: `blocked`
- Updated: `2026-05-13T02:40:20.632Z`
- Guilds: `0`
- Backend: `Q backend: oci:Q via OCI IAM`
- Summary: starting | gateway offline (0 guild) | Q backend: oci:Q via OCI IAM | knowledge 1482 files | voice staged
- Source: `openjaws/local-command-station/bots/q/discord-agent-receipt.json`
- Recent events: none

### Blackbeak

- Status: `ready`
- Updated: `2026-05-13T17:00:49.020Z`
- Guilds: `2`
- Backend: `Q backend: oci:Q via OCI IAM`
- Summary: ready | gateway online (2 guild) | Q backend: oci:Q via OCI IAM | gateway_ready · connected to 2 guilds | knowledge 2500 files | voice off
- Source: `openjaws/local-command-station/bots/blackbeak/discord-agent-receipt.json`
- Recent events:
  - `2026-05-13T17:00:49.020Z` | `gateway_ready` | connected to 2 guilds
  - `2026-05-13T17:00:40.866Z` | `gateway_reconnecting` | Discord gateway closed with code 1006: Connection ended
  - `2026-05-13T17:00:40.865Z` | `gateway_closed` | Discord gateway closed with code 1006: Connection ended
  - `2026-05-13T16:42:40.512Z` | `blackbeak_meme_skipped` @ `#daily_meme` | scheduled meme skipped: media_blocked until 2026-05-13T20:42:59.380Z
  - `2026-05-13T16:23:34.885Z` | `gateway_ready` | connected to 2 guilds

### Viola

- Status: `ready`
- Updated: `2026-05-13T16:55:48.460Z`
- Guilds: `1`
- Backend: `Q backend: oci:Q via OCI IAM`
- Summary: ready | gateway online (1 guild) | Q backend: oci:Q via OCI IAM | voice_joined · joined #viola-lounge · #viola-lounge | knowledge 2500 files | voice connected @ viola-lounge
- Source: `openjaws/local-command-station/bots/viola/discord-agent-receipt.json`
- Recent events:
  - `2026-05-13T16:55:48.460Z` | `voice_joined` @ `#viola-lounge` | joined #viola-lounge
  - `2026-05-13T16:55:38.078Z` | `gateway_ready` | connected to 1 guild
  - `2026-05-13T16:55:27.147Z` | `gateway_reconnecting` | Discord gateway closed with code 1006: Connection ended
  - `2026-05-13T16:55:27.103Z` | `gateway_closed` | Discord gateway closed with code 1006: Connection ended
  - `2026-05-13T15:21:34.505Z` | `voice_joined` @ `#viola-lounge` | joined #viola-lounge

## Operator State

- Status: `blocked`
- Summary: PossumX
- Operator label: `PossumX`
- Last action: `none`
- Last summary: none
- Last completed: `none`
- Active process present: `false`
- Source: `openjaws/local-command-station/openjaws-operator-state.json`

## Evidence

- OpenJaws root: `openjaws`
- Shared readiness receipt: `immaculate/docs/wiki/Live-Mission-Readiness.json`
- Aggregate Discord/Q receipt: `openjaws/local-command-station/discord-q-agent-receipt.json`
- Roundtable state: `openjaws/local-command-station/roundtable-runtime/discord-roundtable.state.json`
- Roundtable session: `openjaws/local-command-station/roundtable-runtime/discord-roundtable.session.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-apps-viola-mo7vuquk-mo7vursy/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-scripts-viola-mo7vbi4c-mo7vbo7t/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-q-src-q-mo7uwnkb-mo7uwpbw/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-q-q-audit-and-tighten-pass-mo7j4zxf-mo7j50pm/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-q-q-audit-and-tighten-pass-mo7ilnnq-mo7ilwrc/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-blackbeak-asgard-viola-mo7p4ai9-mo7pdro0/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-immaculate-q-mo7oy2t7-mo7p4aro/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-q-openjaws-blackbeak-mo7oobkx-mo7oy43k/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-blackbeak-asgard-viola-mo7oi371-mo7ooeci/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-openjaws-q-mo7nm4su-mo7oi48a/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-blackbeak-immaculate-blackbeak-mo7n9y3p-mo7n9ye6/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-immaculate-viola-mo7n3w9u-mo7n3whx/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-q-immaculate-q-mo7mxy8m-mo7mxygq/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-blackbeak-immaculate-blackbeak-mo7mrqfz-mo7mrqrc/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-viola-immaculate-viola-mo7mktzh-mo7mku90/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/discord-roundtable-q-immaculate-q-mo7md2hk-mo7md2rd/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-viola-viola-audit-and-tighten-pass-mo6j1g22-mo6j3jcd/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-q-q-audit-and-tighten-pass-mo6inwxz-mo6ionuf/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-q-q-audit-and-tighten-pass-mo6gwvre-mo6gx532/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-blackbeak-blackbeak-audit-and-tighten-pass-mo6gkoy7-mo6gkyh8/receipt.json`
- Roundtable action receipt: `openjaws/local-command-station/roundtable-runtime/actions/roundtable-q-q-audit-and-tighten-pass-mo6geej1-mo6gek4v/receipt.json`
- Bot receipt: `openjaws/local-command-station/bots/q/discord-agent-receipt.json`
- Bot receipt: `openjaws/local-command-station/bots/blackbeak/discord-agent-receipt.json`
- Bot receipt: `openjaws/local-command-station/bots/viola/discord-agent-receipt.json`
- Operator state: `openjaws/local-command-station/openjaws-operator-state.json`

## Truth Boundary

- This page reflects local OpenJaws receipt files and operator state, not a fresh public-ledger publication proof by itself.
- Discord transport presence does not imply a live Discord operator command was executed during this pass.
- The aggregate Q receipt is authoritative for the patrol/routing loop; per-bot receipts are supporting transport evidence.
- Roundtable state and action receipts summarize bounded job outcomes only; they do not expose worktree paths, prompts, private channel IDs, or raw workspace diffs.
- Public publication stays blocked until the live mission readiness gate proves ledger.public, q.oci, and discord.transport together.
