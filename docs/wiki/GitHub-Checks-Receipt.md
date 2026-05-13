# GitHub Checks Receipt

This page is generated from GitHub's raw REST checks surfaces for a specific commit.
It exists because classic commit status contexts can be empty even when GitHub Actions check-runs are green.

- Generated: 2026-05-13T18:22:56.279Z
- Repository: `PossumXI/Immaculate`
- Target commit: `b6d30a1`
- Commit URL: https://github.com/PossumXI/Immaculate/commit/b6d30a1ee4dd2d2123d8d785787a8f05484fa9e8
- Release build: `0.1.0+b6d30a1`
- Branch hint: `main`

## Result

- Workflow runs found: `3`
- Check runs found: `6`
- Classic status contexts found: `0`
- Classic combined status state: `pending`
- All workflow runs successful: `true`
- All check runs successful: `true`

## Workflow Runs

- GitGuardian #327: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049222)
- CI #333: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049230)
- Security #333: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049208)

## Check Runs

- dependency-review: `skipped` (https://github.com/PossumXI/Immaculate/actions/runs/25818049208/job/75851649228)
- benchmark-gate: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049230/job/75851648214)
- codeql: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049208/job/75851648166)
- npm-audit: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049208/job/75851648147)
- gitguardian: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049222/job/75851648113)
- gitleaks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25818049208/job/75851648105)

## Truth Boundary

- GitHub Actions primarily publishes check-runs/check-suites, not classic commit status contexts.
- An empty classic status list does not mean the commit had no successful Actions runs.
- This receipt verifies the commit through raw GitHub REST workflow-run and check-run endpoints instead of a connector path that previously returned empty arrays.
