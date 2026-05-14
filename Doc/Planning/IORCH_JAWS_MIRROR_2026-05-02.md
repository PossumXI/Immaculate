# IORCH JAWS Mirror Handoff (2026-05-02)

## Scope

This pass made the `iorch.net` JAWS mirror deployable and verifiable from the Immaculate repo.

Follow-up pass: the desktop updater API is now deployed from the same iorch Netlify surface, so the
JAWS Tauri updater endpoint in OpenJaws can use `https://iorch.net/api/jaws/<target>/<arch>/<version>`
as a real mirror instead of falling through to a static-site 404.

Second follow-up pass: OpenJaws published `jaws-v0.1.8` at 2026-05-02 04:44:27 UTC. The iorch
surface now treats `jaws-release.json` as the single release source of truth for the dashboard page,
the guarded deploy script, and the function tests. `netlify.toml` still needs static redirects for
Netlify, so `npm run jaws:release:check` verifies those redirects against `jaws-release.json`.

Third follow-up pass: OpenJaws published `jaws-v0.1.9` at 2026-05-02 05:51:32 UTC. The iorch
mirror was advanced by changing only `jaws-release.json`; the release guard derives the static
download redirects, updater expectations, and dashboard copy from that single audited contract.

Fourth follow-up pass: OpenJaws published `jaws-v0.2.2` at 2026-05-10 02:44:49 UTC. The iorch
mirror contract was advanced again from the single release source of truth in `jaws-release.json`,
using the published GitHub release asset names, sizes, and SHA-256 digests.

Fifth follow-up pass: OpenJaws published `jaws-v0.2.3` at 2026-05-14 15:43:00 UTC. The iorch
mirror contract was advanced from the same single release source of truth so the public download
buttons, Netlify redirects, signed updater manifest, and OpenJaws mirror validator all point at the
same 0.2.3 release that carries the JAWS native browser fix.

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
- Added `jaws-release.json`, `scripts/jaws-release-config.mjs`, and
  `scripts/check-iorch-jaws-release.mjs` so the release page, tests, and deploy guard use one
  audited JAWS release contract.
- Updated iorch redirects and the download page to `jaws-v0.1.8`.
- Advanced the iorch JAWS mirror contract to `jaws-v0.1.9` with the published desktop artifact
  names, sizes, and SHA-256 digests.
- Advanced the iorch JAWS mirror contract to `jaws-v0.2.3` with the published desktop artifact
  names, sizes, and SHA-256 digests.
- Hardened the deploy script to inspect the Netlify deploy metadata and fail unless the `jaws`
  function is present in the deploy bundle. This directly guards against the functionless production
  deploy that caused `/api/jaws/...` to return a Next 404.
- Added an explicit source guard: `iorch.net` production deploys must run through the Immaculate
  dashboard lane and must not use the legacy OpenJaws `sites/iorch-jaws-release` static mirror.

## Live Deploy

- Current production deploy ID after the `jaws-v0.1.8` guarded promotion: `69f584b088365f629176dc47`
- Current production deploy ID observed before this follow-up: `69f57da0a3463753a9f20a13`
- Latest function-bearing deploy preview observed before this follow-up: `69f57f888dd57d539fb53b58`
- Previous hardened deploy ID: `69f54af885e009de8dcca6f1`
- Production domain: `https://iorch.net`
- Site ID: `4a9b7d84-9d87-4e10-9951-fb121f9626bd`
- Site name: `immaculate-iorch-20260415022035`
- Guarded production smoke after promotion:
  - `/api/jaws/windows/x86_64/0.1.7` returned `200`
  - `/api/jaws/windows/x86_64/0.1.8` returned `204`
  - deploy metadata included the `jaws` Netlify function

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
- `npm run jaws:release:check`
- OpenJaws clean route health: `bun scripts/service-route-health.ts --json` reported 22 passed,
  0 failed, and 4 not-configured external provisioning items.
- OpenJaws clean `origin/main`: `bun run jaws:mirror:check --json`
- `git diff --check`

## Notes

- Running the OpenJaws mirror check from an older dirty local branch may still expect `jaws-v0.1.5`. Use current `origin/main` for the authoritative 0.1.6 mirror validator.
- Current `origin/main` already carries the public homepage copy cleanup, the protobufjs critical-audit fix, and the JAWS 0.1.6 route publish. This PR keeps those mainline fixes and only adds the deploy hardening plus operator handoff.
