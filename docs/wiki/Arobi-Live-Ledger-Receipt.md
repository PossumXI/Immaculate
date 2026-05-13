# Arobi Live Ledger Receipt

This page is generated from the live public Arobi status and ledger endpoints plus the latest supervised fabric audit rerun on the controller. It exists to answer a simple question: did a fresh governed audit record actually land on the public Arobi Network node and surface on aura-genesis?

- Generated: `2026-05-13T17:05:15.331Z`
- Release: `0.1.0+5859730`
- Repo commit: `585973070c9a2cd34de1d38f9675b430bc7421a4`
- Live status page: https://aura-genesis.org/status
- Live ledger page: https://aura-genesis.org/ledger
- Public API base: `https://arobi.aura-genesis.org`

## Current Result

- Public node version: `3.3.1`
- Public network: `AROBI1`
- Public height: `59178`
- Public peer count: `2`
- Public ledger entries: `32156`
- Public chain valid: `true`
- Fabric source: `synthesized`
- Orchestration available: `false`
- Brain ready: `false`

## Latest Visible Public Record

- Latest visible entry: `2026-05-13T17:04:39.0029789Z` at block `unknown`
- Entry source: `immaculate_showcase`
- Model id: `q-operator-public-showcase`
- Model version: `n/a`
- Input summary: `Simulator-only Q decision via local-q-safety during pattern profile. Health degraded, reason downwind high energy descent, challenge runway hold short, altitude 1140.3 ft AGL, airspeed 102.3 kt, rpm 1095, throttle 0.00, elevator 0.180, target heading 111.2, target altitude 713.0 ft. Awareness: Q sees cruise: agl 1140.3ft, projected 1090.6ft in 3s, speed margin 14.3kt, heading error -5.0deg, terrain risk clear. Map KJFK/31L says runway along -7075ft, remaining 14549ft, approach distance 7075ft, and signed centerline offset -3805ft.`
- Decision: `Q FlightGear decision: q_cruise downwind high energy descent`
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

- The public aura-genesis telemetry edge is currently synthesized/offline, so the public site is not proving a live Arobi node right now.
- The latest supervised rerun `fabric-audit-soak-20260420T022653Z` still shows a public delta of `1` and a private delta of `1`, but no fresh governed record is visible through the current public edge.
- The latest visible public record does not match the latest local rerun receipt.

## Truth Boundary

- This page is a live-node receipt, not a benchmark score.
- It is generated from the public aura-genesis status and ledger endpoints plus the latest local supervised fabric-audit rerun receipt.
- The public visible record currently comes from the latest governed audit record surfaced on the public ledger feed.
- At generation time, the public aura-genesis telemetry edge was synthesized/offline, so this receipt falls back to the last verified supervised rerun instead of claiming a live public-node match.
- This page does not expose secrets, raw private payloads, or raw chain-of-thought.
