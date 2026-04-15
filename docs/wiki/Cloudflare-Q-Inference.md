# Cloudflare Q Inference

This page records the Cloudflare deploy and evaluation lane for Q-only inference.

- Generated: `2026-04-15T22:59:47Z`
- Release: `0.1.0+4e0638e`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Worker config: `deploy/cloudflare/wrangler.toml`
- Worker typecheck ready: `True`

## Cloudflare Auth

- Account id ready: `False`
- API token ready: `False`
- Gateway id: `default`
- Gateway compat URL: `n/a`
- Auth header: `cf-aig-authorization: Bearer <token>`

## Adapter Export

- Ready: `False`
- Source dir: `.training-output/q/runs/q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2`
- Output dir: `.training-output/q/cloudflare/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/adapter`
- Adapter config: `n/a`
- Adapter weights: `n/a`
- Weights size MB: `n/a`
- Adapter blocker: Adapter source directory is missing: .training-output/q/runs/q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v2
- Adapter blocker: adapter_config.json is missing from the candidate adapter source.
- Adapter blocker: adapter_model.safetensors is missing from the candidate adapter source.

## Eval Bundle

- Ready: `True`
- Record count: `24`
- JSONL path: `.training-output/q/cloudflare/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/eval/cloudflare-q-eval-bundle.jsonl`
- Manifest path: `.training-output/q/cloudflare/q-hybrid-cur-fnv1a-8f551a5c-bench-v2/eval/cloudflare-q-eval-bundle.json`

## Worker And Gateway

- Worker package path: `deploy/cloudflare/worker`
- Deploy script: `deploy/cloudflare/scripts/deploy-cloudflare-worker.sh`
- Worker URL configured: `False`
- Worker URL: `n/a`
- Base model configured: `False`
- LoRA name configured: `False`

## Smoke Eval

- Attempted: `False`
- Ready: `False`
- Evaluated rows: `0`
- Blocker: n/a

## Truth Boundary

- This lane treats Cloudflare as a Q inference and evaluation plane, not the heavy training backend.
- The worker serves only the public Q identity and rejects other model labels.
- A Cloudflare deploy is not claimed until account auth, a Cloudflare-ready adapter bundle, and worker deployment all exist together.
- AI Gateway is used for logging and evaluation metadata around the Q worker path instead of pretending Cloudflare is the source of the Q fine-tune itself.
