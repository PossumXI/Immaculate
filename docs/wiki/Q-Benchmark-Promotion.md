# Q Benchmark Promotion

This page is generated from the tracked Q training state.
It records whether the latest benchmark corpus has already been promoted into the active locked Q bundle. It does not claim a fine-tune or cloud launch happened.

- Generated: `2026-04-15T12:37:51Z`
- Status: `promoted`
- Release: `0.1.0+3ce07ac`
- Repo commit: `3ce07ac`
- Benchmark corpus JSONL: `.training-output/q/q-benchmark-corpus.jsonl`
- Benchmark corpus SHA-256: `56d05da3a82be73b84c596df2ad67aead87372666505aa29efb252f85cf59ed1`
- Benchmark corpus rows: `57`
- Active Q bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-3ce07ac-cee52e2d`
- Active run: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2`
- Active session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`

## Promotion State

- Benchmark corpus already in active mix: `True`
- Active mix rows: `1070`
- Active mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v2.manifest.json`
- Active session manifest: `.training-output/q/sessions/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/hybrid-session.manifest.json`
- Next candidate run name: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v3`
- Next candidate session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v3`

## Latest Promotion

- Promoted bundle: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2-3ce07ac-cee52e2d`
- Promoted run: `q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2`
- Promoted session: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Dataset rows: `1070`
- Mix manifest: `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v2.manifest.json`
- Config: `.training-output/q/q-lora-config-longctx-cur-fnv1a-8f551a5c-bench-v2.json`
- Lock: `.training-output/q/latest-training-lock.json`

## Truth Boundary

- A promoted state means the benchmark corpus has been pulled into the locked Q training mix and the hybrid session has been restamped against that mix.
- An already-current state means the active Q bundle already carries the current benchmark corpus hash, so the repo should not fabricate a new bench version just to look active.
- This surface tracks preparation and locking only. It does not imply a local train or cloud fine-tune has executed.
