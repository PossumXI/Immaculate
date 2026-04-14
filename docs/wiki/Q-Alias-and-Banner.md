# Q Alias And Startup Banner

This page documents the isolated `Q` alias and controlled startup banner slice that was added without touching the benchmark/comparison or OCI deployment surfaces.

## What It Adds

- A local Ollama alias path so Gemma 4 can be addressed as `Q`
- A controlled 6-row ANSI Shadow startup banner for the harness with a lavender-to-ocean truecolor gradient
- Alias-aware Ollama discovery so `Q` still resolves as a Gemma-family model

## Local Ollama Alias

Default alias behavior:

- alias: `q`
- display name: `Q`
- base model: `gemma4:e4b`

Create the local alias:

```powershell
npm run ollama:alias:q
```

Preview the generated Modelfile without installing:

```powershell
npm run ollama:alias:q -- --print-only
```

Override the base model:

```powershell
$env:IMMACULATE_OLLAMA_Q_BASE_MODEL="gemma4:31b"
npm run ollama:alias:q -- --force
```

Tracked reference template:

- `fixtures/ollama/Q.Modelfile.template`

Security posture:

- The alias only renames the local Ollama model handle
- The generated Modelfile uses `FROM <base model>` only
- No benchmark, W&B, federation, or deployment path is modified by the alias install flow

## Harness Startup Banner

The harness startup banner is intentionally controlled by policy so it does not spam logs in CI or test runs.

Environment variable:

- `IMMACULATE_STARTUP_BANNER=auto|always|off`

Behavior:

- `auto`: show only on interactive TTY startup
- `always`: force the banner even in non-interactive runs
- `off`: suppress the banner entirely

The banner prints:

- a 6-row ANSI Shadow `IMMACULATE` title with a row-by-row truecolor gradient
- harness endpoint
- tick rate
- local Ollama endpoint
- current configured model
- the `Q` alias mapping

The banner is cosmetic only. It does not change runtime governance, routing, or benchmark behavior.

## Related Files

- `apps/harness/src/ollama-alias.ts`
- `apps/harness/src/q-alias-cli.ts`
- `apps/harness/src/startup-banner.ts`
- `apps/harness/src/ollama.ts`
- `apps/harness/src/server.ts`
