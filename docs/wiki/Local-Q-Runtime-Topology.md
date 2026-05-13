# Local Q Runtime Topology

This page is the operator-facing map for the local `Q` runtime after the Ollama recovery pass.

It keeps one truth explicit:

- the normal local `Q` lane follows the default local Ollama service on `http://127.0.0.1:11434`
- the roundtable runtime keeps a separate isolated local lane on `http://127.0.0.1:11435` so it can self-bootstrap and benchmark without depending on the everyday service state

## General Local Q Lane

The normal harness, gateway, and local-Q paths resolve through:

- `IMMACULATE_Q_OLLAMA_URL`
- `IMMACULATE_OLLAMA_URL`
- fallback `http://127.0.0.1:11434`

That is the right path for everyday local use after the Ollama reinstall.

## Local Worker Plane

The harness registers local execution workers for the local `Q` lane and now renews
those worker leases on a bounded heartbeat. This keeps `/api/intelligence/status`
from degrading to `no_workers` after startup while preserving the existing lease
expiry semantics for genuinely stale workers.

- default local worker lease: `45s`
- default local worker heartbeat: `15s`
- override: `IMMACULATE_LOCAL_WORKER_HEARTBEAT_INTERVAL_MS`
- clamp: at least `1s` and no more than half the local worker lease

Startup traces are runtime evidence, not source. With no explicit
`IMMACULATE_RUNTIME_DIR`, the harness writes them under
`apps/harness/.runtime/startup-trace.ndjson`, which is ignored with the rest of
the generated runtime state.

## Isolated Roundtable Lane

The roundtable runtime keeps its own explicit lane through:

- `IMMACULATE_ROUNDTABLE_OLLAMA_URL`
- `IMMACULATE_ROUNDTABLE_Q_OLLAMA_URL`
- fallback `http://127.0.0.1:11435`

That lane is intentionally separate so the roundtable benchmark can:

- boot its own Ollama process if needed
- keep benchmark startup bounded and reproducible
- avoid inheriting stale or overloaded state from the normal local lane
- keep `Q` aliases such as `q-e2b:test` on the structured control path instead of silently falling back to the heavier generic chat route

If the isolated lane cannot prewarm because the host is already carrying the
shared local `Q` model, the runtime may fall back to the healthy shared lane and
records that fallback in the benchmark output. Strict isolation can be restored
with:

```powershell
$env:IMMACULATE_ROUNDTABLE_ALLOW_SHARED_Q_FALLBACK = 'false'
```

## OpenJaws Alignment

OpenJaws now matches the same split model:

- generic Ollama still uses `OLLAMA_BASE_URL` or the default `http://127.0.0.1:11434`
- local `ollama:q` can use the dedicated lane through `OPENJAWS_OLLAMA_Q_BASE_URL` or `OLLAMA_Q_BASE_URL`

Example:

```powershell
$env:OPENJAWS_OLLAMA_Q_BASE_URL = 'http://127.0.0.1:11435'
/provider use ollama q
/provider test ollama q
```

That override only applies to `ollama:q` or `ollama:q:latest`. Generic Ollama models still follow `OLLAMA_BASE_URL` or the default `http://127.0.0.1:11434`.

## Truth Boundary

- This page documents local runtime routing only.
- It does not claim a live public Arobi write path.
- It does not claim live Discord-agent execution.
- It does not make the Asgard placeholder subsystem set more implemented than it is today.
