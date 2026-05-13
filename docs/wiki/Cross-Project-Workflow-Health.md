# Cross-Project Workflow Health

This page is the machine-stamped GitHub Actions truth surface for the three coordinated repos in the current workstation orbit.
It exists so operational claims do not rely on one green repo while another repo is red, inaccessible, or only visible through private GitHub auth.

- Generated: `2026-05-13T17:50:13.165Z`
- Immaculate release: `0.1.0+d733583`
- Repo commit: `d733583967e50faf8b9f3bdb740f095570dd3edd`

## Summary

- Repo count: `3`
- Fully healthy repos: `3`
- All observed workflow runs successful: `false`
- All actionable workflow runs healthy: `true`
- Detail: Immaculate (public repo, gh-auth): latest actionable runs green; observed 6/8 active workflows, 2 not recently observed, 1 non-actionable dynamic workflow(s) | OpenJaws (public repo, gh-auth): latest actionable runs green; observed 4/6 active workflows, 2 not recently observed | Asgard_Arobi (private repo, gh-auth): latest actionable runs green; observed 10/10 active workflows

## Immaculate

- Repository: `PossumXI/Immaculate`
- Visibility: `public`
- Default branch: `main`
- Access path: `gh-auth` | public repo verified through GitHub Actions REST surfaces
- Active workflows: `8`
- Latest observed workflow runs: `6`
- Not recently observed in the sampled branch window: `2`
- Non-actionable dynamic workflow runs: `1`
- All observed workflow runs successful: `false`
- All actionable workflow runs healthy: `true`
- Latest observed run updated: `2026-05-13T10:07:05Z`

### Latest Observed Workflow Runs

- Benchmark Credibility #32: `success` | `success` - workflow concluded success (https://github.com/PossumXI/Immaculate/actions/runs/25792361142)
- Benchmark Publication #264: `success` | `success` - workflow concluded success (https://github.com/PossumXI/Immaculate/actions/runs/25816323230)
- CI #327: `success` | `success` - workflow concluded success (https://github.com/PossumXI/Immaculate/actions/runs/25816325303)
- npm_and_yarn in /. for next - Update #1361215239 #55: `failure` | `non_actionable` - dynamic Dependabot update failure is tracked as dependency automation noise; code-bearing workflow evidence remains listed separately (https://github.com/PossumXI/Immaculate/actions/runs/25705950214)
- GitGuardian #321: `success` | `success` - workflow concluded success (https://github.com/PossumXI/Immaculate/actions/runs/25816325765)
- Security #327: `success` | `success` - workflow concluded success (https://github.com/PossumXI/Immaculate/actions/runs/25816323194)

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
- Non-actionable dynamic workflow runs: `0`
- All observed workflow runs successful: `true`
- All actionable workflow runs healthy: `true`
- Latest observed run updated: `2026-05-13T17:44:23Z`

### Latest Observed Workflow Runs

- CI #560: `success` | `success` - workflow concluded success (https://github.com/PossumXI/OpenJaws/actions/runs/25815891842)
- Q Benchmark Soak #33: `success` | `success` - workflow concluded success (https://github.com/PossumXI/OpenJaws/actions/runs/25787206327)
- Security #572: `success` | `success` - workflow concluded success (https://github.com/PossumXI/OpenJaws/actions/runs/25815891817)
- System Check #561: `success` | `success` - workflow concluded success (https://github.com/PossumXI/OpenJaws/actions/runs/25815892504)

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
- Non-actionable dynamic workflow runs: `0`
- All observed workflow runs successful: `true`
- All actionable workflow runs healthy: `true`
- Latest observed run updated: `2026-05-13T13:05:36Z`

### Latest Observed Workflow Runs

- apexos-production-smoke #356: `success` | `success` - workflow concluded success (private run URL withheld)
- ARIA Heartbeat #1321: `success` | `success` - workflow concluded success (private run URL withheld)
- asgard-ci #491: `success` | `success` - workflow concluded success (private run URL withheld)
- billing-production-smoke #196: `success` | `success` - workflow concluded success (private run URL withheld)
- go_modules in / for golang.org/x/crypto - Update #1361337112 #356: `success` | `success` - workflow concluded success (private run URL withheld)
- Graph Update: go_modules in /., /Valkyrie #1361336421 #29: `success` | `success` - workflow concluded success (private run URL withheld)
- GitGuardian Secret Detection #426: `success` | `success` - workflow concluded success (private run URL withheld)
- public-status-production-smoke #199: `success` | `success` - workflow concluded success (private run URL withheld)
- SENTINEL Heartbeat #2363: `success` | `success` - workflow concluded success (private run URL withheld)
- stripe-webhook-production-smoke #398: `success` | `success` - workflow concluded success (private run URL withheld)

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
- Dynamic Dependabot update failures are classified as non-actionable dependency automation noise; they remain listed instead of hidden and code-bearing workflow evidence remains separate.
- A workflow not recently observed in the sampled branch window is not treated as green by absence; it is explicitly listed as not recently observed.
- This page does not claim a live Discord mission, a fresh public Arobi write, or a fresh OCI provider probe.
