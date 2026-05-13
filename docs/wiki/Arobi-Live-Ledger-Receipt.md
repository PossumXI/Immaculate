# Arobi Live Ledger Receipt

This page is generated from the live public Arobi status and ledger endpoints plus the latest supervised fabric audit rerun on the controller. It exists to answer a simple question: did a fresh governed audit record actually land on the public Arobi Network node and surface on aura-genesis?

- Generated: `2026-05-13T20:21:53.430Z`
- Release: `0.1.0+0acf403`
- Repo commit: `0acf403d1d63c115e78a8ac5254325c1efb47dae`
- Live status page: https://aura-genesis.org/status
- Live ledger page: https://aura-genesis.org/ledger
- Public API base: `https://arobi.aura-genesis.org`

## Current Result

- Public node version: `3.3.1`
- Public network: `AROBI1`
- Public height: `59370`
- Public peer count: `unknown`
- Public ledger entries: `unknown`
- Public chain valid: `false`
- Fabric source: `nysus`
- Orchestration available: `true`
- Brain ready: `true`

## Latest Visible Public Record

- Latest visible entry: `2026-05-13T20:21:51.1632338Z` at block `unknown`
- Entry source: `immaculate_showcase`
- Model id: `q-operator-public-showcase`
- Model version: `n/a`
- Input summary: `Simulator-only Q decision via local-q-safety during pattern profile. Health degraded, reason stabilized final energy gate, challenge runway hold short, altitude 783.2 ft AGL, airspeed 108.1 kt, rpm 1179, throttle 0.00, elevator 0.220, target heading 350.7, target altitude 688.9 ft. Awareness: Q sees cruise: agl 783.2ft, projected 839.7ft in 3s, speed margin 33.9kt, heading error -22.0deg, terrain risk clear. Map KJFK/31L says runway along -8329ft, remaining 14549ft, approach distance 8329ft, and signed centerline offset -187ft.`
- Decision: `Q FlightGear decision: q_cruise stabilized final energy gate`
- Network context: `PUBLIC`

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

- The public aura-genesis status and ledger surfaces are reading the live 3.3.1 Arobi node, not a stale local-only file.
- A fresh governed audit record is visible publicly at `2026-05-13T20:21:51.1632338Z`, which proves the audit trail is landing on the live public node.
- The latest visible public record does not match the latest local rerun receipt.

## Truth Boundary

- This page is a live-node receipt, not a benchmark score.
- It is generated from the public aura-genesis status and ledger endpoints plus the latest local supervised fabric-audit rerun receipt.
- The public visible record currently comes from the latest governed audit record surfaced on the public ledger feed.
- At generation time, the public aura-genesis telemetry edge was reachable enough to compare the latest visible public record against the latest supervised rerun.
- This page does not expose secrets, raw private payloads, or raw chain-of-thought.
