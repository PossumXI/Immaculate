# Dependency Security Handoff

This page records dependency security exceptions that are visible in `npm audit` or Dependabot runs but are currently blocked by upstream package constraints. It is not a waiver to ignore the advisories; it is the removal checklist for the temporary Dependabot suppressions in `.github/dependabot.yml`.

Generated status pages and GitHub Actions receipts may still show upstream advisories until upstream packages release compatible fixed dependency lines.

## Locally Patched Advisories

### postcss via Next

- Advisory: `GHSA-qx2v-qp2m-jg93`
- Fixed target: `postcss@8.5.10`
- Current local mitigation: root `package.json` pins `postcss@^8.5.13` and overrides transitive `postcss` to `$postcss`.
- Current installed edge after mitigation: `next@16.2.4 -> postcss@8.5.13`
- Why this is still tracked: `next@16.2.4` still declares `postcss` exactly as `8.4.31`, so this override must be removed when Next ships a compatible fixed dependency line.
- Removal trigger: a Next release resolves to `postcss >=8.5.10`, or the dashboard is migrated to a safe compatible Next line.

## Current Upstream-Pinned Advisories

### uuid via Temporal

- Advisory: `GHSA-w5hq-g745-h8pq`
- Current fixed target: `uuid@14.0.0`
- Current installed edge: `@temporalio/client@1.16.1 -> uuid@^11.1.0`
- Latest checked upstream edge: `@temporalio/client@1.17.0 -> uuid@^11.1.0`
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

Keep parent packages under Dependabot management. If a temporary override is used, it must be documented here, backed by typecheck/build evidence, and removed as soon as the parent package ships a compatible fixed dependency line.
