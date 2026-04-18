# Cloudflare Q Profile

This page records the generated Q-only Cloudflare worker profile used to keep the Cloudflare lane grounded even before a LoRA artifact is available.

- Generated: `2026-04-18T02:57:04Z`
- Profile id: `q-cloudflare-profile-1b28d69`
- Q name: `Q`
- Q training bundle: `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa`
- Hybrid session: `q-hybrid-harbor-opt-2384cf5-bench-v16`
- Release: `0.1.0+1b28d69`
- Rule count: `5`
- Worker module: `deploy/cloudflare/worker/src/q-profile.generated.ts`

## Rules

- `bridge-trust`: If a late ACK, nonce mismatch, or nonce replay appears, say the bridge ACK path is untrusted and keep delivery fail-closed.
- `direct-lane`: If direct HTTP/2 is healthy and policy-allowed while the bridge is degraded, name direct HTTP/2 as the trusted lane.
- `lease-recovery`: If lease jitter, failed execution, or repair pending appears, stabilize the peer with bounded retries and preserve durable retry lineage.
- `same-origin`: If same-origin operator access and token secrecy are both required, keep credentials out of browser-visible URLs.
- `operator-grade`: Prefer terse operator-grade route, reason, and commit wording over generic caution language.

## Truth Boundary

- This profile is a deploy-time prompt-and-policy pack for the Cloudflare worker, not a claim that a Cloudflare LoRA exists.
- It keeps the Cloudflare lane Q-only and domain-grounded while the heavy fine-tune still lives in the main training path.
