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
