# Training Data Factory

This page tracks the real dataset-capture path for Gemma-style defensive fine-tuning work inside Immaculate.

The goal is not "scrape everything."
The goal is a reproducible corpus assembly path with explicit policy, provenance, and security checks.

## What Exists Now

- manifest-first source intake
- local and remote git source materialization
- allow/review/reject license policy gates
- file include and exclude policy
- best-effort likely-secret scanning on candidate text files
- duplicate-content suppression
- curated JSONL export
- run manifest plus per-source provenance fields
- CI smoke coverage for rejection, dedup, secret detection, and provenance output

## Security Boundary

This factory is intentionally strict about what it claims.

It does:

- make source selection explicit
- keep generated curation output out of git by default
- surface likely license and secret problems early
- preserve raw and processed hash lineage for review
- emit policy-derived flags that can be reviewed explicitly instead of being implied informally

It does not:

- replace legal review
- guarantee perfect license detection
- guarantee perfect secret detection
- certify downstream redistribution rights automatically

The `commercialUse`, `defenseUse`, `copyleftFree`, and `gptOutputFree` fields are policy and heuristic outputs.
They are useful review signals, not substitutes for legal or procurement signoff.

## Core Contract

The curation run emits:

- resolved manifest
- per-source summary
- per-file decision records
- curated JSONL export
- shard JSONLs
- pipeline code hash
- run-level provenance chain hash

The core package carries first-class schemas for:

- `TrainingCorpusManifest`
- `TrainingCorpusPolicy`
- `TrainingCorpusSourceSummary`
- `TrainingCorpusFileRecord`
- `TrainingCorpusOutputShard`
- `TrainingCorpusRun`

## Commands

Smoke validation:

```powershell
npm run training-data:smoke
```

Real curation run:

```powershell
npm run training-data:curate -- fixtures/training/gemma4-defsec-curation.example.json
```

List prior runs:

```powershell
npm run training-data:list
```

Show one run:

```powershell
npm run training-data:show -- --run=<run-id>
```

## Usable Parts Of The Gemma Fine-Tuning Report

The repo keeps the engineering parts that are actually actionable:

- provenance chains
- explicit license policy buckets
- copyleft and proprietary-output policy flags
- defensive-security-oriented dataset manifests

The repo does not silently inherit unverified market, legal, or benchmark claims from external planning notes.
If a claim matters, it should be implemented, measured, or cited independently.

## Next Logical Phase

- governed read surfaces for curated training runs
- richer source adapters with the same policy contract
- direct handoff from curated shards into fine-tune and eval jobs
- stronger review workflow for ambiguous licenses and flagged secrets
