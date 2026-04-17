# Q API Hosting

`Q` now has two truthful serving surfaces:

1. the narrow private harness route
2. the dedicated Q gateway server

They do different jobs and should not be described as the same thing.

In plain English:

- the private harness route is for operators already inside Immaculate
- the dedicated Q gateway is the smaller, safer edge for Q users
- both surfaces serve the same real Q product, built on Gemma 4 and published under one model name only: `Q`

Current build and bundle identity:

- [[Release-Surface]]

## Private Harness Q Edge

Routes on the harness process:

- `GET /api/q/info`
- `POST /api/q/run`

This edge still matters for governed internal use.
It lives inside the private harness, still benefits from the existing
`q-public` governance policy, and should stay private unless you have a specific
reason to expose it.

The harness edge accepts Q API keys and, on a private trusted node, can still
coexist with the broader harness operator surface.
It now also writes a real audit spool for `/api/q/run`, so bounded Q failures
like `missing_prompt`, `prompt_too_large`, and live transport/model failures can
feed the repair loop instead of staying trapped in runtime logs.

## Dedicated Q Gateway

The repo now also contains a separate dedicated gateway server:

- `GET /health`
- `GET /api/q/info`
- `GET /v1/models`
- `POST /v1/chat/completions`

This gateway is the safer deployment surface for external Q users because it:

- accepts only Q API keys
- does not accept the global harness admin key
- exposes only four routes
- keeps federation, actuation, benchmarks, and operator APIs off the public edge
- uses the same hashed Q key store and per-key rate/concurrency limits
- trips open on repeated Q-upstream failures and returns explicit failure instead of masking the broken Q lane

If you want one sentence: the gateway is the “public front desk” for Q, while the harness route is the “staff-only back room” inside the full control plane.

Use the gateway when you want a bounded API surface.
Use the harness route when you need the governed internal Q edge inside the full
control plane.

## Auth and Key Management

Both surfaces accept:

- `Authorization: Bearer <q-api-key>`
- `X-API-Key: <q-api-key>`

Query-string tokens are not accepted.

Create a key:

```powershell
npm run q:keys -- create --label q-live-verify --rpm 12 --burst 12 --max-concurrent 1
```

List keys:

```powershell
npm run q:keys -- list
```

Revoke a key:

```powershell
npm run q:keys -- revoke --key-id <key-id>
```

Keys are stored hashed with `scrypt`.
There is still no browser-based key management surface in the repo.

## Rate Limits

Default shared Q key policy fields:

- `IMMACULATE_Q_API_DEFAULT_RPM`
- `IMMACULATE_Q_API_DEFAULT_BURST`
- `IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT`

Per-key overrides are stored with the key record at creation time.

## Live Gateway Validation

The latest tracked loopback validation proves the dedicated gateway contract is
green on the current build. The exact port, latency, and build stamp live on
[[Q-Gateway-Validation]]. The stable truth is:

- `GET /health` returned `200`
- unauthenticated `POST /v1/chat/completions` returned `401`
- authenticated `GET /api/q/info` returned `200`
- authenticated `GET /v1/models` returned `200`
- authenticated `POST /v1/chat/completions` returned `200`
- the served response was sanitized to final-answer content:
  `Gateway operational, healthy now.`
- the concurrency check returned `429 concurrency_limited`
- the gateway added only a bounded amount of overhead above the upstream Q lane,
  and the current measured value is published on [[Q-Gateway-Validation]]

Tracked evidence lives in:

- [[Q-Gateway-Validation]]
- [[Q-Gateway-Substrate]]
- [[Q-API-Audit]]

## Primary Failure Control Loop

The dedicated gateway now has one honest upstream-failure loop:

- the primary Q lane can accumulate consecutive failures
- once the configured threshold is reached, the primary circuit opens
- while the circuit is open, requests stop hammering the dead primary
- the gateway stays explicit about the failure class and returns it directly

## OCI Private Hosting

The dedicated OCI deployment bundle for the gateway now lives under:

- `deploy/oci-q-gateway/`

Use it when you need:

- a private-subnet Q-only API surface
- Podman-based isolation
- no public ingress by default
- the dedicated gateway server instead of the full harness process

Architecture details:

- [[Q-Gateway-Architecture]]

The older harness bundle under `deploy/oci-private/` still exists and still
serves the full private harness.

## Truth Boundary

- The dedicated Q gateway is real and lives in `apps/harness/src/q-gateway.ts`.
- The harness Q edge is also still real and still private.
- The gateway contract proof, the gateway-to-substrate seam benchmark, and the live Q API audit loop are now three separate evidence pages on purpose; they answer different questions and should not be collapsed into one vague “Q is working” claim.
- The gateway is private-OCI-first, not internet-public by default.
- The gateway keeps direct-Q upstream failure state explicit in headers and response metadata and fail-closes instead of silently rewriting the product identity.
- No real OCI instance was launched from this pass.
- No completed cloud fine-tune run for `Q` is claimed from this pass.
- Direct `Q` is now green on the structured route/reason/commit readiness gate
  on this machine.
