# IORCH JAWS Mirror Handoff (2026-05-02)

## Scope

This pass made the `iorch.net` JAWS 0.1.6 mirror deployable and verifiable from the Immaculate repo.

Follow-up pass: the desktop updater API is now deployed from the same iorch Netlify surface, so the
JAWS Tauri updater endpoint in OpenJaws can use `https://iorch.net/api/jaws/<target>/<arch>/<version>`
as a real mirror instead of falling through to a static-site 404.

## Changes

- Hardened `scripts/deploy-iorch-site.mjs` so it:
  - reads Netlify auth from `NETLIFY_AUTH_TOKEN` or the local Netlify CLI config,
  - verifies the exact Netlify site through the Netlify API instead of interactive `sites:list`,
  - sets `CI=true` for child commands,
  - passes `--filter @immaculate/dashboard` so Netlify does not stop on monorepo project selection,
  - uploads the absolute `netlify/functions` directory with a fresh function bundle,
  - smoke-tests the JAWS updater API for older and current desktop clients,
  - deploys only after the expected `iorch.net` site identity is confirmed.
- Added `netlify/functions/jaws.mjs` to resolve signed JAWS update payloads from the public GitHub
  `latest.json` manifest.
- Added the `/api/jaws/*` rewrite to `netlify.toml`.
- Added `tests/netlify-functions/jaws.test.mjs` for older-version update, current-version no-op,
  and malformed request behavior.

## Live Deploy

- Current production deploy ID: `69f554882f2f19f0f0507e1f`
- Previous hardened deploy ID: `69f54af885e009de8dcca6f1`
- Production domain: `https://iorch.net`
- Site ID: `4a9b7d84-9d87-4e10-9951-fb121f9626bd`
- Site name: `immaculate-iorch-20260415022035`

## Validation

- `npm ci`
- `npm run typecheck`
- `npm run build`
- `npm run wandb:bootstrap`
- `npm run training-data:smoke`
- `npm run benchmark:gate:all`
- `npm audit --audit-level=critical`
- `npm run deploy:check`
- `npm run deploy:safe`
- `node --test tests/netlify-functions/jaws.test.mjs`
- OpenJaws clean route health: `bun scripts/service-route-health.ts --json` reported 22 passed,
  0 failed, and 4 not-configured external provisioning items.
- OpenJaws clean `origin/main`: `bun run jaws:mirror:check --json`
- `git diff --check`

## Notes

- Running the OpenJaws mirror check from an older dirty local branch may still expect `jaws-v0.1.5`. Use current `origin/main` for the authoritative 0.1.6 mirror validator.
- Current `origin/main` already carries the public homepage copy cleanup, the protobufjs critical-audit fix, and the JAWS 0.1.6 route publish. This PR keeps those mainline fixes and only adds the deploy hardening plus operator handoff.
