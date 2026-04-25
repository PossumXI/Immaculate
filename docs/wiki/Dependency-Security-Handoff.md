# Dependency Security Handoff

This page records dependency security exceptions that are visible in `npm audit` or Dependabot runs but are currently blocked by upstream package constraints. It is not a waiver to ignore the advisories; it is the removal checklist for the temporary Dependabot suppressions in `.github/dependabot.yml`.

Generated status pages and GitHub Actions receipts may still show these advisories until upstream packages release compatible fixed dependency lines.

## Current Upstream-Pinned Advisories

### postcss via Next

- Advisory: `GHSA-qx2v-qp2m-jg93`
- Current fixed target: `postcss@8.5.10`
- Current installed edge: `next@16.2.4 -> postcss@8.4.31`
- Why Dependabot fails: `next@16.2.4` pins `postcss` exactly to `8.4.31`, so Dependabot cannot move the transitive package to `8.5.10` without a compatible Next release.
- Temporary Dependabot handling: ignore only `postcss@8.5.10`, while leaving `next` updates enabled.
- Removal trigger: a Next release resolves to `postcss >=8.5.10`, or the dashboard is migrated to a safe compatible Next line.

### uuid via Temporal

- Advisory: `GHSA-w5hq-g745-h8pq`
- Current fixed target: `uuid@14.0.0`
- Current installed edge: `@temporalio/client@1.16.0 -> uuid@^11.1.0`
- Latest checked upstream edge: `@temporalio/client@1.16.1 -> uuid@^11.1.0`
- Why Dependabot fails: the Temporal SDK currently constrains `uuid` to the `11.x` line, while the advisory's fixed line starts at `14.0.0`.
- Temporary Dependabot handling: ignore only `uuid@14.0.0`, while leaving `@temporalio/*` updates enabled.
- Removal trigger: a Temporal SDK release resolves to `uuid >=14.0.0`, or the harness Temporal benchmark lane is moved to a compatible SDK path.

## Operator Checks

Run these before changing the suppression:

```powershell
npm view next@latest version dependencies.postcss --json
npm view @temporalio/client@latest version dependencies.uuid --json
npm explain postcss
npm explain uuid
npm audit --omit=dev --audit-level=critical
gh run list --repo PossumXI/Immaculate --branch main --limit 20
```

Keep the parent packages under Dependabot management. The intended remediation path is a safe parent-package release, not a forced transitive override that violates package constraints.
