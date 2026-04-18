# Q Mediation Drift

This page is generated from the dedicated `q-mediation-drift` benchmark pack. It measures whether Immaculate preserves Q's governed route through arbitration, scheduling, and routing under mixed pressure without drift.

- Generated: 2026-04-18T01:43:45.400Z
- Release: `0.1.0+8874851`
- Repo commit: `8874851`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v15-4d81044-ac6ea0d1`

## Benchmark

- Suite: `immaculate-benchmark-2026-04-18T01-33-49-618Z`
- Pack: `Q Mediation Drift (q-mediation-drift)`
- Scenario count: `4`
- Failed assertions: `0`
- Route alignment P50: `1`
- Q-only layer selection P50: `1`
- Drift detected max: `0`
- Mediation latency P95: `28897.9 ms`
- Runner path latency P95: `7.43 ms`
- Arbitration latency P95: `2.63 ms`
- Scheduling latency P95: `2.99 ms`
- Routing latency P95: `1.81 ms`
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics

## Assertions

- q-mediation-drift-health: `pass` | target `200 health / tracked bundle / one Q model entry` | actual `200 / q-defsec-code-longctx-harbor-opt-2384cf5-bench-v15-4d81044-ac6ea0d1 / Q`
- q-mediation-drift-structured: `pass` | target `all scenarios parse 3 structured fields` | actual `mixed-pressure-local-cognition:completed/3/none, mixed-pressure-local-memory-cognition:completed/3/none, mixed-pressure-guarded-hold:completed/3/none, mixed-pressure-integrity-guarded-hold:completed/3/none`
- q-mediation-drift-route-alignment: `pass` | target `all scenarios aligned / p50 1 / max drift 0` | actual `mixed-pressure-local-cognition:cognitive->cognitive-assisted/drift=false, mixed-pressure-local-memory-cognition:cognitive->cognitive-assisted/drift=false, mixed-pressure-guarded-hold:guarded->guarded-fallback/drift=false, mixed-pressure-integrity-guarded-hold:guarded->guarded-fallback/drift=false`
- q-mediation-drift-q-only-selection: `pass` | target `all local cognition scenarios keep Q-only selection with degraded admission` | actual `true/cognitive-assisted/degrade/1, true/cognitive-assisted/degrade/1`
- q-mediation-drift-guarded-hold: `pass` | target `all guarded scenarios preserve guarded-fallback with dispatch closed` | actual `guarded/guarded-fallback/hold/dispatch=false, guarded/guarded-fallback/hold/dispatch=false`
- q-mediation-drift-self-eval: `pass` | target `all scenarios emit q-self and immaculate-self evaluations` | actual `mixed-pressure-local-cognition:q=true/immaculate=true, mixed-pressure-local-memory-cognition:q=true/immaculate=true, mixed-pressure-guarded-hold:q=true/immaculate=true, mixed-pressure-integrity-guarded-hold:q=true/immaculate=true`

## Drift Trace

- Mixed pressure local cognition: route=cognitive / routing=cognitive-assisted / admission=degrade / drift=false / q-self=Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure local memory cognition: route=cognitive / routing=cognitive-assisted / admission=degrade / drift=false / q-self=Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure guarded hold: route=guarded / routing=guarded-fallback / admission=hold / drift=false / q-self=Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
- Mixed pressure integrity guarded hold: route=guarded / routing=guarded-fallback / admission=hold / drift=false / q-self=Q preserved the governed ROUTE/REASON/COMMIT contract without repair. / immaculate-self=Immaculate preserved Q's governed route through arbitration, scheduling, and routing.
