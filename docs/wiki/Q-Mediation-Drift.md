# Q Mediation Drift

This page is generated from the dedicated `q-mediation-drift` benchmark pack. It measures whether Immaculate preserves Q's governed route through arbitration, scheduling, and routing under mixed pressure without drift.

- Generated: 2026-04-18T02:48:36.533Z
- Release: `0.1.0+35ab7e8`
- Repo commit: `35ab7e8`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa`

## Benchmark

- Suite: `immaculate-benchmark-2026-04-18T02-41-05-582Z`
- Pack: `Q Mediation Drift (q-mediation-drift)`
- Scenario count: `4`
- Failed assertions: `0`
- Route alignment P50: `1`
- Q-only layer selection P50: `1`
- Drift detected max: `0`
- Mediation latency P95: `25862.66 ms`
- Runner path latency P95: `24.61 ms`
- Arbitration latency P95: `18.55 ms`
- Scheduling latency P95: `4.75 ms`
- Routing latency P95: `1.31 ms`
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics

## Causal Diagnosis

### Mixed pressure local cognition

- Q routing directive: `primary-governed-local`
- Mediation summary: Q should stay primary because the local governed lane is healthy while cloud Q is blocked.
- Mediation signals: `readiness=ready` / `substrate=healthy` / `cloud=blocked` / `directive=primary-governed-local`
- Q self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Drift detected: `false`

### Mixed pressure local memory cognition

- Q routing directive: `primary-governed-local`
- Mediation summary: Q should stay primary because the local governed lane is healthy while cloud Q is blocked.
- Mediation signals: `readiness=ready` / `substrate=healthy` / `cloud=blocked` / `directive=primary-governed-local`
- Q self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Drift detected: `false`

### Mixed pressure guarded hold

- Q routing directive: `guarded-hold`
- Mediation summary: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition.
- Mediation signals: `readiness=not-ready` / `substrate=degraded` / `cloud=blocked` / `directive=guarded-hold`
- Q self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Drift detected: `false`

### Mixed pressure integrity guarded hold

- Q routing directive: `guarded-hold`
- Mediation summary: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition.
- Mediation signals: `readiness=not-ready` / `substrate=degraded` / `cloud=blocked` / `directive=guarded-hold`
- Q self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Drift detected: `false`


## Assertions

- q-mediation-drift-health: `pass` | target `200 health / tracked bundle / one Q model entry` | actual `200 / q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa / Q`
- q-mediation-drift-structured: `pass` | target `all scenarios parse 3 structured fields` | actual `mixed-pressure-local-cognition:completed/3/none, mixed-pressure-local-memory-cognition:completed/3/none, mixed-pressure-guarded-hold:completed/3/none, mixed-pressure-integrity-guarded-hold:completed/3/none`
- q-mediation-drift-route-alignment: `pass` | target `all scenarios aligned / p50 1 / max drift 0` | actual `mixed-pressure-local-cognition:cognitive->cognitive-assisted/drift=false, mixed-pressure-local-memory-cognition:cognitive->cognitive-assisted/drift=false, mixed-pressure-guarded-hold:guarded->guarded-fallback/drift=false, mixed-pressure-integrity-guarded-hold:guarded->guarded-fallback/drift=false`
- q-mediation-drift-q-only-selection: `pass` | target `all local cognition scenarios keep Q-only selection with degraded admission` | actual `true/cognitive-assisted/degrade/1, true/cognitive-assisted/degrade/1`
- q-mediation-drift-guarded-hold: `pass` | target `all guarded scenarios preserve guarded-fallback with dispatch closed` | actual `guarded/guarded-fallback/hold/dispatch=false, guarded/guarded-fallback/hold/dispatch=false`
- q-mediation-drift-self-eval: `pass` | target `all scenarios emit q-self and immaculate-self evaluations` | actual `mixed-pressure-local-cognition:q=true/immaculate=true, mixed-pressure-local-memory-cognition:q=true/immaculate=true, mixed-pressure-guarded-hold:q=true/immaculate=true, mixed-pressure-integrity-guarded-hold:q=true/immaculate=true`

## Drift Trace

- Mixed pressure local cognition: route=cognitive / routing=cognitive-assisted / admission=degrade / drift=false / q-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure local memory cognition: route=cognitive / routing=cognitive-assisted / admission=degrade / drift=false / q-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure guarded hold: route=guarded / routing=guarded-fallback / admission=hold / drift=false / q-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure integrity guarded hold: route=guarded / routing=guarded-fallback / admission=hold / drift=false / q-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
