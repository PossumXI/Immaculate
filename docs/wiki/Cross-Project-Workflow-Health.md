# Cross-Project Workflow Health

This page is the machine-stamped GitHub Actions truth surface for the three coordinated repos in the current workstation orbit.
It exists so operational claims do not rely on one green repo while another repo is red, inaccessible, or only visible through private GitHub auth.

- Generated: `2026-05-13T17:04:14.785Z`
- Immaculate release: `0.1.0+5859730`
- Repo commit: `585973070c9a2cd34de1d38f9675b430bc7421a4`

## Summary

- Repo count: `3`
- Fully healthy repos: `2`
- All observed workflow runs successful: `false`
- Detail: Immaculate (public repo, github-rest-public): some observed runs not green; observed 6/8 active workflows, 2 not recently observed | OpenJaws (public repo, github-rest-public): latest observed runs green; observed 4/6 active workflows, 2 not recently observed | Asgard_Arobi (private repo, gh-auth): latest observed runs green; observed 10/10 active workflows

## Immaculate

- Repository: `PossumXI/Immaculate`
- Visibility: `public`
- Default branch: `main`
- Access path: `github-rest-public` | public repo verified through GitHub Actions REST surfaces
- Active workflows: `8`
- Latest observed workflow runs: `6`
- Not recently observed in the sampled branch window: `2`
- All observed workflow runs successful: `false`
- Latest observed run updated: `2026-05-13T10:07:05Z`

### Latest Observed Workflow Runs

- Benchmark Credibility #32: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25792361142)
- Benchmark Publication #262: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103235)
- CI #325: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103238)
- npm_and_yarn in /. for next - Update #1361215239 #55: `failure` (https://github.com/PossumXI/Immaculate/actions/runs/25705950214)
- GitGuardian #319: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103246)
- Security #325: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103240)

### Active Workflow Definitions

- Benchmark Credibility | `.github/workflows/benchmark-credibility.yml` | `active`
- Benchmark Long Run | `.github/workflows/benchmark-longrun.yml` | `active`
- Benchmark Publication | `.github/workflows/benchmark-publication.yml` | `active`
- CI | `.github/workflows/benchmark-gate.yml` | `active`
- Dependabot Updates | `dynamic/dependabot/dependabot-updates` | `active`
- GitGuardian | `.github/workflows/gitguardian.yml` | `active`
- Release | `.github/workflows/release.yml` | `active`
- Security | `.github/workflows/security.yml` | `active`

### Not Recently Observed

- Benchmark Long Run
- Release

## OpenJaws

- Repository: `PossumXI/OpenJaws`
- Visibility: `public`
- Default branch: `main`
- Access path: `github-rest-public` | public repo verified through GitHub Actions REST surfaces
- Active workflows: `6`
- Latest observed workflow runs: `4`
- Not recently observed in the sampled branch window: `2`
- All observed workflow runs successful: `true`
- Latest observed run updated: `2026-05-13T16:51:33Z`

### Latest Observed Workflow Runs

- CI #558: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25813190535)
- Q Benchmark Soak #33: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25787206327)
- Security #570: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25813190367)
- System Check #559: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25813190481)

### Active Workflow Definitions

- CI | `.github/workflows/ci.yml` | `active`
- JAWS Desktop | `.github/workflows/jaws-desktop.yml` | `active`
- Q Benchmark Soak | `.github/workflows/q-benchmark-soak.yml` | `active`
- Release | `.github/workflows/release.yml` | `active`
- Security | `.github/workflows/security.yml` | `active`
- System Check | `.github/workflows/system-check.yml` | `active`

### Not Recently Observed

- JAWS Desktop
- Release

## Asgard_Arobi

- Repository: `PossumXI/Asgard_Arobi`
- Visibility: `private`
- Default branch: `main`
- Access path: `gh-auth` | private repo required authenticated GitHub access; private workflow run URLs are withheld on this public receipt
- Active workflows: `10`
- Latest observed workflow runs: `10`
- Not recently observed in the sampled branch window: `0`
- All observed workflow runs successful: `true`
- Latest observed run updated: `2026-05-13T13:05:36Z`

### Latest Observed Workflow Runs

- apexos-production-smoke #356: `success` (private run URL withheld)
- ARIA Heartbeat #1320: `success` (private run URL withheld)
- asgard-ci #491: `success` (private run URL withheld)
- billing-production-smoke #196: `success` (private run URL withheld)
- go_modules in / for golang.org/x/crypto - Update #1361337112 #356: `success` (private run URL withheld)
- Graph Update: go_modules in /., /Valkyrie #1361336421 #29: `success` (private run URL withheld)
- GitGuardian Secret Detection #426: `success` (private run URL withheld)
- public-status-production-smoke #198: `success` (private run URL withheld)
- SENTINEL Heartbeat #2362: `success` (private run URL withheld)
- stripe-webhook-production-smoke #397: `success` (private run URL withheld)

### Active Workflow Definitions

- apexos-production-smoke | `.github/workflows/apexos-production-smoke.yml` | `active`
- ARIA Heartbeat | `.github/workflows/agent_aria_heartbeat.yml` | `active`
- asgard-ci | `.github/workflows/ci.yml` | `active`
- billing-production-smoke | `.github/workflows/billing-production-smoke.yml` | `active`
- Dependabot Updates | `dynamic/dependabot/dependabot-updates` | `active`
- Dependency Graph | `dynamic/dependabot/update-graph` | `active`
- GitGuardian Secret Detection | `.github/workflows/gitguardian.yml` | `active`
- public-status-production-smoke | `.github/workflows/public-status-production-smoke.yml` | `active`
- SENTINEL Heartbeat | `.github/workflows/agent_sentinel_heartbeat.yml` | `active`
- stripe-webhook-production-smoke | `.github/workflows/stripe-webhook-production-smoke.yml` | `active`

### Not Recently Observed

- none

## Truth Boundary

- This receipt verifies the latest observed GitHub Actions workflow runs on each repo's default branch; it does not claim local dirty branches were pushed or validated.
- Public repos are verified through raw GitHub REST endpoints when possible.
- Private repos fail closed unless authenticated GitHub access is available; when private access is used, private workflow run URLs are withheld from this public receipt.
- A workflow not recently observed in the sampled branch window is not treated as green by absence; it is explicitly listed as not recently observed.
- This page does not claim a live Discord mission, a fresh public Arobi write, or a fresh OCI provider probe.
