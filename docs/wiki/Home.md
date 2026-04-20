# Immaculate Wiki

Welcome to the live field guide for Immaculate.

In plain English, Immaculate is a control system for AI and automation.
It helps a machine decide what to do next, checks whether that action is allowed, keeps receipts, and publishes measurements so people can see what is real.

Q is the public model name, built by Arobi Technology Alliance on Gemma 4; Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer.
In the operating model, Arobi Network is the ledger-backed private and public operator network and audit substrate, Immaculate is the governed harness and orchestrator, and Q is the reasoning brain inside that governed stack.

Public website:

- [https://iorch.net](https://iorch.net)

If you only read one generated page before diving deeper, read [[Release-Surface]]. It tells you exactly which build, commit, and Q training bundle the current docs refer to.

If you want the fastest plain-English benchmark summary, read [[Harbor-Terminal-Bench]], [[Q-Mediation-Drift]], [[Q-Gateway-Substrate]], [[Roundtable-Actionability]], and [[Roundtable-Runtime]] together.
Right now the honest story is:

- the latest real Harbor run on the official public Terminal-Bench task is green on the default Q-only path: [[Terminal-Bench-Public-Task]] now records `5/5`, mean reward `1.000`, `0` errors, and pass@2, pass@4, and pass@5 all at `1.000`
- Q parses both tracked local contract lanes cleanly on same-day evidence: `4/4` on [[Model-Benchmark-Comparison]] and `4/4` on [[BridgeBench]]
- the hard `Q` mediation drift lane is green on the active `bench-v23` lock: four mixed-pressure scenarios, `0` failed assertions, route-alignment `P50 1`, runner-path `P95 4.4 ms`, and explicit Q plus Immaculate self-evaluation on every scenario; the exact trace lives on [[Q-Mediation-Drift]]
- the `Q` substrate benchmark is fully green: the dedicated Q gateway stayed live, rejected unauthenticated traffic, preserved `ROUTE/REASON/COMMIT`, and handed the work back into Immaculate arbitration with `0` failed assertions; current seam timing is gateway `P95 15297.49 ms` and arbitration `P95 1.74 ms` on [[Q-Gateway-Substrate]]
- the dedicated Q gateway contract is also green: `/health 200`, authenticated `/api/q/info 200`, authenticated `/v1/models 200`, authenticated chat `200`, bounded `429` concurrency rejection, and a canonical identity smoke that answers as `Q`, `Arobi Technology Alliance`, `Gaetano Comparcola`, `Gemma 4`, and `Immaculate`; the exact current gateway overhead lives on [[Q-Gateway-Validation]]
- the live `Q` API audit loop is also now proving successful governed calls, not just rejects: [[Q-API-Audit]] records a real authenticated `/api/q/run` success with `parse success: true`, `decision trace linked`, and `23349.14 ms` latency on the current Q bundle
- the live Arobi decision review is now proving the governed ledger chain itself, not just one API response: [[Arobi-Decision-Review]] records `2` linked ledgers, `9` linked records, `8` successful linked records, and the latest successful governed record for session `arobi-q-proof-20260419`
- the new live Arobi audit-integrity lane is green: [[Arobi-Audit-Integrity]] records `3` governed scenarios, `0` failed assertions, linked-records `P50 5`, source-coverage `P50 4`, self-evaluations `P50 3`, and audit-completeness `P50 1.00` without exposing raw chain-of-thought
- the roundtable planning lane is now green both as a planner and as a live runtime proof: [[Roundtable-Actionability]] records `3` isolated repo-scoped actions across Immaculate, OpenJaws, and Asgard, and [[Roundtable-Runtime]] proves those same lanes survive the live mediated harness path with `3` scenarios and `0` failed assertions
- the current Q improvement path is machine-stamped: the active Q bundle is `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`, the current benchmark corpus is `58` rows, and the paired Immaculate orchestration bundle lives on [[Release-Surface]] and [[Q-Benchmark-Corpus]]
- the latest tracked W&B export remains current on `2026-04-19`, while the live mediation, substrate, gateway, public-task Harbor win, and audit-integrity benchmark above are the newer same-day repo-local wins
- Immaculate now treats healthy local Q as a first-class governed routing directive, so blocked cloud status no longer forces a false guarded hold when the local Q lane is already healthy

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
- Local cognition through the governed Q runtime and the dedicated `Q` gateway
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
- [[Arobi-Network-Architecture]] is the stable plain-English explainer for the product split: network, harness, and brain
- [[Arobi-Audit-Integrity]] is the live insurer-grade proof that governed Q requests stay linked from prompt to decision to outcome inside the Arobi ledger
- [[Roundtable-Actionability]] is the live proof that Immaculate can turn a cross-project objective into isolated agent lanes instead of storing a roundtable transcript without an execution plan
- [[Roundtable-Runtime]] is the live proof that the roundtable plan survives a real bounded Q run, mediated schedule, and recorded repo-scoped conversation trail instead of staying a planner-only claim
- [[Breakthrough-Log]] tracks major leaps, missed-but-real insights, and hard system milestones as they land
- [[Engineering-Doctrine]] defines the standing build philosophy and what qualifies as a real leap
- [[Benchmark-Status]] points to the live public W&B project plus the latest published benchmark runs by pack
- [[Benchmark-Wandb-Export]] is the committed pull-back from W&B itself, so benchmark results live in git wiki even when the W&B project stays private
- the latest tracked W&B export is currently stamped on `2026-04-19`; the latest local mediation, substrate, gateway, public-task, and audit-integrity reruns are also stamped on `2026-04-19`, so if you see `2026-04-12`, you are looking at the historical hour-class soak lane rather than the newest published W&B result
- [[Harbor-Terminal-Bench]] records the repo-local Harbor task pack, the executed Q gateway scores, and the latest Harbor truth boundary
- [[Terminal-Bench-Public-Task]] records the latest real local Harbor run on the official public task using the default Q-only path
- [[Terminal-Bench-Receipt]] records the current official leaderboard status for `Q`; the local public-task win is real, but leaderboard publication remains gated on the full `89`-task sweep requirement
- [[GitHub-Checks-Receipt]] records a raw GitHub REST verification of workflow-runs and check-runs when classic status contexts are empty, so release claims are tied to the checks GitHub Actions actually publishes
- [[Harbor-Terminal-Bench-Soak]] records the repeated Q-only Harbor hour-lane with oracle/Q side-by-side task scores
- [[Q-Benchmark-Sweep-60m]] records the stitched historical 60-minute Q and Immaculate soak surface across W&B, BridgeBench, and Harbor; it is not the default “latest W&B” page unless that pack is rerun
- [[Q-Hybrid-Training]] records the latest tracked hybrid training session for `Q` plus the paired Immaculate orchestration bundle and cloud-readiness truth
- [[HF-Jobs-Training]] records the authenticated Hugging Face Jobs cloud lane, staged bundle path, visible hardware, and any billing blocker without pretending a cloud run happened
- [[Colab-Free-Training]] records the free supplemental Colab lane that replays the same session bundle for doctoring, Immaculate bundle regeneration, and bounded Q micro-trains
- [[Cloudflare-Q-Inference]] records the Q-only Cloudflare worker, adapter-export readiness, AI Gateway path, and eval replay boundary without pretending Cloudflare became the heavy training backend
- [[OCI-GPU-Advisor]] records the verified subscribed-region OCI GPU inventory plus the next launch recommendation for the active Q session
- [[OCI-Region-Capacity]] records the real tenancy-level OCI region subscription attempts and any hard subscribed-region ceiling blocking the next GPU move
- [[OCI-Q-Training]] tracks the OCI cloud launcher, bundle-staging path, and Vault-oriented training boundary for the Q fine-tune lane
- [[Product-Release-Plan]] records the smallest truthful product and service packaging plan the repo can ship soon
- [[Immaculate-Reliability-Plan]] records the current scheduler/resource hardening pass: shared work-governor admission, backlog-aware width reduction, health-weighted worker dispatch, and the live `/api/work-governor` operator surface
- [[Model-Benchmark-Comparison]] carries the live direct-Q structured contract benchmark plus the latest orchestrator baseline readout
- [[BridgeBench]] carries the live bridge/control-plane Q benchmark alongside the real bridge runtime assertions
- [[BridgeBench-Soak]] carries the repeated one-hour Q-only BridgeBench lane
- [[Q-Gateway-Validation]] carries the live dedicated-gateway contract proof for `Q`: health, auth, model listing, served completion, concurrency rejection, and measured gateway-added latency
- [[Q-Gateway-Substrate]] carries the live seam benchmark where the dedicated `Q` gateway hands structured work back into Immaculate arbitration under real governance pressure
- [[Q-API-Audit]] carries the live `/api/q/run` audit spool summary so Q failures on the private harness edge can feed the repair loop instead of staying trapped in logs
- [[Arobi-Decision-Review]] carries the wins-only review page for linked successful Arobi ledger records, so auditors and insurers can see what was asked, which governed route was chosen, and which successful decision chain landed
- [[Q-Gateway-Architecture]] tracks the dedicated private OCI-first gateway boundary for `Q`, separate from the full harness
- [[Q-Readiness-Gate]] keeps the direct-Q structured contract honest and is currently green: direct `Q` is release-eligible on the tracked local contract lane on this machine
- [[Q-Benchmark-Corpus]] records the tracked benchmark-derived corpus surface for `Q`, including current record counts, source benchmark pages, and export path
- [[Q-Benchmark-Promotion]] records whether the active locked Q bundle already carries the current benchmark corpus or needs a new bench-lineage promotion
- the Q training path now also carries a richer coding/long-context supplement plus an `8192`-token long-context LoRA config, so the next cloud run can target code repair and repo-horizon reasoning instead of only bridge/control-plane seeds
- [[Live-Validation-2026-04-13]] records a historical `60s` validation regression page; the newer live reasoning/seam evidence for the current release is [[Q-Mediation-Drift]] plus [[Q-Gateway-Substrate]]
- [[Training-Data-Factory]] tracks the manifest-first corpus curation path for defensive Q fine-tuning work without pretending the machine replaced legal review
- [[OCI-Private-Deployment]] tracks the hardened Oracle private-subnet harness bundle: Podman image, cloud-init bootstrap, systemd supervision, OCI Vault pull-through, and no public ingress
- [[Q-Model-Identity-And-Banner]] tracks the stable `Q` identity plus the yellow/ocean-blue startup banner controls
- [[Q-API-Hosting]] tracks both the private harness Q edge and the separate dedicated Q gateway, with the hosting truth boundary kept explicit
- the live peer-refresh drill now proves the full liveness loop: healthy signed peers import real remote workers, bad-secret peers are rejected, and killed peers age out and are evicted from placement
- the live lease-renewal drill now proves a second control loop: signed renewals can move placement from one authenticated peer to another when cross-node latency flips
- the live adaptive-federation drill now proves a third control loop: once a peer starts failing remote executions, placement shifts away from it before membership dies, and the failed peer's renewal cadence tightens until signed recovery succeeds
- the live federated-repair drill now proves a fourth control loop: a failed remote attempt can retry once onto an alternate authenticated peer while the damaged peer drops into pending/repairing state and stays out of placement until signed recovery succeeds
- the training-data factory now proves a fifth truth surface: a corpus can be assembled through explicit source manifests, policy gates, secret scanning, dedup, and provenance chain hashes instead of ad hoc scraping
- the `Q` training path now has a tracked manifest, dataset shaper, and Unsloth launch bundle tied back to that same curation/provenance spine instead of an unrelated notebook path
- the `Q` training path now also has a tracked BridgeBench seed mix, a run-id-shaped dataset flow, and a dry-run validator so the repo can test the training path honestly before a GPU job starts
- the live direct-Q benchmark surface now proves the repaired truth after the direct-Q fix: `Q` is `4/4` on the structured contract lane, matching the readiness gate instead of hiding behind the gateway
- the live direct-Q benchmark surface now measures `4/4` at `23191.31 ms` average latency and `23715.52 ms` P95 on this machine
- the live BridgeBench surface now also shows direct `Q` at `4/4` parse success with a clean bridge-runtime lane, so the bridge/control-plane benchmark and the Q contract benchmark agree again
- the live BridgeBench surface now measures `4/4` at `20206.9 ms` average latency and `23994 ms` P95 on this machine
- the live dedicated Q gateway drill still proves the serving edge itself is bounded correctly: `401` without a key, `429` on concurrent keyed pressure, a sanitized served response at `200`, and only `80.64 ms` of gateway overhead above upstream latency on the latest loopback pass
- the live benchmark surface now includes a real `60s` paced benchmark lane and a real `60m` soak lane with published hardware context and wall-clock timing
- the credibility stack now also includes a real crash-torture lane, a real OpenNeuro+DANDI ingest lane, and an honest Temporal side-by-side baseline instead of hiding those claims inside generic smoke runs
- the harness now exposes a governed local node registry plus locality-aware worker placement, so remote cognition can prefer the nearer healthy worker instead of treating every remote endpoint as identical
- the operator surface now includes `GET /api/benchmarks/trend`, which reports published-run drift honestly as run-order trend analysis rather than pretending it is wall-clock forecasting

## Operator Motto

Build it like a power grid.
Measure it like a lab instrument.
Govern it like it matters.
