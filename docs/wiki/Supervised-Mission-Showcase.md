# Supervised Mission Showcase

This page is the public-safe showcase receipt for the current workstation. It keeps the showcase fail-closed by default, publishes only safe snippets/results, and keeps the private mission lane out of the public proof package.

- Generated: `2026-04-22T00:58:00.325Z`
- Release: `0.1.0+9b31c9d`
- Repo commit: `9b31c9d326f161131c480a5602a9c0c182e5a0d1`

## Showcase Gate

- Status: `closed`
- Public window requested: `false`
- Public window open: `false`
- Private mission lane published: `false`
- Summary: supervised public showcase remains closed because shared readiness blocked: https://arobi.aura-genesis.org: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true | openjaws/artifacts/fabric-audit-soak-20260420T022653Z: verified private node is blocked by mission treasury signer mismatch despite rerun delta 1

## Shared Readiness

- Mission-surface ready: `false`
- Summary: shared readiness blocked: https://arobi.aura-genesis.org: public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true | openjaws/artifacts/fabric-audit-soak-20260420T022653Z: verified private node is blocked by mission treasury signer mismatch despite rerun delta 1
- ledger.public: `blocked` @ `https://arobi.aura-genesis.org` | public edge is synthesized/offline; latest supervised rerun public delta was 1 while local public node readiness is true
- ledger.private: `blocked` @ `openjaws/artifacts/fabric-audit-soak-20260420T022653Z` | verified private node is blocked by mission treasury signer mismatch despite rerun delta 1
- q.local: `ready` @ `http://127.0.0.1:11434` | local Q accepted 3/3 seed+mediation scenario pair(s)
- q.oci: `ready` @ `https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1` | Discord Q receipt reports Q backend: oci:Q via OCI IAM (https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1); gateway=true; guilds=1; health 200; updated 15s ago (budget 900s)
- discord.transport: `ready` @ `http://127.0.0.1:8788/health` | status=ready; gateway=true; guilds=1; health 200; updated 15s ago (budget 900s)

## Publishable Snippets

### Roundtable runtime

- Status: `publishable`
- Summary: 3 scenarios, 0 failed assertions, 3 execution bundles P50, 3 execution receipts P50, seed accepted 3/3, mediation accepted 3/3
- Source: `docs/wiki/Roundtable-Runtime.json` @ `2026-04-21T22:19:50.626Z`

### Terminal-Bench public task

- Status: `publishable`
- Summary: terminal-bench/make-mips-interpreter: 5 trials, 0 errors, mean reward 1.000, pass@2 1.000, pass@4 1.000, pass@5 1.000; leaderboard eligibility remains waiting-for-full-sweep
- Source: `docs/wiki/Terminal-Bench-Public-Task.json` @ `2026-04-19T14:31:45.217Z`

### Harbor supervised tasks

- Status: `publishable`
- Summary: 2 repo-local supervised task(s) through Q: Q structured contract 0.950 | Immaculate bridge fail-closed 0.925. These are supervised local receipts, not a public leaderboard claim.
- Source: `docs/wiki/Harbor-Terminal-Bench.json` @ `2026-04-19T07:43:17.831Z`

### Arobi public-edge summary

- Status: `publishable`
- Summary: public node 3.3.1 on height 34832, peers 2, chain valid true, fabric source synthesized, live record visible false, latest supervised public delta 1. This is a safe public-edge summary only; it does not expose private mission-lane payloads.
- Source: `docs/wiki/Arobi-Live-Ledger-Receipt.json` @ `2026-04-21T22:18:04.712Z`

### Discord and operator activity

- Status: `publishable`
- Summary: 2/3 bot receipts are currently ready; Q patrol is `ready` on layer `Q`; roundtable is `ready` in `#dev_support` with `21` bounded action receipts; operator state is `ready`; activity publication gate is `blocked`: public publication is blocked until the public ledger, Discord transport, and OCI-backed Q all prove readiness on the current workstation.
- Source: `docs/wiki/Live-Operator-Activity.json` @ `2026-04-22T00:57:56.085Z`

## Truth Boundary

- This page is a supervised showcase receipt, not proof that a live Discord operator command or a live 16-subsystem mission was executed on this pass.
- The public showcase remains fail-closed by default until the shared mission gate is green and an explicit operator opt-in opens the window.
- The private mission lane remains closed here even when safe public snippets are publishable.
- The Arobi summary here is limited to safe public-edge status and rerun-delta context; it does not expose raw private payloads, private ledger internals, or chain-of-thought.
- The Harbor and Terminal-Bench snippets are supervised receipts, not an official public leaderboard submission beyond the explicit public-task receipt.
- This page does not prove a fresh live public Arobi write or a fresh live OCI provider probe unless those claims appear on their own dedicated machine-stamped surfaces.
