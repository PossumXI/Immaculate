# Q LaaS Audit Corpus Import

Date: 2026-05-14

## Purpose

Q can already learn from curated files, benchmark outcomes, failure receipts,
and live Q API audit rows. The remaining accountable-runtime gap was Arobi
Network LaaS evidence: Arobi exposes a governed, receipt-backed
`/api/v1/audit/training-corpus` route, but Immaculate did not have a checked
importer for that route.

`training/q/build_q_laas_audit_corpus.py` closes that gap by turning verified
LaaS training-corpus records into a supplemental Q JSONL dataset.

## Command

```powershell
npm run q:laas:audit-corpus -- --base-url http://127.0.0.1:<arobi-port>
```

For private operator-controlled training jobs that are allowed to consume
private `allowed-internal` records:

```powershell
npm run q:laas:audit-corpus -- --base-url http://127.0.0.1:<arobi-port> --include-internal
```

The importer writes:

- `.training-output/q/q-laas-audit-corpus.jsonl`
- `.training-output/q/q-laas-audit-corpus.manifest.json`

## Safety Boundary

The importer is deliberately fail-closed.

- It verifies `receipt.records_sha256` against the canonical sanitized record
  payload.
- It rejects every `zero-zero`, `00`, or `blocked` training-policy record.
- It rejects forbidden export fields such as requester, clearance, signature,
  action, outcome, and raw input data.
- It rejects sensitive metadata keys or values that look like secrets,
  biometric references, face embeddings, license plates, raw media paths,
  tracking identifiers, or watchlist labels.
- It only treats private `allowed-internal` records as valid when
  `--include-internal` is explicitly set.

This importer does not add facial recognition, persistent identity matching,
watchlists, targeting, or browser/agent automation. It imports governed audit
lessons that Q can use for route, reason, decision, and policy behavior.

## Training Flow

When the manifest changes, add the generated JSONL as a supplemental input:

```powershell
python training/q/build_q_mixture.py `
  --base .training-output/q/q-train-<run-id>.jsonl `
  --supplemental training/q/q_harness_identity_seed.json `
  --supplemental training/q/q_immaculate_reasoning_seed.json `
  --supplemental training/q/bridgebench_seed.json `
  --supplemental training/q/coding_long_context_seed.json `
  --supplemental .training-output/q/q-laas-audit-corpus.jsonl `
  --output .training-output/q/q-mix-<run-id>.jsonl
```

## Verification

```powershell
python training/q/build_q_laas_audit_corpus_test.py
python training/q/build_q_laas_audit_corpus.py --help
```
