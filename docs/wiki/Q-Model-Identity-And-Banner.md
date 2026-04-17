# Q Model Identity And Startup Banner

This page documents two operator-facing pieces of truth:

- `Q` is the single product name used across the repo
- the startup banner is the cosmetic terminal splash shown at runtime

In plain English:

- `Q` is the only model name exposed across the repo
- `Q` is built on Gemma 4 and developed by Arobi Technology Alliance
- Gaetano Comparcola is the founder, CEO, lead architect, and lead engineer behind the project
- the README homepage carries the static banner block for GitHub readers
- the live terminal banner carries the truecolor 6-row splash for operators at runtime

## Q Model Identity

Current local identity behavior:

- product name: `Q`
- foundation model family: `Gemma 4`
- development organization: `Arobi Technology Alliance`
- project lead: `Gaetano Comparcola`

Security posture:

- `Q` is the only public model name used in the repo
- Q runs as the real governed model inside Immaculate instead of being described as a separate public install identity
- no benchmark, W&B, federation, or deployment path depends on creating a different public model name first

## Harness Startup Banner

The harness startup banner is intentionally controlled by policy so it does not spam logs in CI or test runs.

Environment variable:

- `IMMACULATE_STARTUP_BANNER=auto|always|off`

Behavior:

- `auto`: show only on interactive TTY startup
- `always`: force the banner even in non-interactive runs
- `off`: suppress the banner entirely

The banner prints:

- a 6-row ANSI Shadow `IMMACULATE` title with a row-by-row truecolor gradient
- harness endpoint
- tick rate
- local Q runtime endpoint
- the active `Q` product name
- the fact that `Q` is built on `Gemma 4`

The banner is cosmetic only. It does not change runtime governance, routing, or benchmark behavior.

Current build and bundle identity:

- [[Release-Surface]]

## Related Files

- `apps/harness/src/startup-banner.ts`
- `apps/harness/src/q-orchestration-context.ts`
- `apps/harness/src/q-gateway.ts`
- `apps/harness/src/server.ts`
