# Immaculate

Gaetano Comparcola is the program owner, systems architect, and engineering lead for Immaculate. `PossumX.dev` is the personal/professional bio site attached to the published benchmark/report attribution. The build is being shaped around a control-system-first doctrine: durability, replayability, observability, benchmark publication, and operator control before broader scale-out.

This repository is prepared for public collaboration under the Apache 2.0 license. Community contributions are welcome, but the project keeps a hard line on governance, reproducibility, and security.

Immaculate is a greenfield orchestration substrate for:

- phased intelligence execution across reflex, cognitive, and offline planes
- a synthetic connectome graph with live propagation
- a realtime harness service
- a full-screen TUI control surface
- a Next.js overwatch dashboard with 3D movement telemetry
- BIDS and NWB ingest into the durable orchestration spine
- replayed NWB sample windows flowing through synchronize/decode
- live socket neuro frame ingress into synchronize/decode
- a first live local cognition layer through Ollama/Gemma
- W&B benchmark publication and experiment tracking

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

## Security Monitoring

- GitHub secret scanning and push protection are enabled on the public repository
- CodeQL and dependency review workflows are configured under `.github/workflows/security.yml`
- `gitleaks` runs in CI for repository secret detection
- Optional GitGuardian scanning is wired in `.github/workflows/gitguardian.yml`
  It activates when the repository secret `GITGUARDIAN_API_KEY` is configured.

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

Defaults:

- entity: `arobi-arobi-technology-alliance`
- project: `immaculate`
- mode: `online`

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
These benchmark publication files are treated as generated artifacts and are produced locally or in CI rather than stored as permanent source files.

Benchmark packs currently include:

- `substrate-readiness`
- `durability-recovery`
- `latency-soak`

## Current Progress

- canonical phase/pass engine with a real `verify` gate between `commit` and `feedback`
- durable event log, snapshot history, checkpoints, and checkpoint-tail replay
- integrity-aware recovery that rejects invalid lineage before resuming ticks
- BIDS dataset scanning and registration into the live ingest spine
- NWB time-series scanning and neuro-session registration into `synchronize` and `decode`
- replayed NWB frame windows ingested into live `synchronize` and `decode` state
- live socket neuro frames ingested into the same durable `synchronize` and `decode` path
- first local Ollama/Gemma cognition backend wired into `route`, `reason`, and `commit`
- W&B benchmark publication backend wired to the existing benchmark artifact ledger
- keyboard-first TUI and Next.js dashboard over the same live harness
- internal benchmark publication for repeatable functional testing
- benchmark execution offloaded from the live harness event loop into a worker job
- operator auth gate on mutable and remote harness surfaces
- purpose-bound governance enforcement on mutable control, ingest, cognition, live streaming, and benchmark routes
- sensitive snapshot, dataset, and neuro-session reads now default to redacted projections unless an explicit governed detail read is supplied
- decoded neuro frame features, cognitive trace previews, and actuation commands now follow field-level consent instead of leaking through default snapshots
- governed actuation dispatch and actuation output readback now make the feedback plane an explicit durable surface
- adapter-backed actuation delivery now routes visual, haptic, and stim outputs through channel-specific policy lanes with durable delivery logs
- governed websocket actuation device links now negotiate protocol/capabilities and provide acked bridge delivery with file fallback when no live transport is attached
- concrete UDP/OSC actuation transports can now be registered as durable protocol-aware device endpoints for visual lanes
- supervised serial vendor transports now support heartbeat health, capability health, stale-device isolation, and controlled recovery
- HTTP/2 direct device transports now provide typed RPC-class delivery with response telemetry and durable operator visibility
- transport selection now ranks concrete actuation lanes by health, latency, and capability fitness instead of registry order
- route selection now persists explicit cross-plane decisions that combine transport health, decode confidence, and governance pressure
- mediated orchestration now decides whether to stay reflex-local, escalate cognition, guard-review, or suppress before any outward action is committed
- execution arbitration is now durable and inspectable through a mediated orchestration pass and dedicated arbitration ledger
- dashboard and TUI now expose the latest routing decision so operators can see why the system chose a lane instead of inferring it from side effects
- dashboard and TUI websocket reconnection with backoff
- operator-facing dashboard surfaces for the previously hidden backend control plane

## Remaining Progression

- direct device adapters beyond the first live socket neurophysiology ingress path
- additional vendor-specific transports beyond serial and HTTP/2 direct lanes, including MIDI and richer gRPC-class adapters
- routing that feeds live device health, decode confidence, and governance pressure deeper into multi-agent planning and future actuation policy
- additional multi-agent and tool execution backends beyond the first Ollama layer
- domain benchmark packs against published neuro/BCI workloads
- multi-node deployment, locality routing, and long-horizon benchmark trending

## Operator API

The harness now exposes a deliberate operator/automation surface. These routes are surfaced in the dashboard operator panel or through direct automation:

- `GET /api/governance/status`
- `GET /api/governance/policies`
- `GET /api/governance/decisions`
- `GET /api/topology`
- `GET /api/integrity`
- `GET /api/checkpoints`
- `GET /api/events`
- `GET /api/replay`
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
- `GET /api/intelligence`
- `GET /api/intelligence/executions`
- `GET /api/intelligence/arbitrations`
- `GET /api/actuation/adapters`
- `GET /api/actuation/protocols`
- `GET /api/actuation/transports`
- `GET /api/actuation/deliveries`
- `GET /api/actuation/outputs`
- `GET /api/intelligence/ollama/models`
- `POST /api/actuation/dispatch`
- `POST /api/orchestration/mediate`
- `POST /api/actuation/transports/udp/register`
- `POST /api/actuation/transports/serial/register`
- `POST /api/actuation/transports/http2/register`
- `POST /api/actuation/transports/:transportId/heartbeat`
- `POST /api/actuation/transports/:transportId/reset`
- `POST /api/intelligence/ollama/register`
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
- `GET /api/intelligence/arbitrations` exposes the durable arbitration ledger so operators can inspect why a mediated pass chose a given mode
- actuation device transports now open with a protocol-negotiation handshake on `WS /stream/actuation/device`; device clients send `actuation-device-hello` before dispatch starts, then acknowledge deliveries with `actuation-ack`
- UDP/OSC actuation endpoints can be registered through `POST /api/actuation/transports/udp/register`; when present, dispatch prefers that concrete transport before bridge or file fallback
- serial vendor transports can be registered through `POST /api/actuation/transports/serial/register`; they require heartbeats on `POST /api/actuation/transports/:transportId/heartbeat`, isolate on stale liveness, and can be cleared through `POST /api/actuation/transports/:transportId/reset`
- HTTP/2 direct device transports can be registered through `POST /api/actuation/transports/http2/register`; successful responses feed liveness and capability telemetry back into transport health and routing preference
- every governed actuation dispatch now emits a durable routing decision into the snapshot and event spine, including mode, target node, transport rank, governance pressure, and rationale
- every mediated orchestration decision now emits a durable execution arbitration into the snapshot and event spine, including mode, target plane, preferred layer, governance pressure, and rationale
