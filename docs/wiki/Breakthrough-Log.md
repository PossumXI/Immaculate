# Breakthrough Log

This page is reserved for major leaps in Immaculate:

- a new architectural capability that materially changes the system
- a hard reliability or governance boundary crossed
- a meaningful benchmark or latency breakthrough
- a real scientific or engineering insight that was present in the system space but widely missed

## Entry Format

For each breakthrough, record:

1. Date
2. What changed
3. Why it matters
4. Evidence
5. What this unlocks next

## Current Entries

### 2026-04-12

#### Hour-class soak became real, and the persistence substrate stopped collapsing under its own event ledger

What changed:
- Immaculate now has a real wall-clock paced `latency-soak-60m` pack that ran for one full hour with sustained measured event throughput above 1,000 events per second instead of borrowing the word "soak" for a sub-second smoke lane
- the persistence layer now compacts event and history ledgers against the latest checkpoint, retains semantically important decision events across compaction, and widens the hot recoverability window so high-throughput runs do not silently lose pre-persist lineage
- the W&B publication path now avoids a fragile viewer probe and has enough timeout budget to publish hour-class benchmark artifacts instead of failing at the final upload edge

Why it matters:
- this is the point where the benchmark story stops being aspirational and becomes defensible under a serious review standard: the system now has a real one-hour soak with calibrated wall-clock timing, real hardware context, real recovery, and public publication
- the missed systems pattern was straightforward but important: long-run orchestration credibility is controlled less by the scheduler than by whether the persistence substrate can survive its own event pressure without turning recovery into a multi-gigabyte replay failure
- compacting only the noisy high-volume lineage while preserving semantic control events keeps the audit surface meaningful instead of forcing a false choice between total retention and hour-class execution

Evidence:
- `latency-soak-60m` suite `immaculate-benchmark-2026-04-12T21-48-36-880Z` completed in `3600967.49 ms` with `failedAssertions=0`, `integrity=verified`, and `recoveryMode=checkpoint`
- measured event throughput was `1270.78 events/s` on `knightly / Windows 11 Pro / AMD Ryzen 7 7735HS / 16 cores / 23.29 GiB RAM / SSD / Node v22.13.1`
- the published W&B soak run is `https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/bxncy45c`
- the soak report now publishes `P50/P95/P99/P99.9` latency series plus hardware context through the same repo/wiki export surface as the shorter benchmark lanes

What this unlocks next:
- real durability torture packs and real neurodata ingest packs that can run long enough to matter without the persistence layer becoming the bottleneck
- meaningful trend analysis over long-run behavior instead of only smoke-lane snapshots
- future node-federated and hardware-backed orchestration where long-running ledgers remain both recoverable and auditable

#### Parallel swarm execution stopped dead-ending on a single local worker lease

What changed:
- the local execution plane no longer models one host as one leaseable worker record; it can now materialize a bounded pool of local worker slots on the same Ollama endpoint
- parallel swarm reservation now cleans up partially reserved leases if a later reservation fails, instead of stranding earlier leases until TTL expiry
- benchmark coverage now proves that three distinct local slot leases can be reserved on one host, and live guarded-swarm smoke now proves the non-guard turns actually launch under one parallel batch instead of failing on the second reservation

Why it matters:
- this closes the gap between a truthful parallel schedule in the ledger and a runtime that could only ever lease one local worker at a time
- the missed systems pattern was simple but important: local parallelism is still a worker-placement problem, but the worker record has to represent concurrency slots, not the whole host as a single indivisible lease
- without this, every local swarm formation was one reservation away from collapsing back into sequential reality

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the worker-slot pass on `2026-04-12T18:45:42.571Z` with `runCount=3` and `violationCount=0`
- live harness smoke on `127.0.0.1:8862` completed a guarded swarm with `executionTopology=parallel-then-guard`, `parallelWidth=3`, `roles=mid>soul>reasoner>guard`, and one shared `parallelBatchId`
- the three non-guard turns launched within `69.0 ms` of each other before guard review, which is the concrete runtime signal that the widened cognition path is parallel instead of merely labeled as such

What this unlocks next:
- truthful local-versus-remote placement policies that can choose between slot pools on one host and remote worker endpoints using the same lease substrate
- batch-level fault isolation and throughput tuning for wider swarms without rewriting the cognitive scheduler again
- real comparative orchestration baselines where parallel topology is no longer invalidated by a single local worker bottleneck

#### Benchmark truth stopped hiding behind synthetic durations and vague soak language

What changed:
- benchmark reports now carry explicit `runKind`, structured hardware context, planned duration, and measured wall-clock duration instead of only a free-text summary
- benchmark series now publish `P50`, `P95`, `P99`, and `P99.9`, and the report now exposes a real measured `event_throughput_events_s` series based on wall-clock runtime instead of only the internal throughput heuristic
- the short `latency-soak` pack is now published as `Latency Smoke` until a real 60-minute-plus soak lane exists
- W&B publication and export now carry the same benchmark truth surface as the local report: run kind, planned duration, wall-clock duration, and hardware context
- CI benchmark publication is now wired on every `main` push so W&B and the repo-tracked benchmark wiki surfaces stop depending on manual publication alone

Why it matters:
- this closes the benchmark honesty gap between what the system intended to run and what it actually measured on hardware
- it also removes one of the fastest ways to lose credibility with serious reviewers: calling a sub-second run a soak and publishing uncalibrated numbers without machine context
- the missed systems point is that benchmark trust is an architectural feature, not a marketing layer; if duration, hardware, and throughput are not first-class data, the whole trend line is suspect

Evidence:
- the latest benchmark gate passed with three runs and zero violations on `2026-04-12T18:31:02.112Z`
- the latest published smoke runs are now exported with explicit hardware context and wall-clock duration in `docs/wiki/Benchmark-Status.md` and `docs/wiki/Benchmark-Wandb-Export.md`
- the latest latency publication now shows `runKind=smoke`, `plannedDurationMs=12800`, `totalDurationMs=870.35`, and a measured event throughput series instead of an implied soak label

What this unlocks next:
- real 60-minute-plus soak lanes that can reuse the same truthful report contract without changing the publication surface again
- durability torture, neurodata ingest, and baseline comparison packs that publish under the same calibrated benchmark schema
- benchmark trend analysis that can reason over honest wall-clock results instead of mixing planned control-loop time with measured runtime

#### Worker placement became authoritative and session safety stopped trusting global defaults

What changed:
- cognition execution now reserves a concrete intelligence worker before it runs instead of only scoring workers as an advisory side channel
- worker reservations are lease-backed and visible in the registry, so duplicate assignment pressure is explicit and the same worker cannot be handed out twice concurrently
- cognitive executions now persist placement metadata including `sessionId`, worker id/label/host, execution profile, placement reason, score, and the concrete execution endpoint
- remote worker placement now uses a real but previously overlooked substrate: a worker can advertise an Ollama-compatible endpoint, and the runtime can place cognition there directly without inventing a separate remote orchestration RPC
- actuation dispatch and mediated orchestration no longer fall back to the newest global execution or frame when the caller omits sources; they now require explicit session binding or fail closed on mismatch

Why it matters:
- this closes the gap between “the scheduler said it used a worker” and “the durable system can prove where cognition actually ran”
- it also removes a subtle but dangerous safety failure mode where a session-scoped request could accidentally inherit the latest global execution context from a different session
- the hidden systems insight is that truthful scale-out does not start with a fancy distributed control bus; it starts with making placement, lease ownership, and source binding real in the execution ledger

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed after the worker-authority pass
- benchmark coverage now proves worker lease selection, duplicate assignment pressure, and session-bound source safety
- live harness smoke on `127.0.0.1:8854` showed a `remote_required` cognitive pass running with `assignedWorkerId=smoke-remote-worker`, `assignedWorkerProfile=remote`, and `executionEndpoint=http://127.0.0.1:11434`
- the same live drill showed session-bound mediation accepted for `session:smoke-a` and rejected the same source under `session:smoke-b` with `409 source_session_mismatch`

What this unlocks next:
- locality-aware placement that uses real worker endpoint health, observed latency, and cost as first-class scheduling signals
- multi-node orchestration that can widen a swarm across remote compute honestly instead of labeling every formation as local
- future worker federation where the current lease and placement substrate can become the control surface for broader backend diversity

#### Swarm scheduling became truthful and external LSL ingress became real

What changed:
- cognition schedules that widen into a swarm now execute non-guard layers in parallel at runtime instead of being labeled as a swarm while actually running as a sequential chain
- guarded swarms now close with a final review turn after the parallel cohort finishes, which makes the durable schedule topology match the real execution topology
- a real LSL bridge manager and Python inlet helpers now let external Lab Streaming Layer sources flow into the same live neuro spine as replayed and socket-fed frames
- the live harness exposes LSL discovery, connection, and stop routes so external neuro streams no longer depend on synthetic frame injection

Why it matters:
- this closes a core truthfulness gap in the intelligence plane: the schedule ledger now describes what the runtime really did instead of an idealized topology label
- it also crosses the next neuro-ingress boundary from simulated socket injection to a real external stream protocol used by EEG and BCI tooling
- the hidden systems point is that honest topology matters more than impressive labels, because replay, latency accounting, and future distributed scheduling all depend on the runtime matching the durable plan

Evidence:
- live mediation smoke showed `nonGuardStartSpreadMs: 0.0`, proving the non-guard cognition cohort started concurrently rather than serially
- direct LSL discovery, bridge, and manager smokes succeeded against a temporary live outlet and produced a real ingested neuro frame with derived band state
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the truthful-swarm and LSL ingress pass

What this unlocks next:
- heterogeneous swarm execution where different backends can participate in the same parallel formation honestly
- external device ingress paths that do not rely on synthetic harness-only injection
- future locality-aware worker routing where truthful concurrency and real neuro ingress become schedulable resources

#### Public benchmark publication became a tracked artifact instead of an external side effect

What changed:
- W&B publication now writes ownership, role, website, and artifact identity into the live run summary and artifact metadata instead of burying them only in run config
- the publisher now refreshes a tracked benchmark status surface in `docs/wiki/Benchmark-Status.md` and `docs/wiki/Benchmark-Status.json`
- the public repo now points directly at the live W&B project under `PossumX/immaculate` and keeps the generated runtime ledgers out of git

Why it matters:
- this closes the public truth gap: benchmark publication is now visible in three places at once, the live W&B run, the public repo, and the wiki source
- the project can now publish results publicly without leaking private runtime ledgers or pretending that CI artifacts are the same thing as public benchmark memory

Evidence:
- the benchmark publisher now emits project/run URLs and refreshes the tracked repo/wiki benchmark status page
- the README and wiki home now point directly at the live public W&B surface

What this unlocks next:
- repeatable public benchmark history by pack without turning the private runtime ledger into committed source
- clearer operator and community visibility into what has actually been validated recently
- richer future benchmark trend pages that can stay public without exposing internal run-state noise

#### W&B benchmark results now get pulled back into git wiki as an export surface

What changed:
- the repo now has a W&B export path that reads the live published benchmark runs back from W&B and writes a committed wiki export
- `docs/wiki/Benchmark-Wandb-Export.md` and `docs/wiki/Benchmark-Wandb-Export.json` now record run IDs, run URLs, states, summary fields, and benchmark-report artifact identity pulled from W&B itself
- this gives Immaculate a git-tracked benchmark memory even when the W&B workspace visibility is not fully public

Why it matters:
- this closes the last visibility gap between published experiment tracking and repo-held benchmark memory
- the project no longer depends on W&B privacy settings alone for community-visible benchmark results

Evidence:
- the export is generated from the live W&B runs rather than from the local benchmark runtime ledger
- the new wiki export page sits alongside the benchmark status page as a committed source artifact

What this unlocks next:
- periodic W&B export refreshes without exposing raw local benchmark ledgers
- benchmark diffs in git history that reflect what W&B actually stored, not just what the local publisher intended to send

#### The controller stopped pretending its timing math was static

What changed:
- the core engine now exports `STABILITY_POLE = 0.82` and uses it as an explicit stability threshold instead of scattering the same value through hidden control heuristics
- `predictionError` and `freeEnergyProxy` are now first-class live metrics and history fields, so the engine can expose latency surprise and model-fit pressure rather than only raw throughput/coherence
- adaptive phase increments are now persisted in durable state, which means the controller can carry a learned timing profile across recovery instead of rebooting into a permanently fixed phase table
- review-only mediated passes now emit a durable routing decision before dispatch, so the route ledger records held intent and not just delivered action

Why it matters:
- this is the point where Immaculate stops being only a governed heuristic controller and starts becoming an explicit adaptive control system
- a system that can hold action but still record the chosen route is more truthful, more replayable, and easier to improve than one that only becomes durable after outward dispatch
- the hidden systems insight is that orchestration quality depends as much on measured surprise and settling behavior as it does on raw latency

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the control-formalization pass
- the benchmark now asserts the throughput floor, the stability-pole coherence threshold, and bounded prediction error
- mediated review-only runs now persist a routing decision in the same durable ledger used by dispatched routes

What this unlocks next:
- explicit active-inference style optimization over the verify → optimize seam
- trend analysis over prediction error and free-energy proxy instead of only latency/coherence
- truthful future swarm orchestration where planned but suppressed actions still contribute to learned routing and safety memory

#### Spectral evidence now shapes mediation before outward action

What changed:
- execution arbitration now treats current-frame spectral evidence as a real control input instead of relying only on scalar decode confidence
- strong clean beta/gamma windows can keep the mediated decision path reflex-local, while contaminated spectral windows are forced into guarded review before outward action
- execution scheduling now widens contaminated review paths into guarded internal formations instead of silently preserving a narrow cognition lane
- the benchmark now proves spectral reflex arbitration, spectral guarded review, and guarded spectral scheduling in addition to the earlier route-pressure coverage

Why it matters:
- this closes the next hidden systems gap: a controller that reacts to contamination only at the routing layer is still too late, because cognition and actuation planning have already been shaped by bad input
- Immaculate now uses spectral evidence to decide whether it should think, widen, hold, or act before route selection commits to an outward lane
- the mediation layer is now beginning to behave like a real control surface for intelligence rather than a thin wrapper around model execution

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the mediation-coupling pass
- the benchmark gate now proves spectral arbitration and guarded spectral scheduling with zero violations on the latest all-pack run
- routing regressions introduced by stale prior coupling were fixed by making current-frame spectral evidence dominate when present

What this unlocks next:
- schedule-aware multi-agent mediation that can react to richer neural or decoder-side priors before cognition runs
- future confidence models that combine spectral quality, artifact suppression, and decoder reliability without trusting stale state
- domain benchmark packs where real neuro streams can prove not just route quality, but mediation quality under contamination and uncertainty

#### Spectral confidence became a real control signal instead of a decorative neuro metric

What changed:
- live neuro ingest now computes confidence from band structure when band power is available, with explicit `45-65 Hz` artifact detection and a clean fallback to the legacy amplitude path when spectral bands are unavailable
- contamination is now represented directly in the core neuro schema and neural-coupling state through artifact power, total power, and artifact ratio
- routing now reads spectral pressure directly from the incoming frame or the persisted coupling state, so contaminated windows de-escalate before outward action instead of merely being tagged after the fact
- the benchmark now proves three cases: backward-compatible amplitude fallback, artifact-window suppression, and spectral routing pressure that pushes contaminated windows onto safer lanes

Why it matters:
- this closes a hidden but serious systems bug: a neuro-orchestration controller that rewards amplitude before it recognizes contamination can treat noise as agency
- the system now uses spectral quality as a control input, not just as operator-visible telemetry
- it is the first pass where neuro contamination changes outward route choice before dispatch

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed after the spectral pass
- the benchmark gate now includes artifact suppression and spectral route-pressure assertions
- live harness smoke on an isolated runtime showed a `60 Hz` artifact window ingest at `decodeConfidence: 0` and dispatch through `guarded-fallback / visual / file`
- W&B offline publication captured the new benchmark surface in `wandb/offline-run-20260412_084945-s0i1clym/files`

What this unlocks next:
- arbitration and scheduling that react to neural coupling before route/dispatch
- better BCI-quality gating where contamination can suppress or defer cognition/actuation earlier in the control loop
- richer spectral models that separate neural rhythm quality from environmental artifact without weakening the governed harness

### 2026-04-12

#### Mediation now closes the loop with approval-gated dispatch

What changed:
- `POST /api/orchestration/mediate` now supports `dispatchOnApproval`, so the same call can return a plan only or complete dispatch when approval allows it
- blocked guard verdicts are written back into governance memory, so the next mediated pass sees the denial pressure
- the benchmark now covers both review-only mediation and single-call mediate-and-dispatch completion

Why it matters:
- this turns the guard from a passive report into a real control signal that changes subsequent governance pressure
- it closes the last gap between mediated decisioning and outward action when the operator explicitly allows dispatch

Evidence:
- benchmark coverage now asserts plan-only mediation, approval-gated dispatch, and guard-verdict governance memory
- the live harness route was updated to return plan-only results unless `dispatchOnApproval` is true

What this unlocks next:
- tighter session-scoped mediation policies
- better operator control over when Immaculate should think versus act
- richer single-call orchestration flows that remain governed end to end

### 2026-04-12

#### Tier 2 routing now follows bounded neural coupling

What changed:
- Tier 2 benchmark coverage now proves band dominance, phase bias, and coupled routing strength
- redacted projections still hide `bandPower` and `neuralCoupling`, while benchmark/session/audit scopes expose the right bounded values
- route selection now prefers the live neuro-coupling lane when decode readiness, transport health, and governance align

Why it matters:
- this is the first time the system can benchmark the coupling signal and use it as an actual routing influence without leaking raw neuro detail
- it closes the loop between neuro visibility, routing, and transport health in a measurable way

Evidence:
- `npm run benchmark:gate:all` passed after the Tier 2 pass
- benchmark series now track band dominance, route phase bias, and coupled routing
- benchmark and dashboard projections preserve the right bounded neuro coupling state

What this unlocks next:
- more selective coupling-aware route experiments
- stronger future policy feedback from live neuro state into orchestration
- richer benchmark packs for neuro-driven route choice and transport selection

### 2026-04-12

#### Tier 2 neural coupling became visible and measurable

What changed:
- redacted projections now hide both `bandPower` and `neuralCoupling`
- benchmark and audit scopes now preserve bounded neuro-band and coupling views
- the benchmark now generates long enough synthetic neuro windows to prove alpha, beta, and gamma band dominance plus route-phase bias
- the Tier 2 benchmark now tracks coupled routing strength as a first-class series

Why it matters:
- this closes the next real visibility gap in the neuro layer: the system can now distinguish raw neural detail from bounded operator-visible coupling signals
- route bias is now measurable against the band-dominance signal that feeds it

Evidence:
- benchmark gate remains green after the Tier 2 additions
- redacted snapshot reads hide coupling state and band power by default
- benchmark and audit projections now expose the correct bounded/full coupling views

What this unlocks next:
- stronger coupling-aware route selection experiments
- better neuro/cognition correlation studies without leaking raw signal detail
- more realistic future routing policy that can be benchmarked against band dominance and phase bias

### 2026-04-12

#### The schedule became the source of truth for multi-role cognition

What changed:
- the operator-override scheduler now records the full four-role formation (`mid>soul>reasoner>guard`) instead of a truncated subset
- the live conversation executor now follows the durable `schedule.layerIds` exactly, rather than widening the run opportunistically at execution time
- structured cognition parsing now accepts both line-separated and compact inline `ROUTE / REASON / COMMIT / VERDICT` formats
- the new cognitive-loop benchmark series now participate in historical comparison and W&B publication instead of being visible-only side data

Why it matters:
- this closes a subtle but serious systems gap: before this fix, the runtime conversation could outrun the schedule ledger and break replay authority
- the scheduler is now a real contract, not just a hint
- the parser is now resilient to a class of compact model outputs that would otherwise silently erase the structured control seam

Evidence:
- live governed mediation now returns a `guarded-swarm` schedule with `layerRoles = mid>soul>reasoner>guard` and a matching four-turn persisted conversation
- `npm run benchmark:gate:all` passed again with zero violations after the schedule-authority and parser-hardening fixes
- the benchmark publication now carries the Tier 1 cognitive-loop series into comparison deltas, not just the raw report payload

What this unlocks next:
- genuine schedule-aware heterogeneous execution, because the scheduler can now be trusted as the authoritative topology record
- stronger replay, audit, and future locality routing, because runtime cognition no longer diverges from the durable plan
- more aggressive structured-cognition experiments without brittle parser failure on compact model outputs

### 2026-04-12

#### The benchmark now exposes the cognitive loop as a first-class artifact

What changed:
- the benchmark publication now records parsed `ROUTE` / `REASON` / `COMMIT` structure from the cognition trace
- governance-aware cognition context is benchmarked explicitly instead of being an implicit assumption
- routing soft-prior bias is measured as a separate benchmark signal
- multi-role conversation order and guard verdicts are now part of the benchmark report and W&B payload

Why it matters:
- this makes the missing cognitive seam measurable before the runtime executor is widened further
- the project can now publish, inspect, and trend the shape of cognition, not just its downstream dispatch effects
- the benchmark report now reflects the real control problem: parse the model, inject governance, bias routing softly, and resolve the conversation with an explicit verdict

Evidence:
- `apps/harness/src/benchmark.ts` now emits dedicated assertions and series for parsed LLM structure, governance-aware cognition, routing soft priors, and multi-role conversation coverage
- the benchmark markdown and W&B publication automatically carry those new series and assertions

What this unlocks next:
- runtime prompt parsing and structured cognitive traces in the core execution path
- multi-role cognition executors that can carry the conversation ledger beyond a benchmark-local artifact
- tighter feedback between parsed model suggestions and future route selection

### 2026-04-12

#### Mediated orchestration learns to choose an intelligence formation

What changed:
- Immaculate now records a durable execution schedule between execution arbitration and cognition execution
- the system can now choose whether cognition should run as `single-layer`, `swarm-sequential`, `guarded-swarm`, `reflex-bypass`, or `held`
- `POST /api/orchestration/mediate` now emits both an arbitration decision and a scheduling decision before cognition runs
- `GET /api/intelligence/schedules` exposes that scheduling ledger to operators
- the benchmark now proves schedule width, swarm share, guarded scheduling, and schedule-ledger durability

Why it matters:
- this is the missing control seam between “decide whether to think” and “run one model”
- the system no longer treats cognition as a monolith; it can select a formation
- that is the first real step from a single-agent harness toward a programmable intelligence topology

Evidence:
- benchmark gate passed with zero violations after adding execution scheduling
- live mediation smoke formed a three-layer cognition schedule (`mid>reasoner>soul`) before dispatch
- the dashboard and TUI now surface `snapshot.executionSchedules[0]`

What this unlocks next:
- schedule-aware multi-agent execution across heterogeneous backends instead of a single Ollama family
- schedule pressure feeding back into route, reason, and future locality-aware orchestration
- richer experiments where cognition width becomes a controlled systems variable instead of an accident of implementation

### 2026-04-12

#### Mediated orchestration becomes a first-class decision pass

What changed:
- Immaculate now has a mediated orchestration endpoint at `POST /api/orchestration/mediate`
- the system can now choose between `reflex-local`, `cognitive-escalation`, `guarded-review`, `suppressed`, and `operator-override` before it commits to outward action
- the arbitration decision is durable and queryable through `GET /api/intelligence/arbitrations`
- the mediated pass is benchmarked alongside the rest of the control plane, so the decision path is no longer implicit or ad hoc

Why it matters:
- this is a material leap from "dispatch something" to "decide whether to think, defer, or suppress before dispatching"
- the system now exposes an explicit mediation layer between perception, cognition, governance pressure, and actuation
- that mediation layer is the right shape for a control system that is meant to scale across agents, transports, and future human-in-the-loop pathways

Evidence:
- benchmark gate passed with zero violations after adding execution arbitration
- live mediation smoke returned `cognitive-escalation`, ran cognition, and then produced a guarded fallback route decision
- `GET /api/intelligence/arbitrations` exposes the durable arbitration ledger

What this unlocks next:
- routing pressure can be fed into multi-agent planning rather than only into the actuation lane
- future reasoning passes can choose between local reflex, agentic escalation, and suppressed action using the same durable mediation record
- more precise operator control over when Immaculate should act immediately versus when it should think first

### 2026-04-12

#### Public launch and live security pipeline stabilization

What changed:
- Immaculate was published as a public repository under Apache 2.0
- CI and Security workflows were repaired against clean GitHub runners
- CodeQL, gitleaks, GitHub secret scanning, push protection, and Dependabot security updates were brought into the live repo posture
- optional GitGuardian workflow wiring was added for external secret-monitoring expansion

Why it matters:
- this moved Immaculate from a local-only build into a governed public engineering program
- the project can now accept community contribution without sacrificing baseline security and benchmark discipline

Evidence:
- `PossumXI/Immaculate` is live publicly on GitHub
- CI passed on push
- Security passed on push
- GitGuardian workflow is present and green in its current unconfigured state

What this unlocks next:
- community-driven transport, orchestration, and neurodata improvements
- public benchmark trending and reproducible collaboration
- stricter branch protection and release discipline once the contribution flow grows

### 2026-04-12

#### Breakthroughs become first-class project artifacts

What changed:
- major engineering leaps and hidden-but-real system findings now have a dedicated standing record in the wiki source
- contribution rules now require updating the breakthrough log when a change materially moves the system
- engineering doctrine now explicitly prioritizes discovering leverage in control, timing, routing, replayability, and governance

Why it matters:
- important discoveries stop getting buried in commits, chat history, or scattered notes
- the project gains a durable memory for the exact moments where capability or understanding changed

Evidence:
- `docs/wiki/Breakthrough-Log.md` exists as a maintained milestone ledger
- `docs/wiki/Engineering-Doctrine.md` defines what counts as a real leap
- `CONTRIBUTING.md` requires contributors to update the breakthrough record when warranted

What this unlocks next:
- cleaner historical context for major architectural decisions
- faster onboarding for contributors who need the real inflection points, not just the file diff

### 2026-04-12

#### Route choice becomes a first-class orchestration object

What changed:
- Immaculate now records durable routing decisions in the shared snapshot and event spine instead of leaving route choice implicit inside the actuation path
- route selection now combines transport health, transport rank, decode confidence, cognitive state, and governance pressure into an explicit decision record
- the benchmark now proves two route modes: reflex-direct over the healthiest haptic lane and guarded-fallback over the visual safety lane under critical governance pressure
- the dashboard and TUI now surface the latest route decision directly so operators can inspect the system's current choice without reverse-engineering it from downstream effects

Why it matters:
- this crosses a real systems boundary: orchestration is no longer only about whether delivery succeeded, but why a lane was selected in the first place
- route reasoning becomes replayable, inspectable, and benchmarkable, which is necessary if Immaculate is going to evolve from a transport controller into a control system for intelligence itself

Evidence:
- benchmark gate passed with zero violations after adding routing-decision persistence and assertions
- the benchmark now proves reflex-direct HTTP/2 haptic routing when governance is clear and guarded-fallback UDP/OSC visual routing when governance pressure is critical
- live operator surfaces now expose `snapshot.routingDecisions[0]`

What this unlocks next:
- routing that feeds device health and governance pressure back into higher-level agent planning
- richer policy-aware outward actuation control instead of transport-only selection
- future multi-node orchestration where route choice is treated as a durable control-plane primitive

### 2026-04-12

#### Direct device routing stops being order-based and starts being health-based

What changed:
- Immaculate gained a supervised HTTP/2 direct device transport alongside UDP/OSC and serial lanes
- successful HTTP/2 device responses now feed liveness, capability coverage, firmware identity, and latency back into transport state
- actuation selection now ranks concrete transports by health, latency, capability fitness, and vendor/device readiness instead of registry insertion order

Why it matters:
- this turns actuation from a static handoff table into a real routing problem with measurable preference
- the system can now choose the best concrete lane for a command based on the actual state of the device path, not just the fact that the path exists

Evidence:
- benchmark gate passed with zero violations after adding the new transport class
- the benchmark now proves HTTP/2 direct delivery and preference over other healthy haptic transports
- the operator transport surface now exposes preference rank and score

What this unlocks next:
- richer RPC-class device adapters beyond the first HTTP/2 lane
- routing that can incorporate device health as a first-class orchestration signal
- future actuator swarms where direct hardware lanes compete on real measured fitness instead of static priority
