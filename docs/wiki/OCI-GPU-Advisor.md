# OCI GPU Advisor

This page records the current OCI GPU launch advice for the active Q hybrid training session.

- Generated: `2026-05-12T13:15:46Z`
- Release: `0.1.0+7f0ae1c`
- Session id: `q-arobi-main-roots-20260512-bench-v1`
- Probe scope: `verified-subscribed-regions-only`
- Controller region: `n/a`
- Configured target region: `n/a`
- Configured shape: `n/a`
- Object Storage region: `n/a`

## Verified Subscribed Regions

- No subscribed OCI regions could be verified.

## Recommended Launch Target

- Status: `none`
- Region: `n/a`
- Shape: `n/a`
- Reason: Active hybrid session is using the HF Jobs cloud lane; see OCI-Region-Capacity for the current OCI controller state.

## Public Expansion Candidates

- No additional public region candidates were discovered.

## Next Actions


## Output

- JSON: `docs/wiki/OCI-GPU-Advisor.json`
- Markdown: `docs/wiki/OCI-GPU-Advisor.md`

## Truth Boundary

- Verified inventory only covers subscribed OCI regions that the current controller auth could query.
- Public expansion candidates are discoverability hints, not proof of available GPU capacity.
- A launch target is only considered real when the session doctor marks it ready and the cloud launcher can execute with concrete region, shape, and bundle settings.
