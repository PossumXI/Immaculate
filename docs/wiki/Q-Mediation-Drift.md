# Q Mediation Drift

This page is generated from the dedicated `q-mediation-drift` benchmark pack. It measures whether Immaculate preserves Q's governed route through arbitration, scheduling, and routing under mixed pressure without drift.

- Generated: 2026-04-19T22:06:40.025Z
- Release: `0.1.0+6fc8e11`
- Repo commit: `6fc8e11`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce`

## Benchmark

- Suite: `immaculate-benchmark-2026-04-19T22-04-57-220Z`
- Pack: `Q Mediation Drift (q-mediation-drift)`
- Scenario count: `4`
- Failed assertions: `0`
- Route alignment P50: `1`
- Q-only layer selection P50: `1`
- Drift detected max: `0`
- Local replicas P50: `0`
- Verification quorum P50: `1`
- Mediation latency P95: `26054.67 ms`
- Runner path latency P95: `4.4 ms`
- Arbitration latency P95: `1.61 ms`
- Scheduling latency P95: `2.04 ms`
- Routing latency P95: `0.75 ms`
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics

## Causal Diagnosis

### Mixed pressure local cognition

- Q routing directive: `primary-governed-local`
- Mediation summary: Q should stay primary because the local governed lane is healthy while cloud Q is blocked.
- Mediation signals: `readiness=ready` / `substrate=healthy` / `cloud=blocked` / `directive=primary-governed-local`
- Q self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Context fingerprint: `q-mediation-context-mixed-pressure-local-cognition`
- Evidence digest: `q-mediation-evidence-mixed-pressure-local-cognition`
- Runner bottleneck stage: `scheduling`
- Parallel formation: `hybrid-quorum` / local `2` / remote `0` / quorum `2`
- Affinity and deadline: `quorum-local` / `bounded` / `700 ms` / `degrade`
- Intent alignment: `0.50`
- Formation summary: mode=hybrid-quorum / stages=1 / horizontal=2 / local=2 / remote=0 / quorum=2 / backup=1 / verify=local-quorum / failover=local-spare / retry=1 / aff=quorum-local / ddl=bounded:700ms / bp=degrade / align=0.50 / roles=reasoner>mid / gov=elevated / backlog=elevated / fed=elevated / qLane=local-primary
- Q drift reasons: `none`
- Immaculate drift reasons: `none`
- Drift detected: `false`

### Mixed pressure local memory cognition

- Q routing directive: `primary-governed-local`
- Mediation summary: Q should stay primary because the local governed lane is healthy while cloud Q is blocked.
- Mediation signals: `readiness=ready` / `substrate=healthy` / `cloud=blocked` / `directive=primary-governed-local`
- Q self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Context fingerprint: `q-mediation-context-mixed-pressure-local-memory-cognition`
- Evidence digest: `q-mediation-evidence-mixed-pressure-local-memory-cognition`
- Runner bottleneck stage: `scheduling`
- Parallel formation: `hybrid-quorum` / local `2` / remote `0` / quorum `2`
- Affinity and deadline: `quorum-local` / `bounded` / `700 ms` / `degrade`
- Intent alignment: `0.50`
- Formation summary: mode=hybrid-quorum / stages=1 / horizontal=2 / local=2 / remote=0 / quorum=2 / backup=1 / verify=local-quorum / failover=local-spare / retry=1 / aff=quorum-local / ddl=bounded:700ms / bp=degrade / align=0.50 / roles=reasoner>mid / gov=elevated / backlog=elevated / fed=elevated / qLane=local-primary
- Q drift reasons: `none`
- Immaculate drift reasons: `none`
- Drift detected: `false`

### Mixed pressure guarded hold

- Q routing directive: `guarded-hold`
- Mediation summary: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition.
- Mediation signals: `readiness=not-ready` / `substrate=degraded` / `cloud=blocked` / `directive=guarded-hold`
- Q self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Context fingerprint: `q-mediation-context-mixed-pressure-guarded-hold`
- Evidence digest: `q-mediation-evidence-mixed-pressure-guarded-hold`
- Runner bottleneck stage: `scheduling`
- Parallel formation: `single-lane` / local `0` / remote `0` / quorum `1`
- Affinity and deadline: `local-pinned` / `hard` / `400 ms` / `hold`
- Intent alignment: `0.01`
- Formation summary: mode=single-lane / stages=0 / horizontal=0 / local=0 / remote=0 / quorum=1 / backup=0 / verify=single-trust / failover=none / retry=0 / aff=local-pinned / ddl=hard:400ms / bp=hold / align=0.01 / roles=none / gov=critical / backlog=critical / fed=critical / qLane=degraded
- Q drift reasons: `none`
- Immaculate drift reasons: `none`
- Drift detected: `false`

### Mixed pressure integrity guarded hold

- Q routing directive: `guarded-hold`
- Mediation summary: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition.
- Mediation signals: `readiness=not-ready` / `substrate=degraded` / `cloud=blocked` / `directive=guarded-hold`
- Q self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair.
- Immaculate self-eval: Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Context fingerprint: `q-mediation-context-mixed-pressure-integrity-guarded-hold`
- Evidence digest: `q-mediation-evidence-mixed-pressure-integrity-guarded-hold`
- Runner bottleneck stage: `scheduling`
- Parallel formation: `single-lane` / local `0` / remote `0` / quorum `1`
- Affinity and deadline: `local-pinned` / `hard` / `400 ms` / `hold`
- Intent alignment: `0.09`
- Formation summary: mode=single-lane / stages=0 / horizontal=0 / local=0 / remote=0 / quorum=1 / backup=0 / verify=single-trust / failover=none / retry=0 / aff=local-pinned / ddl=hard:400ms / bp=hold / align=0.09 / roles=none / gov=critical / backlog=elevated / fed=elevated / qLane=degraded
- Q drift reasons: `none`
- Immaculate drift reasons: `none`
- Drift detected: `false`


## Assertions

- q-mediation-drift-health: `pass` | target `200 health / tracked bundle / one Q model entry` | actual `200 / q-defsec-code-longctx-harbor-opt-2384cf5-bench-v23-5ed19b9-286326ce / Q`
- q-mediation-drift-structured: `pass` | target `all scenarios parse 3 structured fields` | actual `mixed-pressure-local-cognition:completed/3/none, mixed-pressure-local-memory-cognition:completed/3/none, mixed-pressure-guarded-hold:completed/3/none, mixed-pressure-integrity-guarded-hold:completed/3/none`
- q-mediation-drift-route-alignment: `pass` | target `all scenarios aligned / p50 1 / max drift 0` | actual `mixed-pressure-local-cognition:cognitive->cognitive-assisted/drift=false, mixed-pressure-local-memory-cognition:cognitive->cognitive-assisted/drift=false, mixed-pressure-guarded-hold:guarded->guarded-fallback/drift=false, mixed-pressure-integrity-guarded-hold:guarded->guarded-fallback/drift=false`
- q-mediation-drift-q-only-selection: `pass` | target `all local cognition scenarios keep Q-only selection with degraded admission` | actual `true/cognitive-assisted/degrade/2, true/cognitive-assisted/degrade/2`
- q-mediation-drift-parallel-formation: `pass` | target `local cognition scenarios keep at least 2 local replicas / no remote spill` | actual `hybrid-quorum/2/0/quorum=2, hybrid-quorum/2/0/quorum=2`
- q-mediation-drift-affinity-deadline: `pass` | target `all local cognition scenarios keep local affinity with non-hard deadlines` | actual `quorum-local/bounded/700ms/degrade, quorum-local/bounded/700ms/degrade`
- q-mediation-drift-guarded-hold: `pass` | target `all guarded scenarios preserve guarded-fallback with dispatch closed` | actual `guarded/guarded-fallback/hold/dispatch=false, guarded/guarded-fallback/hold/dispatch=false`
- q-mediation-drift-self-eval: `pass` | target `all scenarios emit q-self and immaculate-self evaluations` | actual `mixed-pressure-local-cognition:q=true/immaculate=true, mixed-pressure-local-memory-cognition:q=true/immaculate=true, mixed-pressure-guarded-hold:q=true/immaculate=true, mixed-pressure-integrity-guarded-hold:q=true/immaculate=true`

## Drift Trace

- Mixed pressure local cognition: route=cognitive / routing=cognitive-assisted / admission=degrade / formation=hybrid-quorum:2local/0remote/quorum=2 / drift=false / q-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure local memory cognition: route=cognitive / routing=cognitive-assisted / admission=degrade / formation=hybrid-quorum:2local/0remote/quorum=2 / drift=false / q-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Q should stay primary because the local governed lane is healthy while cloud Q is blocked. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure guarded hold: route=guarded / routing=guarded-fallback / admission=hold / formation=single-lane:0local/0remote/quorum=1 / drift=false / q-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure integrity guarded hold: route=guarded / routing=guarded-fallback / admission=hold / formation=single-lane:0local/0remote/quorum=1 / drift=false / q-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate should hold or degrade because readiness or gateway substrate is not healthy enough for governed local cognition. Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
