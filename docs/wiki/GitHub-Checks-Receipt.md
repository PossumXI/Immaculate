# GitHub Checks Receipt

This page is generated from GitHub's raw REST checks surfaces for a specific commit.
It exists because classic commit status contexts can be empty even when GitHub Actions check-runs are green.

- Generated: 2026-05-13T18:18:05.871Z
- Repository: `PossumXI/Immaculate`
- Target commit: `d4ba2de`
- Commit URL: https://github.com/PossumXI/Immaculate/commit/d4ba2de448111bc87ce427c4d358b597f5f11b93
- Release build: `0.1.0+d4ba2de`
- Branch hint: `main`

## Result

- Workflow runs found: `4`
- Check runs found: `7`
- Classic status contexts found: `0`
- Classic combined status state: `pending`
- All workflow runs successful: `true`
- All check runs successful: `true`

## Workflow Runs

- GitGuardian #326: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460661)
- Benchmark Publication #268: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460627)
- CI #332: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460645)
- Security #332: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460610)

## Check Runs

- dependency-review: `skipped` (https://github.com/PossumXI/Immaculate/actions/runs/25817460610/job/75849588566)
- gitleaks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460610/job/75849587613)
- codeql: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460610/job/75849587544)
- npm-audit: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460610/job/75849587498)
- benchmark-gate: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460645/job/75849587349)
- publish-benchmarks: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460627/job/75849587144)
- gitguardian: `success` (https://github.com/PossumXI/Immaculate/actions/runs/25817460661/job/75849586920)

## Truth Boundary

- GitHub Actions primarily publishes check-runs/check-suites, not classic commit status contexts.
- An empty classic status list does not mean the commit had no successful Actions runs.
- This receipt verifies the commit through raw GitHub REST workflow-run and check-run endpoints instead of a connector path that previously returned empty arrays.
