# Arobi Live Ledger Receipt

This page is generated from the live public Arobi status and ledger endpoints plus the latest supervised fabric audit rerun on the controller. It exists to answer a simple question: did a fresh governed audit record actually land on the public Arobi Network node and surface on aura-genesis?

- Generated: `2026-04-20T02:34:31.076Z`
- Release: `0.1.0+24be021`
- Repo commit: `24be0218adb30c31fafd7ffb246a344ed8ebc7e7`
- Live status page: https://aura-genesis.org/status
- Live ledger page: https://aura-genesis.org/ledger
- Public API base: `https://arobi.aura-genesis.org`

## Current Result

- Public node version: `3.3.1`
- Public network: `AROBI1`
- Public height: `32895`
- Public peer count: `1`
- Public ledger entries: `397`
- Public chain valid: `true`
- Fabric source: `nysus`
- Orchestration available: `true`
- Brain ready: `true`

## Latest Visible Public Record

- Latest visible entry: `2026-04-20T02:26:54.082101500Z` at block `397`
- Entry source: `control_fabric`
- Model id: `Q+Immaculate+Arobi`
- Model version: `3.3.1`
- Input summary: `Supervised non-actuating private audit cycle 1 of 1`
- Decision: `Recorded full supervised non-actuating private audit trace`
- Network context: `00`

## Latest Supervised Rerun

- Run id: `fabric-audit-soak-20260420T022653Z`
- Started: `2026-04-20T02:26:53.8134029Z`
- Finished: `2026-04-20T02:27:01.9547529Z`
- Output dir: `D:\openjaws\OpenJaws\artifacts\fabric-audit-soak-20260420T022653Z`
- Q process exited cleanly: `true`
- Public entry delta during rerun: `1`
- Private entry delta during rerun: `1`
- Latest live entry matches rerun receipt: `true`

## Plain-English Readout

- The public aura-genesis status and ledger surfaces are reading the live 3.3.1 Arobi node, not a stale local-only file.
- A fresh governed control_fabric audit record is visible publicly at `2026-04-20T02:26:54.082101500Z`, which proves the audit trail is landing on the live public node.
- The latest visible public record matches the latest supervised rerun receipt `fabric-audit-soak-20260420T022653Z`, so the same write path used locally is what the public node surfaced.

## Truth Boundary

- This page is a live-node receipt, not a benchmark score.
- It is generated from the public aura-genesis status and ledger endpoints plus the latest local supervised fabric-audit rerun receipt.
- The public visible record currently comes from the governed control_fabric private-trace path surfaced on the public ledger feed.
- This page does not expose secrets, raw private payloads, or raw chain-of-thought.
