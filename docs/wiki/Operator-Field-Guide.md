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
