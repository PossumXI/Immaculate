# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-05-12T13:15:40Z`
- Status: `promoted`
- Release: `0.1.0+7f0ae1c`
- Repo commit: `7f0ae1c`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `b482df4cbb4da296c7811d36530e046108b7d6cb5c3d218cc6a13f93db951a0c`
- Benchmark corpus rows: `58`
- Active Q bundle: `q-arobi-main-roots-20260512-bench-v1-7f0ae1c-22043bf3`
- Active run: `q-arobi-main-roots-20260512-bench-v1`
- Active session: `q-arobi-main-roots-20260512-bench-v1`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Failure corpus already in active mix: `True`
- Active mix rows: `2053`
- Active mix manifest: `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-arobi-main-roots-20260512-bench-v1/hybrid-session.manifest.json`
- Next candidate run name: `q-arobi-main-roots-20260512-bench-v2`
- Next candidate session id: `q-arobi-main-roots-20260512-bench-v2`

## Latest Promotion

- Promoted bundle: `q-arobi-main-roots-20260512-bench-v1-7f0ae1c-22043bf3`
- Promoted run: `q-arobi-main-roots-20260512-bench-v1`
- Promoted session: `q-arobi-main-roots-20260512-bench-v1`
- Dataset rows: `2053`
- Mix manifest: `.training-output/q/q-mix-arobi-main-roots-20260512-bench-v1.manifest.json`
- Config: `.training-output/q/q-lora-config-arobi-main-roots-20260512-bench-v1.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus and any available strict failure corpus have been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash plus any available strict failure corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
