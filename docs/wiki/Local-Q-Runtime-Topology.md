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
