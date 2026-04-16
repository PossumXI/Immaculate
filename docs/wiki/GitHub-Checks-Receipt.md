# GitHub Checks Receipt

This page is generated from GitHub's raw REST checks surfaces for a specific commit.
It exists because classic commit status contexts can be empty even when GitHub Actions check-runs are green.

- Generated: 2026-04-16T17:54:12.583Z
- Repository: `PossumXI/Immaculate`
- Target commit: `26d83ee`
- Commit URL: https://github.com/PossumXI/Immaculate/commit/26d83eecc6eaea40cc4e400428c045b3d360b12a
- Release build: `0.1.0+26d83ee`
- Branch hint: `harbor-q-push`

## Result

- Workflow runs found: `4`
- Check runs found: `6`
- Classic status contexts found: `0`
- Classic combined status state: `pending`
- All workflow runs successful: `true`
- All check runs successful: `true`

## Workflow Runs

- CI #73: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038804)
- Benchmark Publication #58: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038752)
- GitGuardian #67: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038540)
- Security #73: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038649)

## Check Runs

- dependency-review: `skipped` (https://github.com/PossumXI/Immaculate/actions/runs/24524038649/job/71689286629)
- benchmark-gate: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038804/job/71689286614)
- gitguardian: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038540/job/71689286414)
- publish-benchmarks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038752/job/71689286117)
- codeql: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038649/job/71689286106)
- gitleaks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/24524038649/job/71689286105)

## Truth Boundary

- GitHub Actions primarily publishes check-runs/check-suites, not classic commit status contexts.
- An empty classic status list does not mean the commit had no successful Actions runs.
- This receipt verifies the commit through raw GitHub REST workflow-run and check-run endpoints instead of a connector path that previously returned empty arrays.
