# GitHub Checks Receipt

This page is generated from GitHub's raw REST checks surfaces for a specific commit.
It exists because classic commit status contexts can be empty even when GitHub Actions check-runs are green.

- Generated: 2026-05-13T17:04:24.317Z
- Repository: `PossumXI/Immaculate`
- Target commit: `5859730`
- Commit URL: https://github.com/PossumXI/Immaculate/commit/585973070c9a2cd34de1d38f9675b430bc7421a4
- Release build: `0.1.0+5859730`
- Branch hint: `main`

## Result

- Workflow runs found: `4`
- Check runs found: `7`
- Classic status contexts found: `0`
- Classic combined status state: `pending`
- All workflow runs successful: `false`
- All check runs successful: `false`

## Workflow Runs

- Security #325: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103240)
- CI #325: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103238)
- GitGuardian #319: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103246)
- Benchmark Publication #262: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103235)

## Check Runs

- dependency-review: `skipped` (https://github.com/PossumXI/Immaculate/actions/runs/25814103240/job/75837889676)
- publish-benchmarks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103235/job/75837889168)
- benchmark-gate: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103238/job/75837888888)
- codeql: `in_progress` (https://github.com/PossumXI/Immaculate/actions/runs/25814103240/job/75837888823)
- gitleaks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103240/job/75837888804)
- npm-audit: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103240/job/75837888793)
- gitguardian: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25814103246/job/75837888728)

## Truth Boundary

- GitHub Actions primarily publishes check-runs/check-suites, not classic commit status contexts.
- An empty classic status list does not mean the commit had no successful Actions runs.
- This receipt verifies the commit through raw GitHub REST workflow-run and check-run endpoints instead of a connector path that previously returned empty arrays.
