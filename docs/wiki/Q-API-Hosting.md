# Q API Hosting

`Q` now has two truthful serving surfaces:

1. the narrow private harness route
2. the dedicated Q gateway server

They do different jobs and should not be described as the same thing.

In plain English:

- the private harness route is for operators already inside Immaculate
- the dedicated Q gateway is the smaller, safer edge for Q users

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
- trips open on repeated primary-model failures and fail-closes instead of silently switching the user onto a second model lane

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

Fresh loopback validation on `2026-04-14` against the dedicated gateway at
`http://127.0.0.1:8900` proved:

- `GET /health` returned `200`
- unauthenticated `POST /v1/chat/completions` returned `401`
- authenticated `GET /api/q/info` returned `200`
- authenticated `GET /v1/models` returned `200`
- authenticated `POST /v1/chat/completions` returned `200`
- the served response was sanitized to final-answer content:
  `Gateway reports healthy status.`
- the concurrency check returned `429 concurrency_limited`
- measured gateway overhead above upstream latency was about `99.92 ms`

Tracked evidence lives in:

- [[Q-Gateway-Validation]]

## Primary Failure Control Loop

The dedicated gateway now has one honest upstream-failure loop:

- the primary Q lane can accumulate consecutive failures
- once the configured threshold is reached, the primary circuit opens
- while the circuit is open, requests stop hammering the dead primary
- the gateway stays explicit about the failure class instead of silently switching the request onto a different model lane

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
- The gateway is private-OCI-first, not internet-public by default.
- The gateway fail-closes on direct-Q upstream failures and keeps that fact explicit in headers and response metadata.
- No real OCI instance was launched from this pass.
- No completed cloud fine-tune run for `Q` is claimed from this pass.
- Direct `Q` is now green on the structured route/reason/commit readiness gate
  on this machine.
