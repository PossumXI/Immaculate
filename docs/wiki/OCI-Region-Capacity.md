# OCI Region Capacity

This page records the real OCI region-capacity move for the active Q cloud-training lane.

- Generated: `2026-04-15T15:19:36Z`
- Release: `0.1.0+e04cfc5`
- Controller region: `us-ashburn-1`
- Tenancy id: `ocid1.tenancy.oc1..aaaaaaaaajrnaanoycyyhq5caorcxc2puwaqf55ldw3ywzgqja6iwrs7a3jq`

## Subscribed Regions Before

- us-ashburn-1 (IAD) [home]: `READY`

## Candidate Subscription Attempts

- us-phoenix-1 (PHX): `blocked`
  Code: `TenantCapacityExceeded`
  Message: You have exceeded the maximum number of allowed subscribed regions. Please see the Limits, Quotas and Usage page for more detail.
- us-sanjose-1 (SJC): `blocked`
  Code: `TenantCapacityExceeded`
  Message: You have exceeded the maximum number of allowed subscribed regions. Please see the Limits, Quotas and Usage page for more detail.
- us-chicago-1 (ORD): `blocked`
  Code: `TenantCapacityExceeded`
  Message: You have exceeded the maximum number of allowed subscribed regions. Please see the Limits, Quotas and Usage page for more detail.

## Subscribed Regions After

- us-ashburn-1 (IAD) [home]: `READY`

## Summary

- Latest attempt status: `blocked`
- Subscription limit reached: `True`
- Recommended next step: Increase the tenancy's allowed subscribed-region limit or upgrade the OCI tenancy tier, then rerun the bench-v2 doctor.

## Output

- JSON: `docs/wiki/OCI-Region-Capacity.json`
- Markdown: `docs/wiki/OCI-Region-Capacity.md`

## Truth Boundary

- This page records actual OCI subscription attempts against the current tenancy.
- A public region name is not treated as available capacity until the tenancy subscribes it successfully.
- A subscribed region is still not treated as launch-ready GPU capacity until the Q hybrid session doctor proves a concrete target region and shape.
