# Product Release Plan

This page records the smallest truthful product and service packaging plan for Immaculate as it exists today.

In plain English: the repo is ready to ship a narrow private `Q` gateway pilot plus an evidence pack before it is ready to claim a broad public SaaS or a full customer-safe operator suite.

## What Can Ship First

- `Immaculate Q Private Gateway Pilot`
- `Q Hardening and Evidence Pack`

## Package 1: Immaculate Q Private Gateway Pilot

- Buyer: internal AI platform lead, security lead, or lab engineering manager
- User: one operator team plus internal apps calling the bounded `Q` API
- Deployment: private OCI VM for the gateway, private upstream model host, private network access only
- Core value: OpenAI-compatible `Q` edge with bounded auth, rate limits, concurrency limits, fail-closed behavior, and machine-stamped benchmark and release evidence
- Required proof surfaces: `Release-Surface`, `Q-Gateway-Validation`, `Q-Readiness-Gate`, `Model-Benchmark-Comparison`, `BridgeBench`

## Package 2: Q Hardening and Evidence Pack

- Buyer: the same team before internal rollout or model promotion
- User: model owner plus operations owner
- Deployment: customer-controlled hardware or private OCI
- Core value: rerun the measured gateway and benchmark surfaces, publish the release/build stamp, export W&B state, and lock the active Q training lineage against that evidence
- Required proof surfaces: `Q-Benchmark-Corpus`, `Q-Benchmark-Promotion`, `Q-Hybrid-Training`, `Benchmark-Wandb-Export`

## Package 3: Immaculate Private Harness Appliance

- Buyer: advanced R&D, robotics, neurodata, or internal platform teams with dedicated operators
- User: trusted internal operator staff
- Deployment: private OCI node for the full control plane
- Core value: broader orchestration harness with durable state, dashboard, TUI, governance, federation, and bounded Q serving
- Truth boundary: this is a later package because the surface is wider and the dashboard is still a trusted-private operator UI rather than a customer-safe product console

## Release Path

- Release `Q` first as a private OCI pilot, not as public internet SaaS
- Keep the benchmark and release evidence pack attached to every pilot build
- Keep cloud training and product packaging separate: training can improve `Q`, but shipping depends on gateway, benchmark, and release truth
- Treat the full Immaculate harness as the second release tier after the narrow `Q` gateway pilot is stable

## What Still Blocks Broader Release

- one-command restamp of every tracked benchmark and release surface from one commit
- real GPU-capable OCI lane for the cloud Q training session in the subscribed region
- customer-safe key management and operator workflows beyond CLI-only administration
- a deployment story for the dashboard that does not expose trusted-private operator tokens in browser configuration
- a clearer commercial handoff package for support, onboarding, and operations ownership

## Truth Boundary

- This plan does not claim public SaaS readiness.
- It does not claim the cloud Q fine-tune lane is complete.
- It does claim the repo can support a private OCI-first `Q` pilot with an attached evidence pack today.
