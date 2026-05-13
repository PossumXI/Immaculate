# GitHub Checks Receipt

This page is generated from GitHub's raw REST checks surfaces for a specific commit.
It exists because classic commit status contexts can be empty even when GitHub Actions check-runs are green.

- Generated: 2026-05-13T17:50:33.850Z
- Repository: `PossumXI/Immaculate`
- Target commit: `d733583`
- Commit URL: https://github.com/PossumXI/Immaculate/commit/d733583967e50faf8b9f3bdb740f095570dd3edd
- Release build: `0.1.0+d733583`
- Branch hint: `main`

## Result

- Workflow runs found: `4`
- Check runs found: `7`
- Classic status contexts found: `0`
- Classic combined status state: `pending`
- All workflow runs successful: `true`
- All check runs successful: `true`

## Workflow Runs

- GitGuardian #321: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816325765)
- CI #327: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816325303)
- Benchmark Publication #264: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816323230)
- Security #327: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816323194)

## Check Runs

- gitguardian: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816325765/job/75845675359)
- benchmark-gate: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816325303/job/75845672192)
- dependency-review: `skipped` (https://github.com/PossumXI/Immaculate/actions/runs/25816323194/job/75845667970)
- publish-benchmarks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816323230/job/75845667572)
- codeql: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816323194/job/75845667360)
- gitleaks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816323194/job/75845667327)
- npm-audit: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25816323194/job/75845667313)

## Truth Boundary

- GitHub Actions primarily publishes check-runs/check-suites, not classic commit status contexts.
- An empty classic status list does not mean the commit had no successful Actions runs.
- This receipt verifies the commit through raw GitHub REST workflow-run and check-run endpoints instead of a connector path that previously returned empty arrays.
