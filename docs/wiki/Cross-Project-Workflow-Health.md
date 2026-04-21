# Cross-Project Workflow Health

This page is the machine-stamped GitHub Actions truth surface for the three coordinated repos in the current workstation orbit.
It exists so operational claims do not rely on one green repo while another repo is red, inaccessible, or only visible through private GitHub auth.

- Generated: `2026-04-21T23:58:39.554Z`
- Immaculate release: `0.1.0+3432833`
- Repo commit: `34328335397451c30b6ee12c3edf832fd22a95e6`

## Summary

- Repo count: `3`
- Fully healthy repos: `2`
- All observed workflow runs successful: `false`
- Detail: Immaculate (public repo, gh-auth): some observed runs not green; observed 6/8 active workflows, 2 not recently observed | OpenJaws (public repo, gh-auth): latest observed runs green; observed 4/5 active workflows, 1 not recently observed | Asgard_Arobi (private repo, gh-auth): latest observed runs green; observed 7/7 active workflows

## Immaculate

- Repository: `PossumXI/Immaculate`
- Visibility: `public`
- Default branch: `main`
- Access path: `gh-auth` | public repo verified through GitHub Actions REST surfaces
- Active workflows: `8`
- Latest observed workflow runs: `6`
- Not recently observed in the sampled branch window: `2`
- All observed workflow runs successful: `false`
- Latest observed run updated: `2026-04-21T11:48:52Z`

### Latest Observed Workflow Runs

- Benchmark Credibility #9: `cancelled` (https://github.com/PossumXI/Immaculate/actions/runs/24715721859)
- Benchmark Publication #103: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24752666386)
- CI #113: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24752666400)
- npm_and_yarn in / for next - Update #1332334989 #17: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24751762785)
- GitGuardian #107: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24752666393)
- Security #113: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24752666385)

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
- Active workflows: `5`
- Latest observed workflow runs: `4`
- Not recently observed in the sampled branch window: `1`
- All observed workflow runs successful: `true`
- Latest observed run updated: `2026-04-21T22:22:28Z`

### Latest Observed Workflow Runs

- CI #73: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/24749347374)
- Q Benchmark Soak #6: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/24711316294)
- Security #73: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/24749347375)
- System Check #73: `success` (https://github.com/PossumXI/OpenJaws/actions/runs/24749347377)

### Active Workflow Definitions

- CI | `.github/workflows/ci.yml` | `active`
- Q Benchmark Soak | `.github/workflows/q-benchmark-soak.yml` | `active`
- Release | `.github/workflows/release.yml` | `active`
- Security | `.github/workflows/security.yml` | `active`
- System Check | `.github/workflows/system-check.yml` | `active`

### Not Recently Observed

- Release

## Asgard_Arobi

- Repository: `PossumXI/Asgard_Arobi`
- Visibility: `private`
- Default branch: `main`
- Access path: `gh-auth` | private repo required authenticated GitHub access; private workflow run URLs are withheld on this public receipt
- Active workflows: `7`
- Latest observed workflow runs: `7`
- Not recently observed in the sampled branch window: `0`
- All observed workflow runs successful: `true`
- Latest observed run updated: `2026-04-21T18:46:08Z`

### Latest Observed Workflow Runs

- apexos-production-smoke #23: `success` (private run URL withheld)
- ARIA Heartbeat #839: `success` (private run URL withheld)
- asgard-ci #160: `success` (private run URL withheld)
- npm_and_yarn in /, /Giru/Giru(jarvis), /GovClient, /Notifications, /Owl/web, /ignite/apex-os-project/web-ui, /test/e2e for electron, next, picomatch, protobufjs, electron, electron, picomatch, picomatch, vite, brace-expansion, axios, follow-redirects, lodash, electron, picomatch, vite, brace-expansion, axios, follow-redirects, lodash, picomatch, vite, brace-expansion, protocol-buffers-schema, vite, follow-redirects - Update #1330564222 #282: `success` (private run URL withheld)
- Configured Graph Update: go_modules in /. #1328549740 #14: `success` (private run URL withheld)
- GitGuardian Secret Detection #95: `success` (private run URL withheld)
- SENTINEL Heartbeat #1630: `success` (private run URL withheld)

### Active Workflow Definitions

- apexos-production-smoke | `.github/workflows/apexos-production-smoke.yml` | `active`
- ARIA Heartbeat | `.github/workflows/agent_aria_heartbeat.yml` | `active`
- asgard-ci | `.github/workflows/ci.yml` | `active`
- Dependabot Updates | `dynamic/dependabot/dependabot-updates` | `active`
- Dependency Graph | `dynamic/dependabot/update-graph` | `active`
- GitGuardian Secret Detection | `.github/workflows/gitguardian.yml` | `active`
- SENTINEL Heartbeat | `.github/workflows/agent_sentinel_heartbeat.yml` | `active`

### Not Recently Observed

- none

## Truth Boundary

- This receipt verifies the latest observed GitHub Actions workflow runs on each repo's default branch; it does not claim local dirty branches were pushed or validated.
- Public repos are verified through raw GitHub REST endpoints when possible.
- Private repos fail closed unless authenticated GitHub access is available; when private access is used, private workflow run URLs are withheld from this public receipt.
- A workflow not recently observed in the sampled branch window is not treated as green by absence; it is explicitly listed as not recently observed.
- This page does not claim a live Discord mission, a fresh public Arobi write, or a fresh OCI provider probe.
