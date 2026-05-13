# Arobi Live Ledger Receipt

This page is generated from the live public Arobi status and ledger endpoints plus the latest supervised fabric audit rerun on the controller. It exists to answer a simple question: did a fresh governed audit record actually land on the public Arobi Network node and surface on aura-genesis?

- Generated: `2026-05-13T21:02:56.622Z`
- Release: `0.1.0+ec17e41`
- Repo commit: `ec17e4161f8f32a45c4c16ab550c65457304222b`
- Live status page: https://aura-genesis.org/status
- Live ledger page: https://aura-genesis.org/ledger
- Public API base: `https://arobi.aura-genesis.org`

## Current Result

- Public node version: `3.3.1`
- Public network: `AROBI1`
- Public height: `59409`
- Public peer count: `2`
- Public ledger entries: `32999`
- Public chain valid: `true`
- Fabric source: `nysus`
- Orchestration available: `true`
- Brain ready: `true`

## Latest Visible Public Record

- Latest visible entry: `2026-05-13T21:02:47.0082886Z` at block `unknown`
- Entry source: `immaculate_showcase`
- Model id: `q-operator-public-showcase`
- Model version: `n/a`
- Input summary: `Simulator-only Q decision via local-q-safety during pattern profile. Health degraded, reason takeoff climbout track hold, challenge runway hold short, altitude 221.1 ft AGL, airspeed 78.4 kt, rpm 2546, throttle 1.00, elevator 0.000, target heading 300.9, target altitude 720.0 ft. Awareness: Q sees initial_climbout: agl 221.1ft, projected 348.3ft in 3s, speed margin -7.6kt, heading error 25.1deg, terrain risk low_altitude. Map KJFK/31L says runway along 2343ft, remaining 12206ft, approach distance 0ft, and signed centerline offset -207ft.`
- Decision: `Q FlightGear decision: q_climbout takeoff climbout track hold`
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
- A fresh governed audit record is visible publicly at `2026-05-13T21:02:47.0082886Z`, which proves the audit trail is landing on the live public node.
- The latest visible public record does not match the latest local rerun receipt.

## Truth Boundary

- This page is a live-node receipt, not a benchmark score.
- It is generated from the public aura-genesis status and ledger endpoints plus the latest local supervised fabric-audit rerun receipt.
- The public visible record currently comes from the latest governed audit record surfaced on the public ledger feed.
- At generation time, the public aura-genesis telemetry edge was reachable enough to compare the latest visible public record against the latest supervised rerun.
- This page does not expose secrets, raw private payloads, or raw chain-of-thought.
