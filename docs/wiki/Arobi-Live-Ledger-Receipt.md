# Arobi Live Ledger Receipt

This page is generated from the live public Arobi status and ledger endpoints plus the latest supervised fabric audit rerun on the controller. It exists to answer a simple question: did a fresh governed audit record actually land on the public Arobi Network node and surface on aura-genesis?

- Generated: `2026-04-20T17:22:38.533Z`
- Release: `0.1.0+ad30f3a`
- Repo commit: `ad30f3a71f6ac344c50fe67d1899f8736bdc687e`
- Live status page: https://aura-genesis.org/status
- Live ledger page: https://aura-genesis.org/ledger
- Public API base: `https://arobi.aura-genesis.org`

## Current Result

- Public node version: `unknown`
- Public network: `unknown`
- Public height: `unknown`
- Public peer count: `unknown`
- Public ledger entries: `unknown`
- Public chain valid: `false`
- Fabric source: `synthesized`
- Orchestration available: `false`
- Brain ready: `false`

## Latest Visible Public Record

- Latest visible entry: `missing`
- Entry source: `unknown`
- Model id: `unknown`
- Model version: `unknown`
- Input summary: `unknown`
- Decision: `unknown`
- Network context: `unknown`

## Latest Supervised Rerun

- Run id: `fabric-audit-soak-20260420T022653Z`
- Started: `2026-04-20T02:26:53.8134029Z`
- Finished: `2026-04-20T02:27:01.9547529Z`
- Output dir: `D:\openjaws\OpenJaws\artifacts\fabric-audit-soak-20260420T022653Z`
- Q process exited cleanly: `true`
- Public entry delta during rerun: `1`
- Private entry delta during rerun: `1`
- Latest live entry matches rerun receipt: `false`

## Plain-English Readout

- The public aura-genesis telemetry edge is currently synthesized/offline, so the public site is not proving a live Arobi node right now.
- The latest supervised rerun `fabric-audit-soak-20260420T022653Z` still shows a public delta of `1` and a private delta of `1`, but no fresh governed record is visible through the current public edge.
- The latest visible public record does not match the latest local rerun receipt.

## Truth Boundary

- This page is a live-node receipt, not a benchmark score.
- It is generated from the public aura-genesis status and ledger endpoints plus the latest local supervised fabric-audit rerun receipt.
- The public visible record currently comes from the governed control_fabric private-trace path surfaced on the public ledger feed.
- At generation time, the public aura-genesis telemetry edge was synthesized/offline, so this receipt falls back to the last verified supervised rerun instead of claiming a live public-node match.
- This page does not expose secrets, raw private payloads, or raw chain-of-thought.
