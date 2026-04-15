# Immaculate Wiki

Welcome to the live field guide for Immaculate.

In plain English, Immaculate is a control system for AI and automation.
It helps a machine decide what to do next, checks whether that action is allowed, keeps receipts, and publishes measurements so people can see what is real.

`Q` is the local reasoning-model lane inside that system. It is served through a bounded gateway, trained through a tracked hybrid session path, and published here simply as `Q`.

Public website:

- [https://iorch.net](https://iorch.net)

If you only read one generated page before diving deeper, read [[Release-Surface]]. It tells you exactly which build, commit, and Q training bundle the current docs refer to.

## What This Project Actually Prioritizes

- Time consistency before cleverness
- Replayability before mystique
- Benchmarks before mythology
- Fault isolation before scale
- Governance before convenience

## Current Shape

- A system that runs AI work in stages instead of one opaque jump
- A durable harness with a dashboard and terminal control surface
- A record of what happened, what was denied, and what retried
- Neurodata ingest through BIDS and NWB
- Local cognition through Ollama and the dedicated `Q` gateway
- Governed actuation with transport health checks instead of blind delivery
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

- [[Release-Surface]] is the machine-stamped build-and-bundle page for the current Immaculate and `Q` release state
- [[Breakthrough-Log]] tracks major leaps, missed-but-real insights, and hard system milestones as they land
- [[Engineering-Doctrine]] defines the standing build philosophy and what qualifies as a real leap
- [[Benchmark-Status]] points to the live public W&B project plus the latest published benchmark runs by pack
- [[Benchmark-Wandb-Export]] is the committed pull-back from W&B itself, so benchmark results live in git wiki even when the W&B project stays private
- [[Harbor-Terminal-Bench]] records the repo-local Harbor task pack, the executed Q gateway scores, and the latest Harbor truth boundary
- [[Harbor-Terminal-Bench-Soak]] records the repeated Q-only Harbor hour-lane with oracle/Q side-by-side task scores
- [[Q-Benchmark-Sweep-60m]] records the stitched 60-minute Q and Immaculate benchmark surface across W&B, BridgeBench, and Harbor
- [[Q-Hybrid-Training]] records the latest tracked hybrid training session for `Q` plus the paired Immaculate orchestration bundle and cloud-readiness truth
- [[OCI-GPU-Advisor]] records the verified subscribed-region OCI GPU inventory plus the next launch recommendation for the active Q session
- [[OCI-Q-Training]] tracks the OCI cloud launcher, bundle-staging path, and Vault-oriented training boundary for the Q fine-tune lane
- [[Product-Release-Plan]] records the smallest truthful product and service packaging plan the repo can ship soon
- [[Model-Benchmark-Comparison]] carries the live direct-Q structured contract benchmark plus the latest orchestrator baseline readout
- [[BridgeBench]] carries the live bridge/control-plane Q benchmark alongside the real bridge runtime assertions
- [[BridgeBench-Soak]] carries the repeated one-hour Q-only BridgeBench lane
- [[Q-Gateway-Validation]] carries the live dedicated-gateway contract proof for `Q`: health, auth, model listing, served completion, and concurrency rejection
- [[Q-Gateway-Architecture]] tracks the dedicated private OCI-first gateway boundary for `Q`, separate from the full harness
- [[Q-Readiness-Gate]] keeps the direct-Q structured contract honest and is currently green: direct `Q` is release-eligible on the tracked local contract lane on this machine
- [[Q-Benchmark-Corpus]] records the tracked benchmark-derived corpus surface for `Q`, including current record counts, source benchmark pages, and export path
- [[Q-Benchmark-Promotion]] records whether the active locked Q bundle already carries the current benchmark corpus or needs a new bench-lineage promotion
- [[Q-Failure-Corpus]] is now a strict failure-only export and currently records zero live failure seeds; resolved successes are no longer mixed into that surface
- the Q training path now also carries a richer coding/long-context supplement plus an `8192`-token long-context LoRA config, so the next cloud run can target code repair and repo-horizon reasoning instead of only bridge/control-plane seeds
- [[Live-Validation-2026-04-13]] records the latest fresh machine-run validation pass, including the current `60s` benchmark regression instead of hiding it
- [[Training-Data-Factory]] tracks the manifest-first corpus curation path for defensive Q fine-tuning work without pretending the machine replaced legal review
- [[OCI-Private-Deployment]] tracks the hardened Oracle private-subnet harness bundle: Podman image, cloud-init bootstrap, systemd supervision, OCI Vault pull-through, and no public ingress
- [[Q-Alias-and-Banner]] tracks the stable `Q` identity plus the yellow/ocean-blue startup banner controls
- [[Q-API-Hosting]] tracks both the private harness Q edge and the separate dedicated Q gateway, with the hosting truth boundary kept explicit
- the live peer-refresh drill now proves the full liveness loop: healthy signed peers import real remote workers, bad-secret peers are rejected, and killed peers age out and are evicted from placement
- the live lease-renewal drill now proves a second control loop: signed renewals can move placement from one authenticated peer to another when cross-node latency flips
- the live adaptive-federation drill now proves a third control loop: once a peer starts failing remote executions, placement shifts away from it before membership dies, and the failed peer's renewal cadence tightens until signed recovery succeeds
- the live federated-repair drill now proves a fourth control loop: a failed remote attempt can retry once onto an alternate authenticated peer while the damaged peer drops into pending/repairing state and stays out of placement until signed recovery succeeds
- the training-data factory now proves a fifth truth surface: a corpus can be assembled through explicit source manifests, policy gates, secret scanning, dedup, and provenance chain hashes instead of ad hoc scraping
- the `Q` training path now has a tracked manifest, dataset shaper, and Unsloth launch bundle tied back to that same curation/provenance spine instead of an unrelated notebook path
- the `Q` training path now also has a tracked BridgeBench seed mix, a run-id-shaped dataset flow, and a dry-run validator so the repo can test the training path honestly before a GPU job starts
- the live direct-Q benchmark surface now proves the repaired truth after the direct-Q fix: `Q` is `4/4` on the structured contract lane, matching the readiness gate instead of hiding behind the gateway
- the live BridgeBench surface now also shows direct `Q` at `4/4` parse success with a clean bridge-runtime lane, so the bridge/control-plane benchmark and the Q contract benchmark agree again
- the live dedicated Q gateway drill still proves the serving edge itself is bounded correctly: `401` without a key, `429` on concurrent keyed pressure, a sanitized served response at `200`, and only ~`93 ms` of gateway overhead above upstream latency on the latest loopback pass
- the live benchmark surface now includes a real `60s` paced benchmark lane and a real `60m` soak lane with published hardware context and wall-clock timing
- the latest live validation page now also keeps the ugly part on record: the fresh `60s` benchmark rerun failed three assertions on `knightly`, so the throughput line is published as a regression signal rather than quietly replaced with an older clean run
- the credibility stack now also includes a real crash-torture lane, a real OpenNeuro+DANDI ingest lane, and an honest Temporal side-by-side baseline instead of hiding those claims inside generic smoke runs
- the harness now exposes a governed local node registry plus locality-aware worker placement, so remote cognition can prefer the nearer healthy worker instead of treating every remote endpoint as identical
- the operator surface now includes `GET /api/benchmarks/trend`, which reports published-run drift honestly as run-order trend analysis rather than pretending it is wall-clock forecasting

## Operator Motto

Build it like a power grid.
Measure it like a lab instrument.
Govern it like it matters.
