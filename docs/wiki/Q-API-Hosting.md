# Q API Hosting

`Q` is the truthful alias for the current Gemma 4 base model in the Immaculate
harness. The secure serving surface is a narrow route on the harness, not a
separate public control plane.

## Routes

- `GET /api/q/info`
- `POST /api/q/run`

`/api/q/info` can be left readable when the Q edge is enabled.
`/api/q/run` stays header-authenticated, bounded, and rate-limited.

## Auth and Key Management

The Q edge accepts:

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

Keys are stored hashed with `scrypt` in the local Q key registry. The repo does
not expose a browser-based key-management surface.

## Rate Limits

Default Q edge settings:

- `IMMACULATE_Q_API_DEFAULT_RPM`
- `IMMACULATE_Q_API_DEFAULT_BURST`
- `IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT`

Per-key overrides are stored with the key record at creation time.

## Live Validation

Fresh loopback validation on `2026-04-14` proved the route behavior:

- `GET /api/q/info` returned `200`
- unauthenticated `POST /api/q/run` returned `401`
- keyed `POST /api/q/run` reached the execution path and returned a truthful `503`
  when Ollama returned no completion
- a second concurrent keyed request returned `429 concurrency_limited`

That means the current hard boundary is the model backend, not the auth or
rate-limit plane.

## OCI Private Hosting

The OCI private bundle can carry the Q edge when you explicitly enable it in:

- `deploy/oci-private/env/immaculate-harness.env.example`

Recommended settings:

```ini
IMMACULATE_Q_API_ENABLED=true
IMMACULATE_Q_API_KEYS_PATH=/var/lib/immaculate/runtime/q-api-keys.json
IMMACULATE_Q_API_DEFAULT_RPM=60
IMMACULATE_Q_API_DEFAULT_BURST=60
IMMACULATE_Q_API_DEFAULT_MAX_CONCURRENT=2
```

Keep the Q key store under `/var/lib/immaculate/runtime` so it remains inside
the mounted writable path already hardened by the private OCI bundle.

## Truth Boundary

- This is not yet a separate internet-facing gateway.
- It is the narrow Q inference edge on the same private harness process and
  port.
- No real OCI instance was launched from this pass.
- No completed cloud fine-tune run is claimed from this pass.
