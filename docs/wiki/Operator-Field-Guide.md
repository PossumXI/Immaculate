# Operator Field Guide

## First Principles

- Do not trust convenience over replayability.
- Do not trust speed over governance.
- Do not trust output over metrics.

## Local Bring-Up

```powershell
npm install
npm run dev:harness
npm run dev:tui
npm run dev:dashboard
```

## Verification

```powershell
npm run typecheck
npm run build
npm run benchmark:gate:all
npm run bridgebench
```

## What To Inspect First

- harness health and topology
- governance decisions and denial reasons
- benchmark gate status
- transport health, heartbeat, and isolation state
- actuation output redaction versus scoped reads

## Public Intelligence Status

- Use `GET /api/intelligence/status` for Discord, Aura, and website status checks that only need redacted routing readiness. It is intentionally public and returns counts for layers, workers, nodes, executions, governor queue depth, governance totals, persistence integrity, and PoI summary.
- Use the governed `GET /api/intelligence/workers` endpoint only for operator consoles that have authorization and need worker identities, endpoints, labels, lease state, or assignment details.
- Treat `status=degraded` with `workerPlane.readiness=no_workers` or `no_healthy_workers` as a routing-plane issue, not proof that the harness is down. Treat `status=blocked` as an integrity or no-ready-layer incident until the listed `reasons` clear.

## Q Edge

Create a Q API key:

```powershell
npm run q:keys -- create --label operator-q
```

Inspect the edge:

```powershell
Invoke-WebRequest http://127.0.0.1:8896/api/q/info
```

Run Q with a key:

```powershell
$headers = @{ Authorization = "Bearer <q-api-key>" }
Invoke-WebRequest -Method Post http://127.0.0.1:8896/api/q/run -Headers $headers -ContentType "application/json" -Body (@{ prompt = "Return ROUTE REASON COMMIT for a bounded public inference edge." } | ConvertTo-Json -Compress)
```

Interpret the status honestly:

- `401`: missing or invalid Q API key
- `429`: per-key rate or concurrency limit tripped
- `503`: the Q route was reached, but the model backend did not produce a usable response

## If Something Feels Magical

It is probably under-instrumented.
