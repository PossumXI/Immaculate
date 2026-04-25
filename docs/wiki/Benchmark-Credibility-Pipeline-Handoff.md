# Benchmark Credibility Pipeline Handoff - 2026-04-25

Remote GitHub Actions check:

- Repository: `PossumXI/Immaculate`
- Workflow: `Benchmark Credibility`
- Latest scheduled run checked: `24927876299`
- Result: cancelled in step `Run credibility benchmark` after roughly two hours.
- Pattern: the prior scheduled runs `24883377370`, `24828671764`, and earlier daily schedules cancelled the same way.

Local workflow state:

- `.github/workflows/benchmark-credibility.yml` has an uncommitted fix that moves scheduled credibility runs from `durability-torture` to `durability-recovery`.
- The same local workflow change lowers the job timeout to 60 minutes and caps the benchmark step at 45 minutes.
- CI-eligible packs are now explicitly allowlisted: `durability-recovery`, `neurodata-external`, and `temporal-baseline`.
- `.github/workflows/benchmark-longrun.yml` now owns `durability-torture` alongside the 60-second benchmark and 60-minute soak lanes.
- Long-run jobs now use a non-cancelling per-pack concurrency group and a 210-minute benchmark-step budget inside a 240-minute job budget.
- `apps/harness/src/benchmark-cli-flags.ts` now reads `npm_config_pack`, `npm_config_publish_wandb`, `IMMACULATE_BENCHMARK_PACK`, and `IMMACULATE_PUBLISH_WANDB`, so npm workspace commands cannot silently fall back to `substrate-readiness` when a workflow requested a specific pack.

Verification:

- `npm run build -w @immaculate/core` passed locally on 2026-04-25.
- `npm run benchmark -w @immaculate/harness --pack=durability-recovery` passed locally on 2026-04-25 and reported `packId=durability-recovery`, `failedAssertions=0`.
- `IMMACULATE_BENCHMARK_PACK=temporal-baseline npm run benchmark -w @immaculate/harness` passed locally on 2026-04-25 and reported `packId=temporal-baseline`, `failedAssertions=0`.
- `node --import tsx --test apps/harness/src/benchmark-cli-flags.test.ts` passed locally on 2026-04-25.
- `npm run typecheck -w @immaculate/harness` passed locally on 2026-04-25 after the CLI parser split.

Next action:

- Push the existing workflow change on an operator-approved branch before expecting the scheduled remote workflow to recover.
- Keep long torture or soak lanes in `benchmark-longrun.yml`; do not run them from the scheduled credibility workflow.
- After the workflow branch is pushed, dispatch `Benchmark Credibility` with `durability-recovery` first, then dispatch `Benchmark Long Run` with `durability-torture` only when long-run budget is intentionally approved.
