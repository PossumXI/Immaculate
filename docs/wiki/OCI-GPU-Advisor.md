# OCI GPU Advisor

This page records the current OCI GPU launch advice for the active Q hybrid training session.

- Generated: `2026-04-15T17:07:28Z`
- Release: `0.1.0+967ff93`
- Session id: `q-hybrid-cur-fnv1a-8f551a5c-bench-v2`
- Probe scope: `verified-subscribed-regions-only`
- Controller region: `us-ashburn-1`
- Configured target region: `us-ashburn-1`
- Configured shape: `n/a`
- Object Storage region: `n/a`

## Verified Subscribed Regions

- us-ashburn-1 (IAD) [home]: probe `verified`, gpu shapes `none`
  Reason: No GPU-capable shapes are visible for the current controller auth.

## Recommended Launch Target

- Status: `none`
- Region: `n/a`
- Shape: `n/a`
- Reason: No subscribed OCI region currently exposes GPU-capable shapes for the current controller auth.

## Public Expansion Candidates

- us-chicago-1 (ORD): Public OCI region candidate. GPU capacity is not verified until the tenancy subscribes it.
- us-phoenix-1 (PHX): Public OCI region candidate. GPU capacity is not verified until the tenancy subscribes it.
- us-sanjose-1 (SJC): Public OCI region candidate. GPU capacity is not verified until the tenancy subscribes it.

## Next Actions

- Only one subscribed OCI region is visible right now: us-ashburn-1 (IAD) [home].
- Next capacity move is to subscribe an additional nearby public region such as: us-chicago-1 (ORD), us-phoenix-1 (PHX), us-sanjose-1 (SJC).
- Keep the cloud lane as not-configured until a subscribed region shows verified GPU-capable shapes.

## Output

- JSON: `docs/wiki/OCI-GPU-Advisor.json`
- Markdown: `docs/wiki/OCI-GPU-Advisor.md`

## Truth Boundary

- Verified inventory only covers subscribed OCI regions that the current controller auth could query.
- Public expansion candidates are discoverability hints, not proof of available GPU capacity.
- A launch target is only considered real when the session doctor marks it ready and the cloud launcher can execute with concrete region, shape, and bundle settings.
