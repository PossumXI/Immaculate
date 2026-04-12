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
```

## What To Inspect First

- harness health and topology
- governance decisions and denial reasons
- benchmark gate status
- transport health, heartbeat, and isolation state
- actuation output redaction versus scoped reads

## If Something Feels Magical

It is probably under-instrumented.
