# Immaculate Wiki

Welcome to the live field guide for Immaculate.

Immaculate is not trying to cosplay a brain. It is trying to become a durable,
observable, governed control system for intelligence at scale.

## What This Project Actually Prioritizes

- Time consistency before cleverness
- Replayability before mystique
- Benchmarks before mythology
- Fault isolation before scale
- Governance before convenience

## Current Shape

- Multi-plane orchestration substrate
- Synthetic connectome state and propagation
- Durable harness with TUI and dashboard control
- BIDS and NWB ingest
- Local cognition through Ollama
- Governed actuation with direct transport supervision
- Authenticated federation membership export/import with verified remote node and worker identity
- Recurring signed peer refresh plus signed lease renewal with stale-state eviction, so dead remotes fall out of placement instead of lingering as ghost capacity
- Placement that combines locality, live peer-smoothed latency, cost, and device affinity without claiming full mesh federation yet
- Adaptive federated execution pressure that blends live peer latency with measured remote execution success/failure, then tightens or relaxes signed lease cadence as peers degrade or recover
- Live multi-peer guarded swarms that can spread a cognition batch across authenticated remote peers under one real parallel batch instead of faking swarm topology in the ledger
- Bounded alternate-peer retry after failed remote cognition, with the first failure kept in the durable ledger and the retry linked through explicit repair lineage
- Internal signed repair state that fail-closes remote placement while a peer is pending or in repair, with no public insecure repair endpoint

## Where Community Help Matters

- Better benchmark packs
- Additional device transports
- Better graph tooling and route selection
- Safer governance and redaction policy models
- Neurodata adapters that respect real-world constraints
- richer training-data policy packs, license review workflows, and provenance-backed dataset factories

## Living Record

- [[Breakthrough-Log]] tracks major leaps, missed-but-real insights, and hard system milestones as they land
- [[Engineering-Doctrine]] defines the standing build philosophy and what qualifies as a real leap
- [[Benchmark-Status]] points to the live public W&B project plus the latest published benchmark runs by pack
- [[Benchmark-Wandb-Export]] is the committed pull-back from W&B itself, so benchmark results live in git wiki even when the W&B project stays private
- [[Model-Benchmark-Comparison]] carries the live local cross-model comparison surface for `Q`, Gemma 3, Qwen, and the latest orchestrator baseline readout
- [[BridgeBench]] carries the live bridge/control-plane comparison surface for `Q` and the other installed local models, alongside the real bridge runtime assertions
- [[Live-Validation-2026-04-13]] records the latest fresh machine-run validation pass, including the current `60s` benchmark regression instead of hiding it
- [[Training-Data-Factory]] tracks the manifest-first corpus curation path for Gemma-style defensive fine-tuning work without pretending the machine replaced legal review
- [[OCI-Private-Deployment]] tracks the hardened Oracle private-subnet harness bundle: Podman image, cloud-init bootstrap, systemd supervision, OCI Vault pull-through, and no public ingress
- [[Q-Alias-and-Banner]] tracks the truthful `Q` alias over Gemma 4 plus the yellow/ocean-blue startup banner controls
- [[Q-API-Hosting]] tracks the narrow header-authenticated Q inference edge, per-key rate limiting, loopback live validation, and the truthful OCI/private-hosting boundary
- the live peer-refresh drill now proves the full liveness loop: healthy signed peers import real remote workers, bad-secret peers are rejected, and killed peers age out and are evicted from placement
- the live lease-renewal drill now proves a second control loop: signed renewals can move placement from one authenticated peer to another when cross-node latency flips
- the live adaptive-federation drill now proves a third control loop: once a peer starts failing remote executions, placement shifts away from it before membership dies, and the failed peer's renewal cadence tightens until signed recovery succeeds
- the live federated-repair drill now proves a fourth control loop: a failed remote attempt can retry once onto an alternate authenticated peer while the damaged peer drops into pending/repairing state and stays out of placement until signed recovery succeeds
- the training-data factory now proves a fifth truth surface: a corpus can be assembled through explicit source manifests, policy gates, secret scanning, dedup, and provenance chain hashes instead of ad hoc scraping
- the `Q` training path now has a tracked manifest, dataset shaper, and Unsloth launch bundle tied back to that same curation/provenance spine instead of an unrelated notebook path
- the `Q` training path now also has a tracked BridgeBench seed mix, a run-id-shaped dataset flow, and a dry-run validator so the repo can test the training path honestly before a GPU job starts
- the live model comparison surface now proves a hard local truth: `gemma3:4b` currently follows the route/reason/commit contract more reliably than `Q` or `qwen3:8b` on this machine, so `Q` still needs fine-tune work rather than branding alone
- the live Q API drill now proves the serving edge itself is bounded correctly: `401` without a key, `429` on concurrent keyed pressure, and a truthful model-side `503` when Ollama returns no completion
- the live validation page now also records a second runtime split: `gemma3:4b` wins the direct comparison CLI on structure, but the governed live harness route still shows an unresolved in-server hang for that model on this machine
- the live benchmark surface now includes a real `60s` paced benchmark lane and a real `60m` soak lane with published hardware context and wall-clock timing
- the latest live validation page now also keeps the ugly part on record: the fresh `60s` benchmark rerun failed three assertions on `knightly`, so the throughput line is published as a regression signal rather than quietly replaced with an older clean run
- the credibility stack now also includes a real crash-torture lane, a real OpenNeuro+DANDI ingest lane, and an honest Temporal side-by-side baseline instead of hiding those claims inside generic smoke runs
- the harness now exposes a governed local node registry plus locality-aware worker placement, so remote cognition can prefer the nearer healthy worker instead of treating every remote endpoint as identical
- the operator surface now includes `GET /api/benchmarks/trend`, which reports published-run drift honestly as run-order trend analysis rather than pretending it is wall-clock forecasting

## Operator Motto

Build it like a power grid.
Measure it like a lab instrument.
Govern it like it matters.
