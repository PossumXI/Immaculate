# Contributing

Immaculate is built as an orchestration substrate first. Contributions should
improve reliability, observability, safety, or measurable capability before
they chase breadth.

## Ground Rules

- Keep control-plane changes replayable and observable.
- Prefer benchmarked improvements over unmeasured claims.
- Preserve the governance model: purpose-bound access, redaction, and durable audit trails are part of the product.
- Treat neurodata, derived cognition traces, and actuation outputs as sensitive by default.
- Do not commit secrets, local runtime artifacts, benchmark dumps, or machine-specific paths.

## Development

```powershell
npm install
npm run typecheck
npm run build
npm run benchmark:gate:all
```

## Pull Requests

- Describe the problem, the architectural reason for the change, and the risk.
- Add or update benchmark coverage when changing runtime behavior.
- Update docs when changing operator APIs, governance rules, or transport behavior.
- Keep patches surgical. Large refactors need a clear rationale and rollback plan.

## Areas Where Help Is Useful

- Neurodata ingestion and normalization
- Benchmark packs tied to public BCI and neuroscience workloads
- Additional device transports such as MIDI and gRPC-class lanes
- Governance and policy tooling
- Fault-tolerant orchestration and transport supervision
