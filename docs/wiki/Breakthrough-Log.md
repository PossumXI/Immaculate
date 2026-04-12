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
