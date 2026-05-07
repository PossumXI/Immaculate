# Cross-Project Workflow Health

This page is the machine-stamped GitHub Actions truth surface for the three coordinated repos in the current workstation orbit.
It exists so operational claims do not rely on one green repo while another repo is red, inaccessible, or only visible through private GitHub auth.

- Generated: `2026-05-07T07:45:24.059Z`
- Immaculate release: `0.1.0+2c36f1b`
- Repo commit: `2c36f1b0504752d522dd7a9485fed54df708079d`

## Summary

- Repo count: `3`
- Fully healthy repos: `3`
- All observed workflow runs successful: `true`
- Detail: Immaculate (public repo, gh-auth): latest observed runs green; observed 6/8 active workflows, 2 not recently observed | OpenJaws (public repo, gh-auth): latest observed runs green; observed 4/6 active workflows, 2 not recently observed | Asgard_Arobi (private repo, gh-auth): latest observed runs green; observed 10/10 active workflows

## Immaculate

- Repository: `PossumXI/Immaculate`
- Visibility: `public`
- Default branch: `main`
- Access path: `gh-auth` | public repo verified through GitHub Actions REST surfaces
- Active workflows: `8`
- Latest observed workflow runs: `6`
- Not recently observed in the sampled branch window: `2`
- All observed workflow runs successful: `true`
- Latest observed run updated: `2026-05-06T10:02:08Z`

### Latest Observed Workflow Runs

- Benchmark Credibility #25: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25428747075)
- Benchmark Publication #212: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25482571246)
- CI #252: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25482571260)
- npm_and_yarn in /. - Update #1345480481 #37: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25266392084)
- GitGuardian #246: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25482571264)
- Security #252: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25482571265)

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
- Access path: `gh-auth` | public repo verified through GitHub Actions REST surfaces
- Active workflows: `6`
- Latest observed workflow runs: `4`
- Not recently observed in the sampled branch window: `2`
- All observed workflow runs successful: `true`
- Latest observed run updated: `2026-05-07T07:44:44Z`

### Latest Observed Workflow Runs

- CI #401: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25482744263)
- Q Benchmark Soak #25: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25423877322)
- Security #413: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25482744268)
- System Check #402: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/25482744264)

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
- Latest observed run updated: `2026-05-07T07:21:09Z`

### Latest Observed Workflow Runs

- apexos-production-smoke #331: `success` (private run URL withheld)
- ARIA Heartbeat #1182: `success` (private run URL withheld)
- asgard-ci #457: `success` (private run URL withheld)
- billing-production-smoke #119: `success` (private run URL withheld)
- cargo in /AI_UI_Framework/ai-ui for openssl - Update #1350196895 #347: `success` (private run URL withheld)
- Configured Graph Update: go_modules in /. #1350096005 #24: `success` (private run URL withheld)
- GitGuardian Secret Detection #392: `success` (private run URL withheld)
- public-status-production-smoke #122: `success` (private run URL withheld)
- SENTINEL Heartbeat #2162: `success` (private run URL withheld)
- stripe-webhook-production-smoke #321: `success` (private run URL withheld)

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
