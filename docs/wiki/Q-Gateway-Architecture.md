# Q Gateway Architecture

This page defines the truthful boundary for the dedicated `Q` gateway process.

In plain English, this is the smaller server you expose when you want people to use `Q` without handing them the whole Immaculate control plane.

It is not the full harness.
It is a separate narrow server that exposes only:

- `GET /health`
- `GET /api/q/info`
- `GET /v1/models`
- `POST /v1/chat/completions`

The gateway uses the same hashed Q API key store and the same per-key
rate/concurrency model as the harness, but it does not expose federation,
actuation, datasets, benchmarks, operator traces, or the broader control plane.

Release/build identity for the current repo state lives in:

- [[Release-Surface]]

## What The Gateway Owns

- header-only Q API authentication
- per-key rate limiting and concurrency limiting
- bounded chat-completion request validation
- a narrow OpenAI-compatible surface for `Q`
- direct private execution against the configured Q runtime backend
- a bounded primary-model circuit breaker with explicit fail-closed behavior
- a single typed inference profile for request bounds, structured-generation
  knobs, timeouts, health cache, benchmark settings, and primary circuit policy
- an OCI/OpenAI-compatible `/responses` transport behind the same public
  `/v1/chat/completions` gateway contract
- private OCI deployment glue for that narrow process

## Provider Configuration

The default private workstation route stays Ollama-compatible:

- `IMMACULATE_Q_INFERENCE_PROVIDER=ollama`
- `IMMACULATE_Q_OLLAMA_URL=http://127.0.0.1:11434`

The private OCI or OpenAI-compatible route uses the Responses API shape:

- `IMMACULATE_Q_INFERENCE_PROVIDER=oci` or `responses`
- `IMMACULATE_Q_OCI_BASE_URL=https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1`
- `IMMACULATE_Q_RESPONSES_PATH=/responses`
- `IMMACULATE_Q_OCI_BEARER_TOKEN=<secret>` or `IMMACULATE_Q_RESPONSES_API_KEY=<secret>`

If the gateway points at a private local proxy that already performs OCI IAM
signing, set `IMMACULATE_Q_INFERENCE_AUTH_MODE=none` explicitly. Hosted
Responses routes default to bearer auth and report `auth.configured=false` in the
redacted health/info profile when the secret is absent.

## What Stays Private In Immaculate

These concerns remain in the private harness and are not published by the Q
gateway:

- federation and worker control
- governance policies beyond the narrow Q ingress
- execution arbitration and scheduling
- actuation, device, and bridge control
- neurodata ingest, replay, and dataset surfaces
- benchmark publication and operator APIs
- mutable control-plane state outside the Q gateway runtime

## Security Boundary

The dedicated gateway is safer than exposing the harness directly because:

- it does not accept the global harness admin key
- it exposes only four routes
- it does not serve websocket, federation, benchmark, or actuation routes
- it keeps the Q key store hashed on disk
- it enforces per-key rate and concurrency limits before model execution
- it can stop hammering a failing primary model by opening the primary circuit
  and failing closed instead of silently swapping models
- it exposes only a redacted inference profile in health/info responses; private
  runtime URLs stay out of user-visible payloads
- it is designed for private OCI deployment with no public ingress by default

## OCI Shape

Recommended shape:

1. run the Q gateway on a private subnet
2. keep the Q runtime on a separate private host or private service address
3. allow clients in through OCI Bastion, VPN, FastConnect, peered VCNs, or a
   private load balancer
4. do not assign a public IP to the gateway host by default

Example split:

- Q gateway: `10.0.3.10:8788`
- private Q runtime: `10.0.2.20:11434`
- private OCI/OpenAI-compatible Q runtime:
  `https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1/responses`

## Bundle Contents

The OCI deployment bundle for the dedicated gateway lives under:

- `deploy/oci-q-gateway/Dockerfile`
- `deploy/oci-q-gateway/cloud-init/immaculate-q-gateway.cloud-init.yaml`
- `deploy/oci-q-gateway/env/immaculate-q-gateway.env.example`
- `deploy/oci-q-gateway/scripts/build-immaculate-q-gateway-image.sh`
- `deploy/oci-q-gateway/scripts/install-oci-q-gateway.sh`
- `deploy/oci-q-gateway/scripts/run-immaculate-q-gateway.sh`
- `deploy/oci-q-gateway/systemd/immaculate-q-gateway.service`

## Truth Boundary

Safe claims:

- the repo now contains a real dedicated Q gateway server entrypoint
- the OCI bundle now targets that dedicated gateway process, not an NGINX-only
  reverse proxy
- the gateway is private-OCI-first and narrower than the harness
- the gateway now has a live primary-failure circuit with explicit headers and
  response metadata when the Q lane is degraded
- inference customization has a typed configuration surface instead of scattered
  constants
- the gateway can now route through either the private Ollama-compatible runtime
  or a configured OCI/OpenAI-compatible Responses runtime while keeping endpoint
  URLs and bearer tokens out of public health/info payloads

Claims this page does not make:

- that the gateway is public on the internet by default
- that OCI autoscaling or public WAF integration is complete
- that the gateway replaces the private harness
- that a cloud fine-tune for `Q` has already been run from this repo
