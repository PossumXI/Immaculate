# Immaculate

```text
██╗███╗   ███╗███╗   ███╗ █████╗  ██████╗██╗   ██╗██╗      █████╗ ████████╗███████╗
██║████╗ ████║████╗ ████║██╔══██╗██╔════╝██║   ██║██║     ██╔══██╗╚══██╔══╝██╔════╝
██║██╔████╔██║██╔████╔██║███████║██║     ██║   ██║██║     ███████║   ██║   █████╗
██║██║╚██╔╝██║██║╚██╔╝██║██╔══██║██║     ██║   ██║██║     ██╔══██║   ██║   ██╔══╝
██║██║ ╚═╝ ██║██║ ╚═╝ ██║██║  ██║╚██████╗╚██████╔╝███████╗██║  ██║   ██║   ███████╗
╚═╝╚═╝     ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
```

Immaculate is software for running AI and automation carefully.
In plain English: it helps a system decide what to do next, checks whether that action is allowed, records what happened, and publishes real benchmarks instead of hand-wavy claims.

`Q` is the single custom model used across this repo. It is built on Gemma 4, developed by Arobi Technology Alliance, served everywhere here under the product name `Q`, and tied to a reproducible training-bundle path.
The newest proof points are a real `Q` substrate benchmark, where the gateway hands structured work back into Immaculate arbitration, a canonical identity gate where Q answers as Q with the right company and project facts, and a real `Q` API audit loop where live `/api/q/run` failures become tracked repair inputs instead of disappearing into logs.

Gaetano Comparcola is the founder and CEO of Arobi Technology Alliance and the lead architect and engineer behind Immaculate and Q.

This repository is prepared for public collaboration under the Apache 2.0 license. Community contributions are welcome, but the project keeps a hard line on governance, reproducibility, and security.

## Public Site

- live website: [iorch.net](https://iorch.net)
- company profile: [Aura Genesis / Arobi](https://aura-genesis.org)

## What It Does Today

- runs multi-step orchestration across fast reflex paths, deeper reasoning paths, and offline work
- keeps a durable audit trail so actions, denials, retries, and failures are not lost
- exposes a realtime harness, a terminal UI, and a dashboard
- ingests BIDS and NWB neurodata and replays it through the orchestration spine
- serves `Q` through a bounded API gateway with API keys, rate limits, and concurrency limits
- publishes measured benchmark outputs to W&B and commits exported result summaries back into git

## Current Build And Evidence

- public website: [iorch.net](https://iorch.net)
- current release surface: [docs/wiki/Release-Surface.md](docs/wiki/Release-Surface.md)
- latest Harbor public-task win: [docs/wiki/Terminal-Bench-Public-Task.md](docs/wiki/Terminal-Bench-Public-Task.md)
- live Q structured contract benchmark: [docs/wiki/Model-Benchmark-Comparison.md](docs/wiki/Model-Benchmark-Comparison.md)
- live BridgeBench: [docs/wiki/BridgeBench.md](docs/wiki/BridgeBench.md)
- live BridgeBench soak: [docs/wiki/BridgeBench-Soak.md](docs/wiki/BridgeBench-Soak.md)
- Harbor terminal bench: [docs/wiki/Harbor-Terminal-Bench.md](docs/wiki/Harbor-Terminal-Bench.md)
- GitHub checks receipt: [docs/wiki/GitHub-Checks-Receipt.md](docs/wiki/GitHub-Checks-Receipt.md)
- Harbor terminal bench soak: [docs/wiki/Harbor-Terminal-Bench-Soak.md](docs/wiki/Harbor-Terminal-Bench-Soak.md)
- Q benchmark sweep (60m historical lane): [docs/wiki/Q-Benchmark-Sweep-60m.md](docs/wiki/Q-Benchmark-Sweep-60m.md)
- Q benchmark corpus: [docs/wiki/Q-Benchmark-Corpus.md](docs/wiki/Q-Benchmark-Corpus.md)
- Q benchmark promotion: [docs/wiki/Q-Benchmark-Promotion.md](docs/wiki/Q-Benchmark-Promotion.md)
- hybrid Q training session: [docs/wiki/Q-Hybrid-Training.md](docs/wiki/Q-Hybrid-Training.md)
- HF Jobs training lane: [docs/wiki/HF-Jobs-Training.md](docs/wiki/HF-Jobs-Training.md)
- Colab free training lane: [docs/wiki/Colab-Free-Training.md](docs/wiki/Colab-Free-Training.md)
- Kaggle free training lane: [docs/wiki/Kaggle-Free-Training.md](docs/wiki/Kaggle-Free-Training.md)
- Cloudflare Q inference lane: [docs/wiki/Cloudflare-Q-Inference.md](docs/wiki/Cloudflare-Q-Inference.md)
- OCI GPU advisor: [docs/wiki/OCI-GPU-Advisor.md](docs/wiki/OCI-GPU-Advisor.md)
- OCI region capacity: [docs/wiki/OCI-Region-Capacity.md](docs/wiki/OCI-Region-Capacity.md)
- OCI Q training bundle: [docs/wiki/OCI-Q-Training.md](docs/wiki/OCI-Q-Training.md)
- product and release packaging plan: [docs/wiki/Product-Release-Plan.md](docs/wiki/Product-Release-Plan.md)
- direct Q readiness gate: [docs/wiki/Q-Readiness-Gate.md](docs/wiki/Q-Readiness-Gate.md)
- dedicated Q gateway validation: [docs/wiki/Q-Gateway-Validation.md](docs/wiki/Q-Gateway-Validation.md)
- Q gateway substrate seam benchmark: [docs/wiki/Q-Gateway-Substrate.md](docs/wiki/Q-Gateway-Substrate.md)
- Q mediation drift benchmark: [docs/wiki/Q-Mediation-Drift.md](docs/wiki/Q-Mediation-Drift.md)
- Q API audit feedback loop: [docs/wiki/Q-API-Audit.md](docs/wiki/Q-API-Audit.md)
- W&B pull-back committed into git: [docs/wiki/Benchmark-Wandb-Export.md](docs/wiki/Benchmark-Wandb-Export.md)

Latest plain-English readout:

- the latest real Harbor run on the official public Terminal-Bench task is green on the default Q-only path: [docs/wiki/Terminal-Bench-Public-Task.md](docs/wiki/Terminal-Bench-Public-Task.md) now records `5/5`, mean reward `1.000`, `0` errors, and pass@2, pass@4, and pass@5 all at `1.000`
- direct `Q` is green on both tracked local contract lanes: `4/4` on [docs/wiki/Model-Benchmark-Comparison.md](docs/wiki/Model-Benchmark-Comparison.md) with `23191.31 ms` average latency and `23715.52 ms` P95, and `4/4` on [docs/wiki/BridgeBench.md](docs/wiki/BridgeBench.md) with `0` bridge-runtime assertion failures, `20206.9 ms` average latency, and `23994 ms` P95
- the hard mixed-pressure reasoning lane is green on the active `bench-v23` lock: the live four-scenario [docs/wiki/Q-Mediation-Drift.md](docs/wiki/Q-Mediation-Drift.md) pack kept `ROUTE / REASON / COMMIT` intact, held route-alignment at `1`, emitted Q and Immaculate self-evaluations on every scenario, and split runner-path timing cleanly from model timing with runner-path `P95 4.13 ms`
- the `Q` gateway-to-Immaculate seam is green end to end on the current tracked lock: `0` failed assertions, preserved `ROUTE / REASON / COMMIT`, carried real governance denials through the critical hold case, and now measures gateway latency `P95 18109.65 ms` with arbitration `P95 1.83 ms`; the exact current latencies live on [docs/wiki/Q-Gateway-Substrate.md](docs/wiki/Q-Gateway-Substrate.md)
- the dedicated Q gateway contract is green and Q-only: `/health 200`, authenticated `/api/q/info 200`, authenticated `/v1/models 200`, authenticated chat `200`, bounded `429` concurrency rejection, and a canonical identity smoke that answers as `Q`, `Arobi Technology Alliance`, `Gaetano Comparcola`, `Gemma 4`, and `Immaculate`; the current measured gateway overhead lives on [docs/wiki/Q-Gateway-Validation.md](docs/wiki/Q-Gateway-Validation.md)
- the latest tracked W&B export is current on `2026-04-18` through [docs/wiki/Benchmark-Status.md](docs/wiki/Benchmark-Status.md) and [docs/wiki/Benchmark-Wandb-Export.md](docs/wiki/Benchmark-Wandb-Export.md); the separate [docs/wiki/Q-Benchmark-Sweep-60m.md](docs/wiki/Q-Benchmark-Sweep-60m.md) page remains the historical hour-class soak lane
- the current Q bundle, hybrid session, benchmark corpus, and paired Immaculate orchestration bundle are machine-stamped on [docs/wiki/Release-Surface.md](docs/wiki/Release-Surface.md); the active tracked Q bundle is `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`
- the tracked Q benchmark corpus currently carries `55` records, and the hybrid training session plus Kaggle and Colab export lanes are restamped to the same `bench-v23` lineage
- Immaculate now treats the healthy local Q lane as a first-class governed routing directive instead of a generic model slot, so blocked cloud status no longer forces a false guarded hold when local Q is healthy
- the current HF Jobs lane is authenticated, hardware-visible, restaged against the active `bench-v23` lock, and launch-ready when you want to start the cloud run

## Workspace

- `packages/core`: shared domain model, simulation engine, protocol types
- `apps/harness`: realtime orchestration harness and websocket control plane
- `apps/tui`: terminal control surface
- `apps/dashboard`: Next.js overwatch dashboard
- `docs/wiki`: wiki source for onboarding, operator context, and community field notes

## Open Source

- License: [Apache-2.0](LICENSE)
- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)
- Support guide: [SUPPORT.md](SUPPORT.md)
- GitHub publication script: `scripts/publish-github.ps1`

Generated runtime state, benchmark run dumps, local tooling environments, and local machine paths are intentionally kept out of git.
Major breakthroughs and materially new system discoveries are tracked in the wiki source at `docs/wiki/Breakthrough-Log.md`.
The tracked public benchmark surface lives at `docs/wiki/Benchmark-Status.md`.

## Training Data Curation

Immaculate now includes a policy-aware training-data curation factory for defensive Q corpus work.
It is built to make dataset assembly reproducible and auditable before any fine-tune run starts.

What it does today:

- loads an explicit source manifest
- materializes local or remote git sources into a controlled workspace
- applies allow/review/reject license policy gates
- performs a best-effort scan for likely secrets before export
- deduplicates repeated content across sources
- emits curated JSONL shards plus a run manifest and provenance chain hashes
- records commercial-use, defense-use, copyleft-free, and proprietary-output-free policy flags as explicit metadata rather than hidden assumptions

Those flags are outputs of the current curation policy and heuristics, not legal certification.

What it does not claim today:

- legal certification
- automatic proof that a dataset is safe for every downstream use
- complete secret detection
- automatic clearance of ambiguous or custom licenses without human review

Run the curation smoke:

```powershell
npm run training-data:smoke
```

Run a real curation pass from a manifest:

```powershell
npm run training-data:curate -- fixtures/training/q-defsec-curation.example.json
```

The tracked example manifest lives at [fixtures/training/q-defsec-curation.example.json](fixtures/training/q-defsec-curation.example.json).
The default generated output root is `.training-output/`, which is intentionally ignored by git.

For the `Q` fine-tune path specifically:

- model identity and banner guide: [docs/wiki/Q-Model-Identity-And-Banner.md](docs/wiki/Q-Model-Identity-And-Banner.md)
- secure API and hosting guide: [docs/wiki/Q-API-Hosting.md](docs/wiki/Q-API-Hosting.md)
- gateway architecture: [docs/wiki/Q-Gateway-Architecture.md](docs/wiki/Q-Gateway-Architecture.md)
- gateway-to-substrate seam benchmark: [docs/wiki/Q-Gateway-Substrate.md](docs/wiki/Q-Gateway-Substrate.md)
- live Q API audit loop: [docs/wiki/Q-API-Audit.md](docs/wiki/Q-API-Audit.md)
- release/build identity: [docs/wiki/Release-Surface.md](docs/wiki/Release-Surface.md)
- direct readiness gate: [docs/wiki/Q-Readiness-Gate.md](docs/wiki/Q-Readiness-Gate.md)
- benchmark corpus: [docs/wiki/Q-Benchmark-Corpus.md](docs/wiki/Q-Benchmark-Corpus.md)
- benchmark promotion flow: [docs/wiki/Q-Benchmark-Promotion.md](docs/wiki/Q-Benchmark-Promotion.md)
- hybrid training session surface: [docs/wiki/Q-Hybrid-Training.md](docs/wiki/Q-Hybrid-Training.md)
- HF Jobs training surface: [docs/wiki/HF-Jobs-Training.md](docs/wiki/HF-Jobs-Training.md)
- Colab free training surface: [docs/wiki/Colab-Free-Training.md](docs/wiki/Colab-Free-Training.md)
- Cloudflare Q inference surface: [docs/wiki/Cloudflare-Q-Inference.md](docs/wiki/Cloudflare-Q-Inference.md)
- OCI GPU advisor: [docs/wiki/OCI-GPU-Advisor.md](docs/wiki/OCI-GPU-Advisor.md)
- OCI region capacity probe: [docs/wiki/OCI-Region-Capacity.md](docs/wiki/OCI-Region-Capacity.md)
- model/training manifest: [fixtures/training/q-defsec-curation.example.json](fixtures/training/q-defsec-curation.example.json)
- training bundle: [training/q/README.md](training/q/README.md)
- Immaculate orchestration bundle: [training/immaculate/README.md](training/immaculate/README.md)
- richer coding/long-context supplement: [training/q/coding_long_context_seed.json](training/q/coding_long_context_seed.json)
- long-context LoRA config: [training/q/q_lora_config.long_context.example.json](training/q/q_lora_config.long_context.example.json)
- training lock generator: `npm run q:training:lock`
- hybrid session doctor: `npm run q:training:doctor -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json`
- hybrid session launcher: `npm run q:training:session -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --launch`
- HF Jobs launcher: `npm run q:hf:jobs -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --env-file C:/path/to/cloud.env --check`
- Colab free notebook exporter: `npm run q:colab:export -- --session .training-output/q/sessions/<session-id>/hybrid-session.manifest.json`
- Cloudflare adapter export: `npm run q:cloudflare:adapter -- --check`
- Cloudflare eval bundle: `npm run q:cloudflare:eval-bundle`
- Cloudflare inference controller: `npm run q:cloudflare:inference -- --check`
- Cloudflare worker typecheck: `npm run q:cloudflare:worker:typecheck`
- benchmark promotion command: `npm run q:training:promote-benchmark`
- OCI region capacity probe: `npm run q:oci:capacity -- --oci-bin C:/path/to/oci.exe --config-file .training-output/q/oci-controller/DEFAULT.config --profile DEFAULT --region-key PHX`
- OCI controller launch script: `bash deploy/oci-training/scripts/launch-oci-q-training.sh --session-manifest .training-output/q/sessions/<session-id>/hybrid-session.manifest.json --env-file deploy/oci-training/env/immaculate-q-training.env.example`

As of `2026-04-19`, the direct `Q` structured-contract lane is green on this machine:
`Q` is `4/4` on both
[docs/wiki/Model-Benchmark-Comparison.md](docs/wiki/Model-Benchmark-Comparison.md) and
[docs/wiki/BridgeBench.md](docs/wiki/BridgeBench.md), and the tracked
[docs/wiki/Q-Readiness-Gate.md](docs/wiki/Q-Readiness-Gate.md) is `ready: true`.

## Security Monitoring

- GitHub secret scanning and push protection are enabled on the public repository
- CodeQL and dependency review workflows are configured under `.github/workflows/security.yml`
- `gitleaks` runs in CI for repository secret detection
- Optional GitGuardian scanning is wired in `.github/workflows/gitguardian.yml`
  It activates when the repository secret `GITGUARDIAN_API_KEY` is configured.
- use `npm run github:checks:receipt` to verify the current repo commit through GitHub's raw workflow-run and check-run APIs when classic status contexts are empty

## OCI Private Deployment

The harness now has a minimal OCI-specific private deployment bundle under
`deploy/oci-private/`.

Use it when you need a private-subnet Oracle deployment with:

- no public ingress
- Podman-based container isolation
- API key and federation secrets loaded from root-readable files or OCI Vault
- cloud-init bootstrap plus systemd supervision

Deployment guide:

- [docs/wiki/OCI-Private-Deployment.md](docs/wiki/OCI-Private-Deployment.md)

If you explicitly enable the narrow Q inference edge on that private node, also
use:

- [docs/wiki/Q-API-Hosting.md](docs/wiki/Q-API-Hosting.md)
- [docs/wiki/Q-Gateway-Architecture.md](docs/wiki/Q-Gateway-Architecture.md)

For the cloud Q training lane, use:

- [docs/wiki/OCI-Q-Training.md](docs/wiki/OCI-Q-Training.md)

## Run

```powershell
npm install
npm run dev:harness
npm run dev:tui
npm run dev:dashboard
```

By default the harness binds to `127.0.0.1`. Remote access now requires an explicit `IMMACULATE_HARNESS_HOST` override and should be paired with `IMMACULATE_API_KEY`.

For browser and TUI operator auth:

- Dashboard: `NEXT_PUBLIC_IMMACULATE_API_KEY`
- TUI / harness tooling: `IMMACULATE_API_KEY`

For the narrow Q inference edge:

- enable with `IMMACULATE_Q_API_ENABLED=true`
- manage keys with `npm run q:keys -- create --label <name>`
- inspect the edge with `GET /api/q/info`
- invoke the edge with `POST /api/q/run`
- keep it on the private harness unless you add a separate hardened gateway layer

For the dedicated Q gateway:

- start it with `npm run q:gateway`
- validate it with `npm run q:gateway:validate -- --gateway-url=http://127.0.0.1:8897`
- it serves `GET /health`, `GET /api/q/info`, `GET /v1/models`, and `POST /v1/chat/completions`
- it accepts only Q API keys, not the harness admin key
- the latest loopback validation is green on auth, model listing, served completion, and `429` concurrency rejection
- it fail-closes on repeated primary-model failures instead of masking a broken upstream
- it is designed for private OCI deployment, not public internet exposure by default

## Benchmark

Run and publish the current orchestration benchmark:

```powershell
npm run benchmark -w @immaculate/harness
```

Run the benchmark gate:

```powershell
npm run benchmark:gate
npm run benchmark:gate:all
```

Bootstrap local W&B support into a workspace-local Python environment:

```powershell
npm run wandb:bootstrap
```

Publish the latest benchmark to W&B:

```powershell
npm run benchmark:publish:wandb
```

Run the paced 60-second benchmark lane:

```powershell
npm run benchmark:latency:60s -w @immaculate/harness
```

Run the paced 60-minute soak lane:

```powershell
npm run benchmark:soak:60m -w @immaculate/harness
```

Run the real durability torture lane:

```powershell
npm run benchmark:durability:torture -w @immaculate/harness
```

Run the real external neurodata ingest lane:

```powershell
npm run benchmark:neurodata -w @immaculate/harness
```

Run the honest Temporal comparison lane:

```powershell
npm run benchmark:temporal -w @immaculate/harness
```

Run the live direct Q structured contract benchmark:

```powershell
npm run compare:models
```

Run the live BridgeBench pass:

```powershell
npm run bridgebench
```

Manage Q API keys:

```powershell
npm run q:keys -- list
npm run q:keys -- create --label q-live-verify
```

Run the direct-Q readiness gate:

```powershell
npm run q:release-gate
```

Refresh the tracked internal Q training-diagnostics corpus:

```powershell
npm run q:failure-corpus
```

`Q` is the product name used in the repo.
It is the only model name surfaced in the repo, and it is built on Gemma 4.

Render the yellow/ocean-blue startup banner directly:

```powershell
npm run banner
```

Export the live W&B benchmark results back into the tracked wiki:

```powershell
npm run benchmark:export:wandb
```

Defaults:

- entity: authenticated W&B workspace attached to the API key, unless `WANDB_ENTITY` or `IMMACULATE_WANDB_ENTITY` overrides it
- project: `immaculate`
- mode: `online`

Current benchmark publication surfaces:

- W&B project: https://wandb.ai/arobi-arobi-technology-alliance/immaculate
- tracked repo/wiki status: [docs/wiki/Benchmark-Status.md](docs/wiki/Benchmark-Status.md)
- tracked repo/wiki W&B export: [docs/wiki/Benchmark-Wandb-Export.md](docs/wiki/Benchmark-Wandb-Export.md)
- tracked repo/wiki historical 60s validation regression: [docs/wiki/Live-Validation-2026-04-13.md](docs/wiki/Live-Validation-2026-04-13.md)
- tracked repo/wiki Q structured contract benchmark: [docs/wiki/Model-Benchmark-Comparison.md](docs/wiki/Model-Benchmark-Comparison.md)
- tracked repo/wiki BridgeBench surface: [docs/wiki/BridgeBench.md](docs/wiki/BridgeBench.md)
- tracked repo/wiki Q API and hosting guide: [docs/wiki/Q-API-Hosting.md](docs/wiki/Q-API-Hosting.md)
- tracked repo/wiki Q gateway validation: [docs/wiki/Q-Gateway-Validation.md](docs/wiki/Q-Gateway-Validation.md)
- tracked repo/wiki Q gateway architecture: [docs/wiki/Q-Gateway-Architecture.md](docs/wiki/Q-Gateway-Architecture.md)
- tracked repo/wiki Q readiness gate: [docs/wiki/Q-Readiness-Gate.md](docs/wiki/Q-Readiness-Gate.md)
- tracked repo/wiki Terminal-Bench public-task win: [docs/wiki/Terminal-Bench-Public-Task.md](docs/wiki/Terminal-Bench-Public-Task.md)
- latest run URL for every published pack lives in the tracked wiki status/export pages above

Optional environment variables:

- `WANDB_API_KEY` or `IMMACULATE_WANDB_API_KEY`
- `WANDB_ENTITY` or `IMMACULATE_WANDB_ENTITY`
- `WANDB_PROJECT` or `IMMACULATE_WANDB_PROJECT`
- `WANDB_MODE` or `IMMACULATE_WANDB_MODE`

Published artifacts are written to:

- `benchmarks/latest.json`
- `benchmarks/latest.md`
- `benchmarks/index.json`

The published benchmark now carries explicit authorship and role attribution plus architecture contribution notes.
These raw benchmark publication files are treated as generated artifacts and are produced locally or in CI rather than stored as permanent source files. The tracked public summary lives in `docs/wiki/Benchmark-Status.md`, and the pulled export from live W&B runs lives in `docs/wiki/Benchmark-Wandb-Export.md`.

Tier 1 cognitive-loop closure is also benchmarked in the publication report itself:

- parsed LLM `ROUTE` / `REASON` / `COMMIT` structure
- governance-aware cognition context
- routing soft-prior bias from parsed model output
- multi-role conversation order and guard verdicts

Because these live in the benchmark report, they are carried automatically into W&B publication.

Tier 2 spectral confidence is now benchmarked directly:

- artifact-band detection on `45-65 Hz` contamination windows
- spectral-confidence suppression for artifact-heavy live frames
- backward-compatible amplitude continuity when spectral bands are unavailable
- routing-pressure assertions that prove contaminated windows de-escalate before outward action
- worker-assignment lease coverage that proves remote placement is reserved and duplicate assignment pressure is visible
- locality-aware worker placement coverage that proves same-locality remote workers outrank cross-rack candidates when capability and health are otherwise equal
- explicit session-bound source safety coverage that proves mediated orchestration fails closed on cross-session mismatches

Benchmark packs currently include:

- `substrate-readiness`
- `durability-recovery`
- `latency-soak` (legacy short-run smoke lane, published as `Latency Smoke`)
- `latency-benchmark-60s`
- `latency-soak-60m`
- `durability-torture`
- `neurodata-external`
- `temporal-baseline`

## Current Progress

- canonical phase/pass engine with a real `verify` gate between `commit` and `feedback`
- durable event log, snapshot history, checkpoints, and checkpoint-tail replay
- integrity-aware recovery that rejects invalid lineage before resuming ticks
- BIDS dataset scanning and registration into the live ingest spine
- NWB time-series scanning and neuro-session registration into `synchronize` and `decode`
- replayed NWB frame windows ingested into live `synchronize` and `decode` state
- live socket neuro frames ingested into the same durable `synchronize` and `decode` path
- first local Q cognition backend wired into `route`, `reason`, and `commit`
- W&B benchmark publication backend wired to the existing benchmark artifact ledger
- policy-aware training-data curation with manifest-driven source intake, license gating, secret scanning, dedup, provenance hashes, and JSONL shard export for Q fine-tuning corpora
- keyboard-first TUI and Next.js dashboard over the same live harness
- internal benchmark publication for repeatable functional testing
- benchmark execution offloaded from the live harness event loop into a worker job
- operator auth gate on mutable and remote harness surfaces
- purpose-bound governance enforcement on mutable control, ingest, cognition, live streaming, and benchmark routes
- sensitive snapshot, dataset, and neuro-session reads now default to redacted projections unless an explicit governed detail read is supplied
- decoded neuro frame features, cognitive trace previews, and actuation commands now follow field-level consent instead of leaking through default snapshots
- Tier 2 neural coupling now has benchmark and visibility coverage for band dominance, route phase bias, and coupled routing strength
- Tier 2 routing now prefers the live neuro-coupling lane when decode readiness, transport health, and governance align
- Tier 2 spectral confidence now treats `45-65 Hz` contamination as explicit artifact power, penalizes contaminated live windows, and pushes artifact-heavy frames onto safer routes before dispatch
- governed actuation dispatch and actuation output readback now make the feedback plane an explicit durable surface
- adapter-backed actuation delivery now routes visual, haptic, and stim outputs through channel-specific policy lanes with durable delivery logs
- governed websocket actuation device links now negotiate protocol/capabilities and provide acked bridge delivery with file continuity when no live transport is attached
- concrete UDP/OSC actuation transports can now be registered as durable protocol-aware device endpoints for visual lanes
- supervised serial vendor transports now support heartbeat health, capability health, stale-device isolation, and controlled recovery
- HTTP/2 direct device transports now provide typed RPC-class delivery with response telemetry and durable operator visibility
- transport selection now ranks concrete actuation lanes by health, latency, and capability fitness instead of registry order
- route selection now persists explicit cross-plane decisions that combine transport health, decode confidence, and governance pressure
- mediated orchestration now decides whether to stay reflex-local, escalate cognition, guard-review, or suppress before any outward action is committed
- mediated orchestration now treats current spectral evidence as a control signal: strong clean beta/gamma windows can stay reflex-local, while contaminated windows are pushed into guarded review before outward action
- execution arbitration is now durable and inspectable through a mediated orchestration pass and dedicated arbitration ledger
- execution scheduling is now durable and inspectable, choosing whether cognition runs as a single layer or a swarm formation before any mediated execution commits
- intelligence worker assignment is now an authoritative runtime control instead of a sidecar scorer: cognition reserves a worker lease before it runs and records the chosen worker, profile, host, reason, score, and execution endpoint into the durable execution ledger
- the harness now maintains a governed local node registry and node heartbeat surface so worker placement has an explicit locality/control plane instead of anonymous host labels alone
- remote worker placement now rides an overlooked but real substrate that was already in front of the system: worker records can advertise Q-runtime-compatible execution endpoints, so cognition can be placed onto remote compute without inventing a second orchestration protocol
- locality-aware worker placement now runs inside the live harness: when multiple healthy remote workers can satisfy the same request, the system can prefer the worker in the local control locality before crossing into a different rack/zone
- local swarm execution now treats one host as a pool of leaseable worker slots instead of a single monolithic worker record, so widened cognition can actually reserve parallel local capacity without lying about topology
- authenticated federation now includes signed membership export/import, verified remote node and worker identity, recurring peer refresh, signed lease renewal, and stale-state eviction before dead remotes can stay in placement
- live remote placement now reads peer lease freshness and peer-smoothed latency as first-class worker-plane control signals instead of relying only on imported node metadata
- adaptive federated execution pressure now blends peer-smoothed latency with measured remote execution success/failure, so a degraded peer can lose placement even before membership expires
- signed lease recovery is now adaptive instead of fixed-rate: renewal cadence tightens under failed remote execution or failed lease refresh, then relaxes again after healthy signed renewals
- live mediated swarm execution now spans authenticated peers under real worker leases, so guarded swarm topology can widen across multiple remote nodes instead of only choosing one remote winner
- federated remote execution now performs one bounded same-request alternate-peer retry after a failed remote cognition attempt, keeping the first failure in the durable ledger and linking the retry attempt back to it through explicit repair lineage fields
- federation repair is now an internal signed control path, not a public backdoor: failed peers enter pending/repairing state, fall out of worker eligibility, and only rejoin placement after governed refresh and lease-renew success
- session-bound actuation dispatch and mediated orchestration now fail closed on ambiguous or cross-session source resolution instead of silently falling back to the newest global frame or execution
- benchmark publication now includes Tier 1 cognitive-loop closure coverage for parsed model structure, governance-aware cognition, routing soft priors, and multi-role conversation verdicts
- benchmark history can now be queried through a real `/api/benchmarks/trend` surface that analyzes published run order, flags drift, and stays explicit about what metric it is trending
- dashboard and TUI now expose the latest routing decision so operators can see why the system chose a lane instead of inferring it from side effects
- dashboard and TUI websocket reconnection with backoff
- operator-facing dashboard surfaces for the previously hidden backend control plane

## Remaining Progression

- direct device adapters beyond the first live socket neurophysiology ingress path
- additional vendor-specific transports beyond serial and HTTP/2 direct lanes, including MIDI and richer gRPC-class adapters
- arbitration and scheduling that feed live neural coupling, device health, decode confidence, and governance pressure deeper into multi-agent planning before route/dispatch
- additional multi-agent and tool execution backends beyond the first governed Q runtime layer
- richer worker federation beyond the current authenticated membership, recurring peer refresh, and stale-trust eviction phase
- fuller federated control pressure that can learn from longer execution history and cost envelopes without overfitting to short-term noise
- domain benchmark packs against published neuro/BCI workloads
- real multi-node deployment and cluster-wide locality routing beyond the current single-harness node registry
- richer operator surfaces over published-run trend analysis instead of only the raw API

Benchmark credibility rules now follow a stricter line:

- short-run latency packs are published as smoke, not soak
- wall-clock duration is reported separately from planned control-loop duration
- hardware context is carried into benchmark reports, W&B metadata, and repo-tracked exports
- benchmark publication now runs through CI on every push, while wiki-export commits remain constrained to `main`
- durability torture, external neurodata ingest, and Temporal comparison are published as dedicated credibility lanes instead of being folded into the smoke-pack story

## Operator API

The harness now exposes a deliberate operator/automation surface. These routes are surfaced in the dashboard operator panel or through direct automation:

- `GET /api/governance/status`
- `GET /api/governance/policies`
- `GET /api/governance/decisions`
- `GET /api/federation/membership`
- `GET /api/federation/leases`
- `GET /api/federation/peers`
- `GET /api/nodes`
- `GET /api/topology`
- `GET /api/integrity`
- `GET /api/checkpoints`
- `GET /api/events`
- `GET /api/replay`
- `GET /api/benchmarks/trend`
- `GET /api/benchmarks/packs`
- `GET /api/datasets`
- `GET /api/datasets/:datasetId`
- `GET /api/neuro/sessions`
- `GET /api/neuro/sessions/:sessionId`
- `GET /api/neuro/frames`
- `GET /api/neuro/replays`
- `POST /api/neuro/replays/:replayId/stop`
- `GET /api/neuro/live/sources`
- `POST /api/neuro/live/:sourceId/stop`
- `GET /api/devices/lsl/streams`
- `GET /api/devices/lsl/connections`
- `POST /api/devices/lsl/connect`
- `POST /api/devices/lsl/:sourceId/stop`
- `GET /api/intelligence`
- `GET /api/intelligence/executions`
- `GET /api/intelligence/workers`
- `GET /api/intelligence/arbitrations`
- `GET /api/intelligence/schedules`
- `GET /api/actuation/adapters`
- `GET /api/actuation/protocols`
- `GET /api/actuation/transports`
- `GET /api/actuation/deliveries`
- `GET /api/actuation/outputs`
- `GET /api/intelligence/q/models`
- `POST /api/actuation/dispatch`
- `POST /api/orchestration/mediate`
- `POST /api/actuation/transports/udp/register`
- `POST /api/actuation/transports/serial/register`
- `POST /api/actuation/transports/http2/register`
- `POST /api/actuation/transports/:transportId/heartbeat`
- `POST /api/actuation/transports/:transportId/reset`
- `POST /api/nodes/register`
- `POST /api/nodes/:nodeId/heartbeat`
- `POST /api/federation/peers/register`
- `POST /api/federation/peers/sync`
- `POST /api/federation/peers/:peerId/refresh`
- `POST /api/federation/peers/:peerId/lease-renew`
- `POST /api/intelligence/q/register`
- `POST /api/intelligence/workers/register`
- `POST /api/intelligence/workers/:workerId/heartbeat`
- `POST /api/intelligence/workers/:workerId/unregister`
- `POST /api/intelligence/workers/assign`
- `DELETE /api/nodes/:nodeId`
- `DELETE /api/federation/peers/:peerId`
- `WS /stream/actuation/device`
- `WS /stream/neuro/live`

Mutable routes now require purpose-bound governance metadata in addition to auth:

- `x-immaculate-purpose`
- `x-immaculate-policy-id`
- `x-immaculate-consent-scope`
- `x-immaculate-actor` (optional, for attribution)

Websocket operator paths accept the same governance fields as query params: `purpose`, `policyId`, `consentScope`, and `actor`.

Sensitive read surfaces now split into two modes:

- default operator feeds such as `/api/snapshot`, `/stream`, `/api/datasets`, and `/api/neuro/sessions` return redacted filesystem/source details
- governed detail reads such as `/api/datasets/:datasetId`, `/api/neuro/sessions/:sessionId`, `/api/events`, and `/api/replay` require explicit read-purpose metadata
- governed derived reads such as `/api/neuro/frames`, `/api/intelligence/executions`, `/api/actuation/outputs`, and `/api/actuation/deliveries` apply field-level consent: benchmark scope gets bounded projections, while session/intelligence/actuation scope restores full derived detail
- mediated orchestration at `POST /api/orchestration/mediate` is the first pass that explicitly chooses whether the system should act reflex-locally, escalate into cognition, hold under guard review, or suppress the outward action entirely
- `POST /api/orchestration/mediate` now supports `dispatchOnApproval` so review-only passes can stop at the plan while approval-gated passes can close the loop into a single dispatch call
- review-only mediated passes now emit a durable routing decision as well as a transient route plan, so held actions still leave replayable route lineage
- blocked guard verdicts are now written back into governance memory, so the next mediated pass sees the denial pressure instead of treating the guard as a dead-end oracle
- the core engine now names its stability eigenvalue as `STABILITY_POLE = 0.82`, tracks `predictionError` and `freeEnergyProxy` in live metrics/history, and adapts phase increments over time instead of treating phase timing as fixed forever
- `GET /api/intelligence/arbitrations` exposes the durable arbitration ledger so operators can inspect why a mediated pass chose a given mode
- `GET /api/intelligence/schedules` exposes the durable scheduling ledger so operators can inspect which intelligence formation the mediated pass selected before cognition ran
- `GET /api/federation/peers` exposes the persisted peer registry with separate membership and lease freshness state, smoothed observed latency, and auth-configured state without leaking peer secrets
- `GET /api/federation/leases` plus `POST /api/federation/peers/:peerId/lease-renew` make signed lease renewal a real governed surface instead of a hidden side effect of topology sync
- `POST /api/federation/peers/register`, `POST /api/federation/peers/sync`, and `POST /api/federation/peers/:peerId/refresh` continue to own the slower signed membership control loop
- `GET /api/federation/peers` now also exposes repair state (`idle` / `pending` / `repairing`) and due status so operators can inspect why a remote peer fell out of placement without leaking any shared secret material
- background federation refresh, lease renewal, and internal repair now evict remote node and worker state when trust expires, while worker placement consumes peer lease freshness, peer-smoothed latency, repair state, and remote execution failure pressure directly before selecting a remote endpoint
- there is intentionally no public `/api/federation/repair` endpoint; repair stays inside the existing signed membership and lease-renew control paths so failed peers recover only through the same authenticated surfaces that established trust in the first place
- actuation device transports now open with a protocol-negotiation handshake on `WS /stream/actuation/device`; device clients send `actuation-device-hello` before dispatch starts, then acknowledge deliveries with `actuation-ack`
- UDP/OSC actuation endpoints can be registered through `POST /api/actuation/transports/udp/register`; when present, dispatch prefers that concrete transport before bridge or file continuity
- serial vendor transports can be registered through `POST /api/actuation/transports/serial/register`; they require heartbeats on `POST /api/actuation/transports/:transportId/heartbeat`, isolate on stale liveness, and can be cleared through `POST /api/actuation/transports/:transportId/reset`
- HTTP/2 direct device transports can be registered through `POST /api/actuation/transports/http2/register`; successful responses feed liveness and capability telemetry back into transport health and routing preference
- every governed actuation dispatch now emits a durable routing decision into the snapshot and event spine, including mode, target node, transport rank, governance pressure, and rationale
- every mediated orchestration decision now emits a durable execution arbitration into the snapshot and event spine, including mode, target plane, preferred layer, governance pressure, and rationale
- every mediated cognition path now emits a durable execution schedule into the snapshot and event spine, including schedule mode, selected layer set, primary layer, estimated latency, and rationale
