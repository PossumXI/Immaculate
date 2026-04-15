# OCI Region Capacity

This page records the real OCI region-capacity move for the active Q cloud-training lane and the paired Immaculate cloud bundle.

- Generated: `2026-04-15T15:58:59Z`
- Release: `0.1.0+e968b0c`
- Controller region: `us-ashburn-1`
- Tenancy id: `ocid1.tenancy.oc1..aaaaaaaaajrnaanoycyyhq5caorcxc2puwaqf55ldw3ywzgqja6iwrs7a3jq`
- Cloud training lanes: `Q, Immaculate`

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
- Recommended next step: Provide the tenancy CSI to `oci support incident create` for `regions.subscribed-region-count`, then rerun the bench-v2 doctor for the Q and Immaculate cloud lanes.

## Live Limit Surface

- Limit definition: `subscribed-region-count`
- Current limit value: `1`
- Eligible for limit increase: `True`
- Scope type: `GLOBAL`

## Support CLI Path

- Support user valid generally: `True`
- Support user valid for LIMIT: `True`
- Write-permitted support groups: `1`
- LIMIT catalog includes region-subscription-limits: `True`
- CLI create possible with local data: `False`
- CLI create blocker: CSI is required by `oci support incident create` and is not present in the local controller config or workspace.
- Incident created: `False`
- Helper path: `training/q/create_oci_region_limit_request.py`
- Helper check command: `python training/q/create_oci_region_limit_request.py --check`

## Output

- JSON: `docs/wiki/OCI-Region-Capacity.json`
- Markdown: `docs/wiki/OCI-Region-Capacity.md`

## Truth Boundary

- This page records actual OCI subscription attempts against the current tenancy.
- A public region name is not treated as available capacity until the tenancy subscribes it successfully.
- A subscribed region is still not treated as launch-ready GPU capacity until the Q hybrid session doctor proves a concrete target region and shape.
