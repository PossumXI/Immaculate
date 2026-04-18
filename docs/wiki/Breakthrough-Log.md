# Breakthrough Log

This page is reserved for major leaps in Immaculate:

- a new architectural capability that materially changes the system
- a hard reliability or governance boundary crossed
- a meaningful benchmark or latency breakthrough
- a real scientific or engineering insight that was present in the system space but widely missed

## Entry Format

For each breakthrough, record:

1. Date
2. What changed
3. Why it matters
4. Evidence
5. What this unlocks next

## Current Entries

### 2026-04-18

#### Terminal-Bench is no longer failing on prompt overflow; it is now failing on the real Q-only task boundary

What changed:
- the generic Harbor path for the public `terminal-bench/make-mips-interpreter` task now compacts planning and generation payloads instead of dumping the whole workspace into Q
- binary workspace files are now explicitly omitted from prompt context instead of being pasted as raw ELF garbage
- the task-specific MIPS/DOOM shim stayed in the repo, but it is now gated behind `IMMACULATE_ENABLE_TERMINAL_BENCH_DIAGNOSTIC_SHIMS` so it cannot silently masquerade as default HarborQAgent capability
- the Harbor agent now waits on the Q gateway health surface and retries once when the gateway is open from upstream failure instead of hard-failing immediately on `circuit_open`

Why it matters:
- the missed systems pattern was that the old public-task failure looked like “Q is bad at Terminal-Bench,” but the first concrete blocker was more basic: the generic Harbor path was blowing the Q gateway input bound before the task could really start
- once the payload overflow and binary-garbage issues were removed, the remaining failure became much more useful: the next real bottleneck is Q under sustained task pressure, seen now as a completed-but-wrong `0.0` solution rather than prompt-size rejection
- gating the MIPS/DOOM shim matters because a diagnostic verifier pass is useful engineering evidence, but it is not the same thing as default Q capability on the public benchmark

Evidence:
- the historical official public receipt in `docs/wiki/Terminal-Bench-Receipt.md` remains `0.000`
- the local diagnostic rerun in `docs/wiki/Terminal-Bench-Rerun.md` remains `5/5` and is explicitly marked diagnostic-only
- the fresh generic post-fix Harbor smoke at `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-postfix2/result.json` completed with `1` trial, `0` exceptions, reward `0.0`, and a full verifier pass after `10m 16s`
- the generated payload for that completed run was `2921` characters and marked `/app/doomgeneric_mips` as `[binary file omitted: doomgeneric_mips, 1543608 bytes]`, proving the old prompt-bloat path is no longer the main blocker
- the earlier fresh generic smokes at `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-fresh/result.json` and `.runtime/terminal-bench-jobs/q-terminal-bench-public-generic-smoke-postfix/result.json` still show the intermediate transition through `APITimeoutError` and `circuit_open` while the runner-path fixes were landing

What this unlocks next:
- the next Q tuning pass can train against the real public-task miss instead of another synthetic prompt-format issue
- the next Harbor improvement pass can stay generic and Q-only while targeting upstream stability, shorter planning chains, and better terminal-task solve depth
- public copy can now say exactly what failed, what was fixed, and what remains open without blending the historical receipt, the diagnostic rerun, and the default generic path into one misleading story

### 2026-04-18

#### Q and Immaculate now prove governed route preservation across a harder four-scenario mediation lane

What changed:
- the live `q-mediation-drift` pack was expanded from `2` mixed-pressure scenarios to `4`, adding a historical-pressure local cognition case and a conflicting healthy-signal integrity-hold case
- the same lane now publishes runner-path timing separately from model timing, so the repo can see whether slowdowns come from Q itself or from Immaculate arbitration, scheduling, and routing
- the lane now asserts that both Q and Immaculate emit explicit self-evaluations on every scenario instead of only reporting pass/fail drift
- after the harder reasoning/orchestration pass landed clean and was rerun on the current lock, the benchmark promotion path minted the new active Q bundle `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v16-35ab7e8-de7361fa` and paired Immaculate bundle `immaculate-orchestration-35ab7e8-ec4b3cb6`

Why it matters:
- the missed pattern was that a green two-scenario mediation page was not enough proof that Immaculate could preserve Q's governed route once historical blocked verdicts and conflicting healthy signals entered the same decision
- separating runner-path latency from model latency matters because it tells the next optimization pass where the time is really being spent instead of blaming the whole request on Q
- explicit Q and Immaculate self-evaluation matters because a control system should not only detect drift; it should explain whether drift came from Q's contract, from arbitration, or from later routing layers
- promoting the new bench-v16 line matters because the next cloud run, the next Harbor improvement pass, and the next public release page now all point at the same updated benchmark lineage

Evidence:
- `docs/wiki/Q-Mediation-Drift.md` now records `4` scenarios, `0` failed assertions, route-alignment `P50 1`, drift-detected `max 0`, mediation-latency `P95 25862.66 ms`, and runner-path `P95 24.61 ms`
- `docs/wiki/Q-Gateway-Substrate.md` now records the refreshed seam pass at `0` failed assertions with gateway-latency `P95 28012.43 ms` and arbitration-latency `P95 2.66 ms`
- `docs/wiki/Q-Benchmark-Promotion.md` now records the promoted `bench-v16` line and `docs/wiki/Release-Surface.md` now points at the same active Q and Immaculate bundles
- `README.md`, `docs/wiki/Home.md`, and `apps/dashboard/app/ui/landing-page.tsx` now explain the new reasoning/orchestration result in plain English instead of only listing older seam and Harbor facts

What this unlocks next:
- the next Q tuning pass can target the still-open Harbor wording losses and the public Terminal-Bench miss without destabilizing the now-harder mediation lane
- the next Immaculate optimization pass can focus on end-to-end Q latency while keeping a separate eye on the much smaller runner-path latency budget
- future drift work can add new mixed-pressure scenarios and still keep one explicit receipt showing whether Q drifted, Immaculate drifted, or neither did

### 2026-04-17

#### Public W&B truth no longer conflates the historical 60m soak lane with the latest published benchmark

What changed:
- the repo-local `Q` mediation benchmark was rerun clean again with `0` failed assertions while the runner path stayed bounded through the structured Q gateway path
- the stitched `Q-Benchmark-Sweep-60m` generator now explicitly separates the newest W&B publication from the historical 60-minute soak lane instead of letting the old hour-class page read like the latest publish
- the README, wiki home, and website now point readers to `Benchmark-Status` and `Benchmark-Wandb-Export` for the newest published W&B result, while treating `Q-Benchmark-Sweep-60m` as historical hour-class evidence unless that pack is rerun
- the public training/release story is restamped on the active `bench-v14` Q line with `54` benchmark rows and `6` strict failure seeds

Why it matters:
- the missed systems pattern was not missing data, but surface confusion: the repo already had a newer April 17 W&B export while one historical hour-class page was still making it easy to misread April 12 as the newest W&B benchmark
- separating “latest published W&B result” from “last rerun of the 60m soak pack” matters because public evidence pages must stay precise about what is current and what is historical
- restamping the active Q line matters because public copy that still says `bench-v13` or `49` rows quietly breaks trust even when the generated evidence has already moved on

Evidence:
- `apps/harness/src/q-benchmark-sweep-report.ts` now emits both the latest W&B publication and the historical 60m soak lane with an explicit truth boundary
- `docs/wiki/Benchmark-Status.md` and `docs/wiki/Benchmark-Wandb-Export.md` still show the latest tracked W&B export on `2026-04-17`
- `docs/wiki/Q-Benchmark-Sweep-60m.md` now carries the historical 60m soak wording instead of reading like the default latest W&B page
- `README.md`, `docs/wiki/Home.md`, and `apps/dashboard/app/ui/landing-page.tsx` now call out the April 17 W&B export and the active `bench-v14` / `54`-row Q line in plain English

What this unlocks next:
- future W&B refreshes can land without forcing people to reverse-engineer which page is “latest” and which page is “historical pack evidence”
- the next published hour-class soak rerun can update the historical lane cleanly without confusing it with the default latest-publication surface
- public performance conversations can stay anchored to the right evidence page before the next Q fine-tune or Cloudflare evaluation pass starts

### 2026-04-17

#### Q now answers as Q, Immaculate routes to healthy local Q first, and the tracked bundle moved forward to bench-v13

What changed:
- the direct Q identity path now answers canonically as `Q`, `Arobi Technology Alliance`, `Gaetano Comparcola`, `Gemma 4`, and `Immaculate`, even when the user asks compound identity-and-harness questions
- Immaculate now carries a real Q orchestration context and uses a Q routing directive so a healthy local Q lane is treated as the primary governed lane instead of being displaced by a blocked cloud lane
- the active Q lock, hybrid session, benchmark corpus, failure corpus, Cloudflare profile, and cloud bundle surfaces were all promoted and restamped onto the tracked `bench-v13` lineage
- the public website, README, and wiki home now tell the same Q-only story in plain English, with the canonical identity gate and the governed local-Q lane called out explicitly

Why it matters:
- the missed systems pattern was that Q had already become the real product identity, but one compound question path and one routing branch were still letting the system behave as if Q were only a prompt wrapper around a generic execution slot
- fixing the identity path matters because a custom model stops being a real product the moment it forgets who it is under mixed operator prompts
- fixing the routing branch matters because a blocked cloud lane should not downgrade a healthy local Q lane into an artificial review hold
- moving the tracked bundle to `bench-v13` matters because the next fine-tune and the next orchestration pass now point at the repaired benchmark and failure surfaces that actually exist today

Evidence:
- `apps/harness/src/q-model.ts` now canonicalizes compound identity questions back to the full Q identity answer
- `apps/harness/src/q-orchestration-context.ts` and `apps/harness/src/routing.ts` now carry and honor an explicit Q routing directive
- `docs/wiki/Q-Gateway-Validation.md` now records a green canonical identity smoke on the current tracked build
- `docs/wiki/Release-Surface.md` now points at `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v13-848d44f-beff091d` and the paired Immaculate bundle `immaculate-orchestration-848d44f-1366c487`
- `docs/wiki/Q-Benchmark-Corpus.md` now records `49` benchmark rows and `docs/wiki/Q-Failure-Corpus.md` now records `6` live eval seeds on the same tracked line

What this unlocks next:
- the next Q fine-tune can train harder on real harness reasoning and identity continuity instead of spending another pass on product-name cleanup
- the next Immaculate routing pass can use Q-aware directives earlier in mediation instead of letting Q-awareness live mostly in rationale text
- future public benchmark and release surfaces can stay Q-only without drifting back to old bundle IDs or stale lane semantics

### 2026-04-17

#### Immaculate now treats Q as a governed first-class execution lane instead of a generic model slot

What changed:
- Q now has an explicit orchestration context that carries identity, readiness, gateway-substrate health, cloud-lane status, and the active training bundle into arbitration and scheduling
- the public `/api/q/run` path no longer leaks resolved upstream model strings into user-visible responses or audit records; public identity is always `Q`, with `Gemma 4` kept as the foundation label
- the active Q training lock now carries explicit identity and Immaculate-reasoning seeds, and the current tracked bundle is always machine-stamped on `docs/wiki/Release-Surface.md`
- the paired Immaculate orchestration bundle is also machine-stamped on `docs/wiki/Release-Surface.md`

Why it matters:
- the missed systems pattern was that Q already had the right structure contract, but Immaculate was still reasoning about a generic execution lane in places where it should have been reasoning about Q specifically
- once Q readiness, gateway health, and cloud-lane blockage become explicit orchestration inputs, Immaculate can choose safer local governed execution before a degraded cloud lane or ambiguous route causes operator confusion
- fixing the public identity leak matters because a custom model stops being a real product the moment the public surface starts naming upstream internals instead of the governed product users are actually calling

Evidence:
- `apps/harness/src/q-orchestration-context.ts` now resolves a grounded Q context from release state, readiness, substrate health, and cloud-lane state
- `apps/harness/src/arbitration.ts` and `apps/harness/src/scheduling.ts` now accept Q context and record Q-aware rationale in their decisions
- `apps/harness/src/server.ts` now emits `Q` as the public model name on `/api/q/run` success and failure paths
- `docs/wiki/Release-Surface.md` now points at the current tracked Q bundle, corpora, hybrid session, and paired Immaculate orchestration bundle

What this unlocks next:
- the next Q fine-tune can optimize real Q-and-Immaculate reasoning instead of only prompt-format compliance
- the next Immaculate routing pass can become Q-aware by policy, not just Q-aware by prompt text
- future public benchmark surfaces can stay Q-only without leaking upstream implementation labels back into the product story

### 2026-04-17

#### The Q hot path now spends less time on disk and routing overhead, and the active training lock has moved forward to bench-v2

What changed:
- the dedicated Q gateway stopped rewriting its API-key store on every successful request and now only flushes usage metadata on a bounded cadence
- that same key-store path now reloads and merges external key changes safely, so validator-created keys work across processes instead of being lost behind a stale in-memory cache
- the direct Q path now uses keep-alive HTTP agents into the local Q backend, and the Q-specific prompt path is more compact and more grounded in explicit facts instead of wasting tokens on generic context
- Immaculate worker selection now reuses node, peer, and execution-outcome views inside a batch instead of rebuilding that context for every reservation
- the Cloudflare eval lane now follows the latest hybrid session automatically, builds a stratified eval bundle, and publishes explicit readiness buckets instead of one vague ready/not-ready flag
- the active Q lock is now `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v2-3c3e41d-766c8ccf`, paired with Immaculate bundle `immaculate-orchestration-3c3e41d-7aa3136b`

Why it matters:
- the missed systems pattern was that Q already had the right structure contract, but too much latency and too much operator ambiguity were still coming from glue code around the model rather than the model alone
- cutting repeated disk writes and repeated routing-context rebuilds matters because it removes avoidable latency tax from both the public Q edge and the governed Immaculate substrate seam
- fixing cross-process key-store visibility matters because a gateway that cannot see newly created keys is not actually production-safe, even if its first validation pass looks green
- promoting to `bench-v2` matters because the next training run now points at the repaired `19`-row benchmark corpus and the newest gateway/substrate truth instead of the older `bench-v1` snapshot

Evidence:
- `docs/wiki/Q-Gateway-Validation.md` now shows `/health 200`, authenticated `/api/q/info 200`, authenticated `/v1/models 200`, authenticated chat `200`, concurrent rejection `429`, and only `80.64 ms` gateway-added latency on the latest loopback pass
- `docs/wiki/Q-Gateway-Substrate.md` now records `0` failed assertions, `10400.27 ms` gateway-latency P95, and `2.11 ms` arbitration-latency P95 on the current `bench-v2` lock
- `docs/wiki/Model-Benchmark-Comparison.md` now records direct Q at `4/4` with `24527.89 ms` average latency and `51935 ms` P95
- `docs/wiki/BridgeBench.md` now records direct Q at `4/4` with `13108.23 ms` average latency and `16837.2 ms` P95
- `docs/wiki/Cloudflare-Q-Inference.md` now follows session `q-hybrid-harbor-opt-2384cf5-bench-v2` and publishes explicit `authReady`, `adapterReady`, `workerReady`, `evalBundleReady`, and `smokeReady` state
- `docs/wiki/Release-Surface.md` now points at the promoted `bench-v2` Q bundle and the paired Immaculate orchestration bundle

What this unlocks next:
- the next Q fine-tune can target the real remaining gap, which is Harbor grounding and operator phrasing, without wasting effort on gateway or routing glue that is already tightened
- the next Cloudflare pass can focus on auth and adapter artifact generation instead of fighting stale session selection and shallow readiness reporting
- future live gateway validations can add or revoke keys during the run without breaking the gateway's own contract proof

### 2026-04-17

#### The OCI cloud lane moved past the missing-CSI blocker, and the next real limit is Oracle support-domain authorization

What changed:
- the OCI region-capacity probe now sources the support CSI from the saved operator env and runs the real support-backed limit-request path instead of stopping early on missing local input
- the repo's tracked OCI surfaces now record the real post-CSI blocker from Oracle Support: `The Requested Domain was not found or not Authorized`
- the paired hybrid-session and release surfaces were restamped so the current Q and Immaculate cloud lanes describe the same OCI boundary everywhere

Why it matters:
- the missed systems pattern was that "missing CSI" and "cannot create the incident" are not the same class of blocker; once CSI is present, the next problem is no longer local wiring, it is support-account authorization
- that matters because the next operator move changes completely: the repo no longer needs more CSI plumbing, it needs Oracle support-domain binding fixed or the limit request opened manually in OCI/My Oracle Support
- keeping that distinction explicit protects the cloud lane from fake optimism and protects the repo copy from blaming the wrong missing input

Evidence:
- `docs/wiki/OCI-Region-Capacity.md` now records `createPrerequisitesMet: true`, `createPossible: false`, and the incident error `The Requested Domain was not found or not Authorized`
- `docs/wiki/Q-Hybrid-Training.md` now carries the same OCI support boundary inside the active hybrid session
- `docs/wiki/Release-Surface.md` and `docs/wiki/Q-Readiness-Gate.md` were restamped after the OCI probe so the latest build surfaces point at the same current session state

What this unlocks next:
- the OCI lane is now one support-account fix away from a real region-limit escalation attempt instead of being blocked on unknown local wiring
- HF Jobs and OCI can now be compared honestly as separate external blockers: Hugging Face credits on one side, Oracle support-domain authorization on the other
- the next cloud move can focus on the real provider boundary instead of re-auditing whether CSI ever made it onto the controller

### 2026-04-16

#### The Q cloud lane now stages the promoted bench-v1 bundle truthfully, and the next real blocker is billing rather than fake session state

What changed:
- the hybrid session controller no longer treats a missing legacy `training-data/run.json` provenance artifact as a hard blocker when the active Q lock, mix manifest, benchmark corpus, and failure corpus are already concrete
- the benchmark-promotion path now compares the benchmark corpus against the SHA recorded in the active mix manifest instead of trusting the current file at the same path, so it can actually mint the next bench lineage when the corpus grew underneath the old lock
- that promotion path produced a new locked bundle `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v1-45280d5-a181f850`, a new `32`-row Q dataset, and a new hybrid session `q-hybrid-harbor-opt-2384cf5-bench-v1`
- the promoted HF Jobs lane now stages that exact bench-v1 cloud bundle on the real Hugging Face dataset repo and records the provider response in `docs/wiki/HF-Jobs-Training.md`
- both the HF Jobs runner and the OCI training runner now bootstrap the Python Q training stack in `train` mode, so the next paid launch is prepared to execute the trainer instead of failing immediately on missing imports

Why it matters:
- the missed systems pattern was that the repo had enough real state to stage a cloud bundle, but one stale provenance assumption and one benchmark-promotion shortcut were still forcing the cloud lane to look fake
- removing the false curation blocker matters because the cloud bundle can now be built from the tracked lock, config, mix, benchmark corpus, failure corpus, and paired Immaculate bundle that actually define the active Q run
- fixing the SHA comparison matters because the repo can now honestly roll forward when the benchmark corpus changes, instead of pretending an older lock already includes evidence it never saw
- the remote bootstrap matters because the next real cloud train should fail only on provider, billing, or model issues, not on an avoidable missing-package error

Evidence:
- `docs/wiki/Q-Benchmark-Promotion.md` now records `status: promoted` and the new bench-v1 bundle `q-defsec-code-longctx-harbor-opt-2384cf5-bench-v1-45280d5-a181f850`
- `docs/wiki/Q-Hybrid-Training.md` now records session `q-hybrid-harbor-opt-2384cf5-bench-v1`, a `32`-row dataset, and a real cloud bundle tarball staged under the session root
- `docs/wiki/HF-Jobs-Training.md` now records the promoted bench-v1 archive path and the real provider blocker: `402 Payment Required` from Hugging Face Jobs because prepaid credits are insufficient
- `docs/wiki/Release-Surface.md` now points at the bench-v1 lock and the paired Immaculate orchestration bundle `immaculate-orchestration-45280d5-55187c4d`

What this unlocks next:
- once HF prepaid credits are available, the same staged bench-v1 session can be rerun without rebuilding the training state from scratch
- the next paid HF Jobs launch can use `train` mode with the remote bootstrap already wired in
- if OCI launch targets become available first, the OCI lane can reuse the same promoted session bundle and the same dependency bootstrap instead of forking the training path again

### 2026-04-16

#### The Q improvement loop now has two new live evidence seams: a gateway-to-substrate benchmark and a private Q API audit spool

What changed:
- the repo now carries a dedicated `q-gateway-substrate` benchmark pack that starts the real Q gateway, proves auth and concurrency behavior, runs structured Q scenarios, and checks that the result survives handoff into Immaculate arbitration
- that seam now publishes `docs/wiki/Q-Gateway-Substrate.md` and `docs/wiki/Q-Gateway-Substrate.json` with real measured values instead of burying the handoff inside a broader benchmark page
- the private `/api/q/run` path now writes a real audit spool, and the repo now publishes it through `docs/wiki/Q-API-Audit.md` and `docs/wiki/Q-API-Audit.json`
- the strict Q failure corpus now ingests unique live Q API failures, so prompt-size and request-shape failures can become repair seeds instead of vanishing into runtime logs
- the latest release surface now points at the newest measured Immaculate orchestration bundle `immaculate-orchestration-9bc2e59-55187c4d` instead of only the older bundle frozen into the last hybrid-session page

Why it matters:
- the missed systems pattern was that Q had benchmark pages and a harness route, but not one clean page proving the gateway-to-arbitration seam and not one clean loop carrying live Q API failures back into the training/eval path
- the seam benchmark matters because it proves Q is not only parsing local tasks; it is surviving the real product handoff from a bounded public edge into governed Immaculate arbitration
- the audit spool matters because it turns private-harness Q failures into usable evidence instead of dead telemetry
- together they make the next optimization pass more concrete: benchmark successes can reinforce the benchmark corpus, while live edge failures can enter the strict failure corpus with no manual transcription step

Evidence:
- `docs/wiki/Q-Gateway-Substrate.md` now records `0` failed assertions, `3` structured fields at P50, `29037.75 ms` gateway-latency P95, and `77.04 ms` arbitration-latency P95
- `docs/wiki/Q-API-Audit.md` now records `5` raw audit records across `transport_timeout`, `missing_prompt`, and `prompt_too_large`
- `docs/wiki/Q-Benchmark-Corpus.md` now reports `20` tracked benchmark rows
- `docs/wiki/Q-Failure-Corpus.md` now reports `6` strict eval seeds with `8` resolved successes excluded
- `docs/wiki/Release-Surface.md` now stamps the latest Immaculate orchestration bundle as `immaculate-orchestration-9bc2e59-55187c4d`

What this unlocks next:
- the next Q optimization pass can target the gateway-to-arbitration seam directly instead of treating the public edge and the substrate as separate mysteries
- the next hybrid or cloud run can use a corpus that now includes both benchmark observations and unique live harness-edge failures
- future regressions on the private Q edge can become tracked repair work within one repo cycle instead of waiting for another manual incident writeup

### 2026-04-16

#### Q's grounding pass now removes the BridgeBench timeout class and cuts the next locked training bundle straight from the repaired benchmark surfaces

What changed:
- the direct Q prompt path was tightened to force shorter grounded route/reason/commit outputs instead of long soft language
- the Harbor Q agent prompt was tightened with real task-grounded examples so the model gets graded on the exact failure facts instead of generic caution
- the Q benchmark corpus now keeps successful Harbor and BridgeBench evidence in a governed `19`-record corpus while the strict failure corpus now carries only `3` live eval seeds
- the next locked Q bundle is now `q-defsec-code-longctx-harbor-opt-2384cf5-2384cf5-57097d65`, and the paired Immaculate orchestration bundle is now `immaculate-orchestration-2384cf5-497211ed`

Why it matters:
- the missed pattern was that the benchmark pages already told us what to optimize next, but the repo still had one timeout-class failure sitting in the direct Q lane and no clean lock tied to the repaired evidence
- removing that timeout class matters because it converts BridgeBench from a parser-and-timeout story into a real structure-and-grounding story
- the new lock matters because it ties the next Q run to the measured pages that actually improved, not to an older bench-v3 snapshot from another checkout

Evidence:
- `docs/wiki/Model-Benchmark-Comparison.md` now shows direct Q at `4/4` with `27913.26 ms` average latency and `51167.09 ms` P95
- `docs/wiki/BridgeBench.md` now shows direct Q at `4/4` with `18661.35 ms` average latency, `21430.91 ms` P95, and `0` bridge-runtime assertion failures
- `docs/wiki/Harbor-Terminal-Bench.md` now shows `0.950` on `q-structured-contract` and `0.925` on `immaculate-bridge-fail-closed`
- `docs/wiki/Q-Benchmark-Corpus.md` now reports `19` records, and `docs/wiki/Q-Failure-Corpus.md` now reports `3` live eval seeds with `8` resolved successes excluded

What this unlocks next:
- the next Q cloud run can target a real repaired lock instead of a stale bench-v3 lineage
- the next Immaculate orchestration pass can train against the current `14`-signal orchestration bundle instead of an older cross-checkout artifact
- future benchmark regressions can be turned into either corpus observations or strict failure seeds immediately, instead of waiting for another manual bundle refresh

### 2026-04-16

#### The official Terminal-Bench receipt now feeds the Q repair loop instead of stopping at publication

What changed:
- the Q benchmark corpus builder now ingests `docs/wiki/Terminal-Bench-Receipt.json` as observation evidence instead of ignoring the official public receipt after publication
- the strict Q failure corpus builder now turns the official public-task underperformance into a real eval seed alongside live direct-Q failures
- the training docs and release index now reflect that the public receipt is part of the Q improvement loop, not just a public proof artifact

Why it matters:
- the missed systems pattern was that a public benchmark receipt is only half-useful if it proves the path is real but never enters the training/eval seam that should improve the model next
- this closes that gap with a truthful split: the receipt enters the benchmark corpus as observation evidence and the failure corpus as a strict eval seed, without pretending it was a successful decision row
- that makes the public proof path operationally useful, because the same official failure now feeds the next Q repair cycle instead of sitting in docs as static evidence

Evidence:
- `docs/wiki/Q-Benchmark-Corpus.md` now lists `terminal-bench-receipt` as a tracked source
- `docs/wiki/Q-Failure-Corpus.md` now records `terminal_bench_public_task_underperforming` as a live eval seed
- `.training-output/q/q-benchmark-corpus.jsonl` now includes `terminal-bench-receipt:aggregate`
- `.training-output/q/q-failure-corpus.jsonl` now includes `terminal-bench-receipt:terminal-bench/make-mips-interpreter`

What this unlocks next:
- the next Q promotion or training session can consume official public-task evidence without a manual side export
- future official Terminal-Bench receipts can accumulate into the same governed Q improvement loop instead of living only in one-off PR pages
- the repo can now tell a cleaner story: public proof, eval seed, and training input are part of one chain instead of three disconnected surfaces

### 2026-04-16

#### Q now has a real official public-task Terminal-Bench receipt submission, not just repo-local Harbor proof

What changed:
- the real `Q` lane was run through Harbor against the official public Terminal-Bench task `terminal-bench/make-mips-interpreter`
- the run used the real Harbor custom-agent import path `benchmarks.harbor.q_harbor_agent:HarborQAgent` and the real served `Q` endpoint, not the oracle lane and not a repo-local hidden task pack
- a five-trial receipt package was assembled in the official leaderboard submission layout and submitted as a PR/discussion on the public `harborframework/terminal-bench-2-leaderboard` dataset repo
- the repo now publishes that receipt separately in `docs/wiki/Terminal-Bench-Receipt.md` instead of blurring it into the repo-local Harbor page

Why it matters:
- this closes the last “prove it on the official path” gap for the current `Q` lane: the repo can now point to a real public-task submission receipt instead of only local Harbor evidence
- it also keeps the truth boundary intact: official submission mechanics are now proven, but public-task performance is still poor and needs more model work
- that distinction matters because a receipt proves the evaluation and packaging path is real, while the score still tells the hard truth about current model quality

Evidence:
- Hugging Face discussion/PR: `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/discussions/140`
- Hugging Face verified commit: `https://huggingface.co/datasets/harborframework/terminal-bench-2-leaderboard/commit/9a4ad15564f2a3c1303da7c89a08dc10cfec36c3`
- official public task: `terminal-bench/make-mips-interpreter`
- receipt trial count: `5`
- official receipt mean reward: `0.000`

What this unlocks next:
- future Q improvement work can target a real public-task benchmark receipt instead of only a repo-local proxy
- once Q improves, the same official packaging path can be reused for stronger public receipts or broader leaderboard submissions without rebuilding the tooling
- the repo can now keep two benchmark languages honest at once: local Harbor task packs for targeted diagnosis, and official public-task receipts for public proof

### 2026-04-16

#### Harbor now measures the real Q lane against hidden-answer task images, and the post-fix results expose Q's real improvement ceiling

What changed:
- the repo-local Harbor task pack now measures the real Q lane with RewardKit plus the local Q LLM judge on both structured tasks
- the lingering `environment/reference.json` copy path is gone, so the published Harbor surface can truthfully claim the answer key is not present under `/app`
- the Harbor verifier path now runs RewardKit plus the local Q LLM judge by default on both structured tasks
- the live Q lane now runs through a purpose-built Harbor agent that calls the real Q gateway directly and writes the task artifact into the workspace
- the repo now publishes the hardened-task Harbor results in `docs/wiki/Harbor-Terminal-Bench.md` and `docs/wiki/Harbor-Terminal-Bench.json`

Why it matters:
- the missed benchmark-integrity bug was that the task image still had a path that could place the answer key inside `/app`, so the publication surface needed one more hardening pass before it was fully defensible
- removing that last copy path changes the benchmark from a nearly-correct theater surface into a defensible one: oracle still scores `1.000`, and Q now has to earn its score without a co-located answer key
- the new measured result is more valuable because it is better and still incomplete: Q passes the structure/programmatic lane strongly and improved its LLM-judged wording, but it still underperforms on the tightest operator-grade grounding
- this is the kind of truth surface that actually helps training, because it tells you what to improve next instead of just proving the parser works

Evidence:
- `harbor-q-oracle-fixed` and `harbor-immaculate-oracle-fixed` both score `1.000` on the hidden-reference task pack
- `harbor-q-agent-fixed` scores `0.8167` on the Q structured-contract task with `0.9333` programmatic and `0.7000` LLM-judge
- `harbor-immaculate-agent-fixed` scores `0.8500` on the Immaculate bridge fail-closed task with `1.0000` programmatic and `0.7000` LLM-judge
- `docs/wiki/Harbor-Terminal-Bench.md` now records the fixed live jobs, durations, structured responses, and the benchmark truth boundary

What this unlocks next:
- Q fine-tuning can now target the real gap: operator precision and tighter fact-grounding, not just schema compliance
- future Harbor packs can expand without leaking their own gold outputs into `/app`
- the repo can publish Terminal-Bench-style results honestly while keeping the boundary explicit that this is still a repo-local Harbor pack, not a public leaderboard submission

### 2026-04-14

#### Q benchmark promotion is now a one-command truthful control loop instead of a manual file-edit ritual

What changed:
- the repo now carries `training/q/promote_q_benchmark_lineage.py` plus `npm run q:training:promote-benchmark`
- that command checks whether the active locked Q bundle already carries the current benchmark corpus hash and only cuts a new bench lineage when the active lock is stale against it
- the command now writes `docs/wiki/Q-Benchmark-Promotion.md` and `docs/wiki/Q-Benchmark-Promotion.json` so the repo publishes the automation state instead of leaving it implicit in operator notes
- the release surface now stamps that promotion page as another tracked Q training evidence surface

Why it matters:
- the missed operational pattern was that benchmark promotion was technically reproducible but still fragile because it depended on hand-edited config, mix, and session files
- a truthful promotion loop needs two modes: promote when the benchmark corpus changed, and explicitly no-op when the active bundle is already current
- this closes the last manual gap between benchmark-derived Q evidence and the locked training lineage without encouraging fake bench-v2 churn when nothing actually changed
- publishing the promotion state matters because a reproducible internal automation step is weaker if the repo cannot show whether it actually ran or whether it intentionally decided not to move

Evidence:
- `npm run q:training:promote-benchmark` now materializes `docs/wiki/Q-Benchmark-Promotion.md` and `docs/wiki/Q-Benchmark-Promotion.json`
- the active bench-v1 lock already includes `.training-output/q/q-benchmark-corpus.jsonl`, so the promotion loop can now report `already-current` honestly instead of fabricating another lock version
- `docs/wiki/Release-Surface.md` now includes the benchmark-promotion surface in the stamped evidence list

What this unlocks next:
- future benchmark corpus refreshes can roll into the next Q training lineage with one command instead of an error-prone series of copied files
- operators can see immediately whether the locked Q bundle is stale against the benchmark corpus before they waste time on a local or cloud training run
- the next real high-value move can shift from training prep mechanics back to actual local bench-v1 dry-run or cloud auth completion because the promotion seam is no longer hand-managed

### 2026-04-14

#### The benchmark-derived Q corpus is now part of the tracked locked mix, not just a side surface

What changed:
- the next Q mix now includes `.training-output/q/q-benchmark-corpus.jsonl` as a real supplemental alongside the BridgeBench seed set and the coding/long-context seed set
- the repo generated a new versioned mix, config, and lock under the `bench-v1` lineage instead of mutating the earlier long-context lock in place
- the latest hybrid session now points at that expanded `1023`-row Q dataset and stages the benchmark corpus into the cloud bundle as part of the tracked bench-v1 session
- the release surface now exposes the mix supplemental count and the exact supplemental paths carried by the current Q training lock

Why it matters:
- the missed pattern was that a benchmark-derived corpus page alone still leaves a gap between published evidence and the locked training inputs that a future local or cloud run will actually consume
- by moving the benchmark corpus into the real mix seam, the repo now closes that gap with one reproducible path: benchmark surface -> JSONL supplemental -> mix manifest -> versioned lock -> hybrid session bundle
- versioning this as `bench-v1` preserves the earlier long-context lock as a historical artifact while making the stronger dataset lineage explicit
- this gives the next Q fine-tune pass a higher-signal stability supplement without pretending those benchmark rows replace the governed curated base corpus

Evidence:
- `.training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c-bench-v1.manifest.json` now records three supplemental inputs, including `.training-output/q/q-benchmark-corpus.jsonl`
- `.training-output/q/locks/q-training-lock-q-defsec-code-longctx-cur-fnv1a-8f551a5c-bench-v1.json` now binds the bench-v1 mix hash, config hash, and curation provenance into one versioned lock
- `docs/wiki/Q-Hybrid-Training.md` now shows the bench-v1 session, `1023` dataset rows, and the benchmark corpus as part of the same tracked Q fine-tune lane
- `docs/wiki/Release-Surface.md` now stamps the new Q bundle id and lists the benchmark corpus supplemental in the Q training bundle section

What this unlocks next:
- the next local or cloud Q run can train against the benchmark-expanded locked mix without a second manual “add the benchmark rows” step
- future benchmark corpus refreshes can be promoted into new lock versions cleanly instead of overwriting one ambiguous latest mix
- the cloud lane now has a stronger staged input set ready the moment OCI auth and launch-target OCIDs are actually present

### 2026-04-14

#### Q now has a tracked benchmark corpus surface, and the hybrid training path can point to it directly instead of inferring corpus state from raw benchmark pages

What changed:
- the repo now generates `docs/wiki/Q-Benchmark-Corpus.md` and `docs/wiki/Q-Benchmark-Corpus.json` from the executed Q-only benchmark/report surfaces
- the new corpus builder turns successful direct-Q and Harbor Q decision rows into a tracked JSONL export under `.training-output/q/q-benchmark-corpus.jsonl`
- the hybrid session runner now materializes that benchmark corpus automatically, stamps it into the Q fine-tune lane, and stages it into the cloud bundle next to the lock, config, dataset, and Immaculate orchestration bundle
- the release surface, README, wiki home, and training docs now link the benchmark-derived corpus explicitly instead of leaving it implicit inside raw report pages

Why it matters:
- the missed pattern was that the repo had a strict failure-only surface but no first-class way to reuse successful executed Q decisions without scraping multiple benchmark pages by hand
- a tracked benchmark corpus keeps the truth boundary clean: successful benchmark-derived rows and failure-only rows are now separate surfaces with different meanings
- staging the benchmark corpus through the hybrid session means the cloud lane can see the same tracked benchmark-derived evidence as the local lane instead of depending on whichever docs happened to be copied over
- this gives the training path a higher-signal self-distillation lane for route/reason/commit consistency without pretending those rows replace broader curation

Evidence:
- `npm run q:benchmark:corpus` now emits `.training-output/q/q-benchmark-corpus.jsonl` plus `docs/wiki/Q-Benchmark-Corpus.md` and `docs/wiki/Q-Benchmark-Corpus.json`
- `training/q/run_q_training_session.py` now carries `benchmarkCorpusPath` in the Q session summary and includes the benchmark corpus in the staged cloud bundle
- `apps/harness/src/release-surface.ts` now stamps the benchmark corpus under `## Current Evidence Surfaces`
- the README and wiki home now expose the benchmark corpus as a first-class tracked Q training surface

What this unlocks next:
- the hybrid session can now hand a remote GPU lane the current benchmark-derived Q corpus without a second manual export step
- future benchmark reruns can refresh the Q training support surface directly, not just the human-readable report pages
- the repo can keep Q-Failure-Corpus strict while still carrying a tracked success/stability corpus for Q training work

### 2026-04-14

#### The hybrid session can now carry a real OCI cloud-launch path, and the hidden controller/runtime mismatch is closed instead of hand-entered each run

What changed:
- the hybrid session runner now understands `cloud.envFilePath`, `cloud.inlineEnv`, canonical HF/W&B/OCI identifiers, and a staged cloud bundle instead of relying only on the live shell
- the repo now carries a dedicated `deploy/oci-training/` bundle with an OCI launcher, a remote training runner, a Vault-oriented secret fetcher, and a cloud-init template
- the cloud lane now stages the exact locked session inputs into a tarball so a remote GPU node can train the tracked bundle instead of booting with no access to the local dataset
- the OCI controller logic now prefers the real CLI env names `OCI_CLI_CONFIG_FILE` and `OCI_CLI_PROFILE` while keeping backward compatibility with the older shorthand names already used in the repo

Why it matters:
- the missed systems pattern was that a cloud launch command without a staged session bundle is theater, because the remote node still cannot see the exact local lock, config, and dataset
- the second missed pattern was that the repo's earlier cloud checks mixed controller auth and remote runtime auth into one vague readiness guess
- env-file sourcing matters because secrets and target OCIDs should not have to be re-exported into the shell by hand every time a session is launched
- correcting the OCI CLI env names closes a subtle but real operator bug: the old `OCI_CONFIG_FILE` and `OCI_PROFILE` names were not the real CLI defaults even though they looked plausible

Evidence:
- `training/q/run_q_training_session.py` now emits a cloud bundle and stamps env-file plus OCI launch-target state into `docs/wiki/Q-Hybrid-Training.md`
- `deploy/oci-training/scripts/launch-oci-q-training.sh` now uploads the staged session bundle to Object Storage and launches the OCI compute node with rendered cloud-init metadata
- `deploy/oci-training/scripts/run-immaculate-q-training.sh` now downloads the staged bundle on the remote node and runs the tracked session manifest instead of an unbound ad hoc config
- `docs/wiki/OCI-Q-Training.md` now records the cloud-launch boundary in operator-facing terms

What this unlocks next:
- the same hybrid session id can now drive the controller-side OCI launch and the remote-node training execution without inventing a second state model
- once the missing OCI auth and target OCIDs are present, the current session can move from `not-configured` to a real launched GPU lane without changing the repo contract again
- future cloud runs can be tied back to one staged session bundle hash instead of vague notes about what was “probably uploaded”

### 2026-04-14

#### Q now has a real hybrid training session surface, and Immaculate gained a truthful orchestration-training bundle instead of a vague “train the system” claim

What changed:
- the repo now carries a session-level Q training controller in `training/q/run_q_training_session.py` plus a committed example manifest in `training/q/hybrid_training_session.example.json`
- the repo now builds an Immaculate orchestration-training bundle from live Harbor, BridgeBench, model-comparison, gateway-validation, and readiness-gate surfaces through `training/immaculate/build_immaculate_training_bundle.py`
- the latest session now writes a tracked wiki surface so the repo can say which parts of a hybrid local/cloud session are actually ready and which are still blocked
- the release surface now ties the current build to the latest hybrid session instead of only the lock file

Why it matters:
- the missed pattern was that a training lock alone is not enough once local prep, cloud launch intent, and orchestration-improvement signals can drift independently
- a hybrid session means one id can now tie together the Q fine-tune lane and the Immaculate orchestration lane without pretending they are the same thing
- this keeps the cloud boundary honest: local preparation can be complete while the cloud lane stays explicitly `not-configured` until provider auth and launch tooling are really present
- “train Immaculate” is now translated into something the repo can defend technically: an orchestration bundle grounded in measured control-plane evidence, not mythology about hidden weights

Evidence:
- `npm run immaculate:training:bundle` now emits a tracked orchestration bundle under `.training-output/immaculate/`
- `npm run q:training:doctor -- --session ...` now materializes one hybrid session summary and stamps `docs/wiki/Q-Hybrid-Training.md`
- `npm run q:training:session -- --session ... --launch` can now run the local Q lane while keeping the cloud lane truthful about readiness
- `npm run release:surface` now includes the latest hybrid training session in the machine-stamped release page

What this unlocks next:
- a real cloud Q fine-tune launch can now plug into an already-tracked session instead of inventing a parallel state model
- Immaculate eval and routing improvements can be tied back to one orchestration bundle id instead of scattered benchmark screenshots
- future release notes can talk about one session artifact for Q plus Immaculate instead of separate undocumented prep steps

### 2026-04-14

#### Harbor now has a real Immaculate/Q task pack, and the hidden 300-second Q gateway ceiling was removed instead of worked around

What changed:
- the repo now carries a real Harbor task pack under `benchmarks/harbor/` for two strict terminal tasks: `q-structured-contract` and `immaculate-bridge-fail-closed`
- the Harbor agent path for `Q` now runs through the dedicated OpenAI-compatible Q gateway instead of a fake local stub
- the local Q transport now uses explicit Node `http`/`https` request handling with a controlled timeout instead of the older `fetch` path that quietly died around five minutes
- the repo now generates `docs/wiki/Harbor-Terminal-Bench.md` and `docs/wiki/Harbor-Terminal-Bench.json`, tying Harbor results back to the release/build surface

Why it matters:
- the missed failure pattern was not in Harbor or in the task pack; it was the gateway transport itself, which was cutting off long Q completions at roughly `300` seconds even when the direct local Q backend could still finish honestly
- removing that ceiling means the served Q edge is no longer weaker than the underlying model for longer structured completions
- the Harbor pack gives the repo a second benchmark language beyond BridgeBench/model comparison: terminal tasks with an oracle baseline, a real Q agent lane, and RewardKit scoring
- this is the first repo-local pass where Harbor, the Q gateway, and the benchmark publication story all line up on the same truthful surface

Evidence:
- `harbor-q-oracle-v7` and `harbor-immaculate-oracle-v7` both scored `1.000` under Harbor + RewardKit
- `harbor-q-agent-custom-v5` and `harbor-immaculate-agent-custom-v1` both scored `1.000` through the real Q gateway agent lane
- the same structured Q probe that previously failed around `300678` ms through the gateway succeeded directly against the local Q backend at `412787.48` ms, then succeeded through the repaired gateway at `8029.01` ms
- `npm run benchmark:harbor:report` now writes the Harbor benchmark page into `docs/wiki/Harbor-Terminal-Bench.md` and `docs/wiki/Harbor-Terminal-Bench.json`

What this unlocks next:
- Harbor task count can grow without guessing whether failures come from Q reasoning or from the serving transport
- a future LLM-judge lane can be reintroduced on top of a stable programmatic-scoring path instead of being the only gate
- repo-local Harbor results can now be promoted into external publication or leaderboard packaging without pretending the current pack already is that submission

### 2026-04-14

#### Immaculate and Q now share a machine-stamped release surface, and Q training gained a real lock artifact instead of filename-only drift

What changed:
- the repo now generates a shared `Release-Surface` page that stamps the current Immaculate build, commit, Q serving label, and latest tracked Q training bundle
- the Q training path now emits a sidecar mix manifest and a dedicated training lock file instead of relying on loose filenames
- the runtime Q info and gateway health surfaces now expose the current build stamp so docs and live processes can be compared directly
- the README and wiki home were rewritten in plainer language so a new reader can understand what the system does before reading the deeper operator docs

Why it matters:
- the missed infrastructure pattern was that “latest docs” are not enough when the model path, gateway path, and training path can drift independently
- a release/build stamp makes every report answer a basic audit question: which exact repo state produced this page
- a training lock makes the next cloud fine-tune replayable, because the dataset hash, mix manifest, config hash, and repo commit are bound together instead of implied by file names
- plain-language copy matters because evidence that cannot be understood by a non-specialist is weaker in procurement, review, and external collaboration

Evidence:
- `npm run release:surface` now writes `docs/wiki/Release-Surface.md` and `docs/wiki/Release-Surface.json`
- `training/q/build_q_mixture.py` now emits a sidecar `.manifest.json`
- `npm run q:training:lock` now writes a tracked lock under `.training-output/q/locks/` and refreshes `.training-output/q/latest-training-lock.json`
- the runtime Q surfaces now return release metadata in `/api/health`, `/api/q/info`, and the dedicated gateway `/health`

What this unlocks next:
- future Q report surfaces can be tied to one exact training bundle instead of “whatever was on disk”
- a cloud training run can now publish a single bundle ID back into docs, W&B notes, and release gating
- the repo can keep expanding without losing the ability to explain itself quickly to a non-operator

### 2026-04-14

#### Q gained a real long-context training lane and the Immaculate banner became a precise truecolor splash instead of ad hoc art

What changed:
- the startup banner renderer now uses a real 6-row ANSI Shadow `Immaculate` title with a fixed truecolor gradient instead of the older split blue/yellow custom block art
- the Q training bundle now carries a richer coding/long-context supplement in `training/q/coding_long_context_seed.json`
- the training mix builder can now accept multiple supplemental corpora in one run instead of forcing a single-seed path
- the repo now also carries `training/q/q_lora_config.long_context.example.json`, which raises the next Q LoRA target to an `8192` token context ceiling

Why it matters:
- the missed model-training pattern was that Q was improving on control-plane obedience faster than on coding depth and long-horizon synthesis, because the tracked seed path was still dominated by short bridge/runtime examples
- widening the supplement and the context ceiling makes the next cloud Q run target the actual remaining weakness: longer coding and repo-understanding tasks instead of only short structured-contract completion
- the banner change matters for a smaller but still real reason: the startup artifact is now precise, reproducible, and matched to the documented color treatment instead of hand-shaped art that drifted from the spec

Evidence:
- `npm run banner` now renders the exact 6-row truecolor ANSI Shadow title through `apps/harness/src/startup-banner.ts`
- `npm run training-data:curate -- fixtures/training/q-defsec-curation.example.json` produced `cur-fnv1a-8f551a5c` with `1001` curated rows and `2` secret findings skipped
- `python training/q/build_q_text_dataset.py --input .training-output/training-data/runs/cur-fnv1a-8f551a5c/curated-records.jsonl --output .training-output/q/q-train-cur-fnv1a-8f551a5c.jsonl` produced `1001` training rows
- `python training/q/build_q_mixture.py --base .training-output/q/q-train-cur-fnv1a-8f551a5c.jsonl --supplemental training/q/bridgebench_seed.json --supplemental training/q/coding_long_context_seed.json --output .training-output/q/q-mix-longctx-cur-fnv1a-8f551a5c.jsonl` produced `1013` rows
- `python training/q/train_q_lora_unsloth.py --config .training-output/q/q-lora-config-longctx-cur-fnv1a-8f551a5c.json --dry-run` passed on the new long-context mix

What this unlocks next:
- a cloud Q fine-tune run that actually targets coding repair, repo synthesis, and longer context windows
- future BridgeBench/model-comparison regressions can now be separated from the richer training lane instead of polluting the failure-only surface
- the documented banner artifact can now be reused in OCI/runtime surfaces without hand-copy drift

### 2026-04-14

#### Q gained a dedicated serving control loop, and the readiness gate is now green after the structured-contract fix

What changed:
- the dedicated Q gateway now carries a real primary-model circuit breaker with fail-closed behavior
- repeated primary failures can open the circuit and stop the gateway from hammering a dead upstream
- the repo now carries a direct-Q readiness gate that reads the tracked `Model-Benchmark-Comparison` and `BridgeBench` surfaces instead of inferring readiness from the gateway transport
- the direct-Q execution path now uses a Q-specific structured output budget and tail normalization so final route/reason/commit lines survive instead of dying inside self-commentary

Why it matters:
- the missed systems pattern was that model readiness and serving-edge health are two different control problems
- a public-ish inference edge needs a continuity path when the preferred model degrades, but that continuity path must not be allowed to masquerade as model readiness
- once the readiness gate and primary-failure circuit are separated, the repo can keep the API truthful for users without pretending the runtime is already release-clean
- the missed model-side pattern was that `Q` was spending too much of its output budget on meta reasoning before emitting the usable final answer, so the serving edge looked healthier than the direct contract lane

Evidence:
- `docs/wiki/Q-Readiness-Gate.json` now shows `ready: true` at threshold `0.75`
- `docs/wiki/Model-Benchmark-Comparison.json` now shows direct `Q` at `4/4` parse success
- `docs/wiki/BridgeBench.json` now also shows direct `Q` at `4/4` parse success with the bridge-runtime lane still green
- the dedicated gateway now records primary failure class and open-circuit state directly instead of obscuring a broken Q path
- `docs/wiki/Q-Gateway-Validation.json` still shows the normal direct Q gateway path green on auth, concurrency control, and sanitized output when the primary model is healthy enough for the short-form request

What this unlocks next:
- a private OCI Q edge that can stay available without falsely claiming the direct Q model is production-ready
- tighter public release policy where Q model promotion depends on the direct readiness gate instead of the gateway transport staying up
- a cleaner cloud fine-tune loop because the remaining weak spots can now be measured as true model regressions instead of mixed gateway/model noise

### 2026-04-14

#### Q failure export became a strict failure-only surface instead of a mixed success bucket

What changed:
- `training/q/build_q_failure_corpus.py` now exports only genuine failure rows from the direct-Q report surfaces
- resolved structured-contract successes are no longer serialized into the failure surface just because they came from the same tracked reports
- when direct `Q` is green, `Q-Failure-Corpus` now stays empty instead of overstating eight fake failure records

Why it matters:
- the missed systems pattern was that a failure page can quietly become misleading if it is repurposed as a general training bucket
- keeping the failure surface failure-only preserves its value as a release boundary instead of turning it into a mixed-status archive
- this keeps the repo honest about what is still broken versus what merely belongs in a future cloud training mix

Evidence:
- `docs/wiki/BridgeBench.json` now shows direct `Q` at `4/4` parse success with no dominant failure
- `docs/wiki/Model-Benchmark-Comparison.json` now shows the same `Q` lane at `4/4`
- `.training-output/q/q-failure-corpus.jsonl` is now empty on the current live run because there are no failure seeds to export
- `docs/wiki/Q-Failure-Corpus.json` now records `recordCount: 0` and `evalSeedCount: 0`

What this unlocks next:
- a reviewed cloud Q fine-tune pass that can wait for real failure evidence instead of training on fake negative examples
- future eval runs that can repopulate the failure-only corpus the moment a real regression appears
- a tighter boundary between benchmark prose, release policy, and training material, which is the right place to keep security and truthfulness separate

### 2026-04-14

#### Historical earlier 2026-04-14: Q split into a dedicated gateway, the live contract went green, and fake structured success stopped counting

What changed:
- the repo now contains a dedicated Q gateway server at `apps/harness/src/q-gateway.ts` instead of only the narrow Q route embedded inside the full harness
- the gateway exposes only `GET /health`, `GET /api/q/info`, `GET /v1/models`, and `POST /v1/chat/completions`
- the gateway uses Q API keys only and does not accept the broader harness admin key
- the Q runtime adapter now runs structured/control calls with `think: false`, explicit failure classes, and a harder contract validator that rejects prompt-echo garbage instead of rewarding it as parse success
- the public gateway path now sanitizes leaked meta tags like `<channel|>` before returning content to callers
- the OCI Q gateway bundle now targets the real dedicated Node gateway process instead of a proxy-only placeholder

Why it matters:
- this closes the next honesty gap in the Q stack: there is now a real smaller serving surface for external use, not just a promise to eventually separate it from the harness
- the deeper missed pattern was that structured-output evaluation can lie if it only counts fields; a model that echoes the instructions back can look compliant while still being unusable
- once prompt-echo leakage is treated as contract failure, the repo stops flattering `Q` and starts measuring the actual remaining fine-tune problem

Evidence:
- `npx tsx apps/harness/src/q-gateway-validate.ts --gateway-url=http://127.0.0.1:8899 --runtime-dir=... --keys-path=...` passed on `2026-04-14`
- the dedicated gateway returned `200` on `/health`, `401` without a key on `/v1/chat/completions`, `200` on authenticated `/api/q/info` and `/v1/models`, and `429 concurrency_limited` on the second overlapping keyed request
- the live gateway response was sanitized to `Gateway operational, all good.` with only about `95.83 ms` of overhead above upstream latency on the latest loopback pass
- `npm run compare:models` now records the harsher truth after the metric fix when direct `Q` regresses under `transport_timeout`
- `npm run bridgebench` still passed the bridge-runtime surface with `0` failed assertions while the direct-Q path also sits at `0/4` parse success with `transport_timeout`
- `npm run benchmark:gate:all` passed again at `2026-04-14T01:47:25.513Z` with `runCount: 3` and `violationCount: 0`

What this unlocks next:
- a real OCI-hosted private Q API without exposing the full harness control plane
- structured-output release gates that can block a weak Q fine-tune even when the gateway itself is healthy
- a cleaner next training pass for Q focused on contract obedience and anti-prompt-echo behavior instead of generic model-serving work

#### Q gained a real bounded serving edge, BridgeBench became a tracked surface, and the training path got more truthful

What changed:
- the harness now exposes a narrow `Q` inference surface at `/api/q/info` and `/api/q/run` instead of forcing every Q call through the full private operator plane
- the Q route now runs under a dedicated `q-public` governance policy with consent scope `intelligence:q-public`, hashed per-key auth, and per-key rate/concurrency control
- the repo now carries a first tracked `BridgeBench` surface that publishes both the live bridge-runtime assertions and the current ugly local-model truth instead of hiding model failures behind the benchmark pass
- the OCI private bundle now carries the Q edge env settings and key-store path needed to host that narrow route on a private Oracle node without weakening the existing harness boundary
- the `Q` training path now has a cleaner run-id-shaped dataset flow, BridgeBench seed normalization, and a dry-run validator for the Unsloth entrypoint

Why it matters:
- this closes a real control-plane gap: Q can now be exposed as a bounded inference edge without pretending the entire harness should become public
- the missed systems pattern was that public-ish inference safety starts with route narrowing and rate isolation, not with a marketing page or a reverse proxy
- it also keeps the training path honest by validating the shaped text corpus before a GPU run starts, instead of letting a raw curated corpus sneak into a trainer that expects `text`

Evidence:
- `GET /api/q/info` on `127.0.0.1:8896` returned `200`
- unauthenticated `POST /api/q/run` returned `401`
- keyed `POST /api/q/run` reached the model execution path and returned a truthful `503` with `No response returned by the Q backend.` instead of failing in the auth/governance layer
- a second concurrent keyed request returned `429 concurrency_limited` while the first request was still in flight
- `npm run bridgebench` regenerated `docs/wiki/BridgeBench.md` and `docs/wiki/BridgeBench.json` with `0` failed bridge-runtime assertions and a still-failing local model path
- `python -m py_compile training/q/train_q_lora_unsloth.py training/q/build_q_mixture.py` passed after the training-path cleanup

What this unlocks next:
- a separate hardened public gateway in front of Q, if and only if the private harness edge keeps proving stable under real load
- structured-output release gates for Q that can fail a model backend without confusing that failure with a broken serving edge
- a real cloud fine-tune run for Q using the repo-owned dataset flow rather than an ad hoc one-off training job

### 2026-04-13

#### Q became a stable Gemma 4-based product identity, the local comparison surface went live, and the latest regression stayed published

What changed:
- Immaculate now binds `Q` directly to one real public model identity built on Gemma 4
- the harness now emits a controlled yellow/ocean-blue startup banner and surfaces the active `Q` lane at boot
- the repo now carries a live direct-Q structured-contract page that publishes the measured outputs into the wiki
- the `Q` fine-tune path now has a tracked curation manifest, a text-dataset shaper, and an Unsloth launch bundle wired back to the training-data factory
- the repo now also carries a hardened OCI private deployment bundle and a live validation page that records both the successful Temporal rerun and the failed fresh `60s` benchmark rerun

Why it matters:
- this closes a common honesty gap in local model work: `Q` is the real public model name, built on one real Gemma 4 foundation, with no alternate public identity
- the missed systems pattern was that local comparison pages are more valuable when they publish bad news as well as good news; the `60s` regression and the weak structured output from `Q` are both now part of the source-controlled record
- it also ties training back to the governed corpus path, which keeps the next `Q` fine-tune from splintering into an untracked side experiment

Evidence:
- the repo now resolves `Q` directly as the single public model name and there is no separate public install path
- `npm run benchmark:temporal` passed on `2026-04-13` with suite `immaculate-benchmark-2026-04-13T22-40-03-299Z`
- `npm run benchmark:latency:60s` completed on `2026-04-13` with suite `immaculate-benchmark-2026-04-13T22-41-40-475Z` and `3` failing assertions, which are now published in `docs/wiki/Live-Validation-2026-04-13.md`
- `npm run compare:models` generated `docs/wiki/Model-Benchmark-Comparison.md` and kept the direct-Q regression on record when the structured contract failed on this machine
- the follow-up live server drill kept one more ugly truth on record: `Q` failed closed with `No response returned by the Q backend.` while `/api/health` stayed healthy
- `npm run training-data:curate -- fixtures/training/q-defsec-curation.example.json` produced run `cur-fnv1a-b7a9289b` with `969` accepted files, and `python training/q/build_q_text_dataset.py ...` shaped those records into `.training-output/q/q-train-cur-fnv1a-b7a9289b.jsonl`

What this unlocks next:
- real `Q` fine-tuning against the governed corpus path instead of continued identity-only cleanup work
- structured-output evaluation gates for `Q` so route/reason/commit compliance becomes a hard release surface
- a targeted fix pass for the fresh `60s` benchmark regression on Windows instead of pretending the older soak run already answered that question

#### Training-data curation stopped being a notebook idea and became a governed factory surface

What changed:
- Immaculate now has a manifest-first training-data curation path for defensive Q fine-tuning corpora instead of relying on ad hoc one-off scripts
- the curation engine materializes local or remote git sources, applies explicit allow/review/reject license policy, scans accepted candidates for likely secrets, deduplicates repeated content, and emits curated JSONL shards plus a run manifest
- every curated source now carries explicit provenance fields including raw-content hash, processed-content hash, policy flags, and a Blake2-style chain hash over the run lineage
- the default output root is generated state outside git, and CI now runs a dedicated smoke that proves license rejection, secret detection, dedup behavior, and provenance emission on every benchmark-gate and benchmark-publication pass

Why it matters:
- this closes a real gap between "we have a model-training idea" and "we can produce a repeatable, reviewable corpus without immediately losing the security and provenance discipline the rest of the harness already enforces"
- the missed systems pattern was that dataset assembly is itself part of the control plane: if source selection, license stance, secret scrubbing, and dedup live only in notebooks, the eventual training artifact can never be defended rigorously
- it also gives the project a truthful middle ground between two bad extremes: blind scraping on one side and manual spreadsheet-only provenance on the other

Evidence:
- `npm run typecheck -w @immaculate/core`, `npm run typecheck -w @immaculate/harness`, `npm run build -w @immaculate/core`, `npm run build -w @immaculate/harness`, and `npm run training-data:smoke` all passed on `2026-04-13`
- the smoke now proves four concrete properties together: unknown-license source rejection, secret finding emission, duplicate-content suppression, and provenance-record generation
- the tracked example manifest in `fixtures/training/q-defsec-curation.example.json` plus the generated run schema in the core package establish a repeatable contract instead of an unversioned local script pile

What this unlocks next:
- governed read APIs and operator surfaces over curated training runs without leaking raw generated output into git
- richer source adapters beyond local and git intake, once the same policy and provenance contract is preserved
- fine-tune and evaluation pipelines that can consume the curated shard outputs directly instead of rebuilding data assembly logic inside each training job

#### Federated retry-and-repair closed the next honesty gap in remote cognition

What changed:
- failed remote cognition now records its first failed execution durably, schedules peer repair immediately, and can retry once against an alternate authenticated worker in the same governed request
- cognitive execution lineage now carries explicit retry metadata, so a recovered second attempt can point back to the failed first attempt instead of overwriting it
- federation peers now persist `idle` / `pending` / `repairing` repair state and due status, and worker health treats pending or repairing peers as stale so they stop participating in placement
- repair stays inside the existing signed control plane: lease renewal first, membership refresh plus lease renewal second, fail-closed if neither succeeds

Why it matters:
- this closes the runtime truth gap between "placement noticed a bad peer" and "the request still died even though another healthy peer existed"
- the missed systems pattern was that authenticated federation needs one more loop beyond membership, liveness, and execution quality: repair truth that can temporarily remove a peer from service without deleting its identity
- keeping the first failed execution visible while linking the retry attempt preserves honesty under recovery instead of manufacturing a fake single-shot success

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed again on `2026-04-13` after the federated retry-and-repair pass
- the benchmark gate now proves three new repair properties together: pending repair gates placement, repair-in-progress stays out of placement, and successful signed repair restores the peer to eligibility
- the runtime keeps repair internal and signed: there is no public federation repair endpoint, only the existing authenticated membership and lease-renew control paths

What this unlocks next:
- richer retry policy that can learn when to stay remote, when to fall back local, and when to suppress outward action entirely from the same failure evidence
- multi-peer repair-aware swarm routing where batch width can contract around peers already under repair instead of discovering that pressure only after execution starts

#### Adaptive federated execution pressure became a real runtime control law

What changed:
- federation peers now persist remote execution outcome history alongside lease health, so placement can read success ratio, failure pressure, and smoothed execution latency instead of only lease freshness
- signed lease cadence now adapts in both directions: failed remote execution and failed lease renewal tighten the renewal interval, while healthy signed renewals relax it again
- arbitration, scheduling, and routing now all carry federated pressure fields, so cross-node latency and remote execution quality are visible in the durable decision path rather than trapped inside worker scoring
- multi-peer swarm reservation now widens across authenticated peers under one real guarded-swarm batch, so federated swarm execution is no longer only a local-host truthfulness story

Why it matters:
- this closes the next honesty gap in federation: the system no longer waits for membership expiry before learning that a peer is a bad execution target
- the missed systems pattern was that distributed control has at least three clocks, not two: membership truth, lease/liveness truth, and execution-quality truth
- once remote execution outcomes join lease latency in the same control loop, placement becomes adaptive pressure management instead of static import ranking plus timeout cleanup

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed again on `2026-04-13` after the adaptive federated execution pressure pass
- the benchmark gate now proves five new properties together: federated arbitration pressure, federated scheduling pressure, adaptive lease cadence, worker assignment under execution failure pressure, and routing behavior under federated pressure
- a live three-peer drill on `127.0.0.1:9011-9013` with delayed federation proxies on `9112-9113` and delayed remote execution proxies on `9212-9213` proved the runtime path:
- guarded swarm cognition widened across both authenticated peers in one real `parallel-then-guard` batch
- after lease latency inversion, the next `remote_required` cognition run flipped to the other peer
- after one failed remote execution on peer `node-127-0-0-1-9012`, placement shifted to peer `node-127-0-0-1-9013` on the next attempt with recorded failure pressure `0.4167`
- after a forced lease failure on peer `node-127-0-0-1-9012`, lease recovery mode moved to `recovering`, cadence tightened from `3168 ms` to `2000 ms`, and then relaxed back to `4526 ms` after healthy signed renewals restored lease status to `healthy`
- one real bug fell out during that drill and is now fixed: a peer that had just failed execution could still win again on raw lease latency; execution recovery now gates placement until signed renewal has bled the stale failure pressure back down

What this unlocks next:
- longer-horizon federated control that can weigh rolling execution quality, cost, and locality without collapsing into hardcoded peer preference
- broader multi-peer swarm routing where cross-node latency becomes a durable orchestration signal across more than two peers
- future federated backend diversity where peer choice can be learned from the same runtime evidence instead of bolted on as a separate scorer

#### Authenticated federation gained a second live control loop: signed lease renewal now drives placement directly

What changed:
- federation now exports a dedicated signed lease surface alongside signed membership, so topology sync and liveness renewal are no longer the same control path
- peer records now persist separate lease-refresh cadence, lease-smoothed latency, lease trust remaining, and lease failure history instead of collapsing everything into one membership timestamp
- remote worker placement now consumes peer lease freshness and peer-smoothed latency directly, so renewed cross-node latency can outrank stale import-time node latency in live assignment
- execution lineage now records assigned peer identity and peer lease state next to worker/node placement metadata, so the runtime can prove which federated control path won

Why it matters:
- this closes the next federation honesty gap: signed membership proved who a peer was, but it still left liveness and routing pressure trapped behind a slower topology sync loop
- the missed systems pattern was that distributed placement needs two clocks, not one: slow-changing membership truth and fast-changing lease/latency truth
- once lease renewal becomes a first-class signal, multi-peer placement stops being a static import ranking and becomes a live control decision

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed again on `2026-04-13` after the lease-renewal and multi-peer placement pass
- the benchmark gate now includes a dedicated inversion proof: after authenticated peer renewals flip the live latency signal, placement flips from the near peer to the now-faster peer instead of sticking to the original import order
- a live three-node drill on `127.0.0.1:8971-8973` with delayed federation proxies on `9072-9073` proved the runtime path:
- initial `remote_required` placement chose peer `smoke-node-a` with peer latency `94.49 ms`
- after four signed lease renewals with swapped proxy delay, placement flipped to peer `smoke-node-b` with peer latency `41.71 ms`
- the final peer lease-smoothed latencies were `217.10 ms` for `smoke-node-a` and `41.71 ms` for `smoke-node-b`, which is the concrete control signal that drove the flip

What this unlocks next:
- signed lease recovery and adaptive renewal where the cadence itself can tighten or relax under cross-node instability
- broader multi-peer placement that can combine live lease latency with device affinity, execution cost, and eventually measured remote execution success
- future mesh coordination where worker routing depends on live federation pressure instead of a one-time membership import

#### Authenticated federation crossed from signed import into renewing trust and stale-state eviction

What changed:
- federation peers are now persisted as first-class control-plane records instead of existing only as one-shot sync inputs
- signed membership freshness is now enforced with issued-at age and clock-skew windows instead of trusting any valid signature forever
- peer refresh now runs on a background cadence, smooths observed latency over time, and reuses peer-specific control-plane auth when configured
- remote node and worker state is now evicted when a peer ages out of its trust window, so dead remotes cannot remain assignable after liveness is lost
- federation imports now normalize exporter-local workers into importer-remote workers, which keeps placement semantics honest across node boundaries

Why it matters:
- this closes the real liveness gap in federation: identity was already verified, but trust was still static and placement could outlive the peer that earned it
- the missed systems pattern was that signed membership alone is not enough; a distributed substrate also needs freshness, renewal, and a hard eviction path when renewal stops
- it turns federation from a signed discovery trick into a control loop with explicit trust decay, which is the minimum honest boundary before broader multi-node orchestration

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed again on `2026-04-13` after the peer-refresh and eviction pass
- a live three-process drill on `127.0.0.1:8941-8943` plus a mock local Q backend on `127.0.0.1:19170` proved the full path:
- the healthy signed peer on `8942` imported remote worker `worker-local-127-0-0-1-8942-slot-1`, which was recorded as `executionProfile=remote` and won `remote_required` placement with reason `remote-capable · locality local:knightly · identity verified · model demo-model · latency 21.0ms · cost $0.42/h · watch`
- the bad-secret peer on `8943` was rejected with `Federation node identity verification failed: unexpected key 6fa91d17b766`
- after the healthy peer process was killed, the peer aged into `faulted`, the remote node disappeared from `/api/nodes`, remote workers disappeared from `/api/intelligence/workers`, and the next `remote_required` cognition run failed closed with `No eligible remote execution worker available`

What this unlocks next:
- signed lease renewal and heartbeat-style federation where renewal cadence itself becomes a live control signal
- multi-peer placement that can combine locality, smoothed cross-node latency, and device affinity without trusting stale membership
- future mesh-style federation only after renewal, eviction, and recovery paths have already been made truthful

#### Authenticated federation reached the signed-membership and verified-identity stage

What changed:
- federation membership can now be exported and imported as signed artifacts instead of being implied by local registry state alone
- remote node and worker identity is now verified before placement, so a worker has to prove who it is before it can join the scheduling set
- placement now ranks locality, observed latency, cost, and device affinity together instead of relying on locality as a single proxy
- the live peer-sync drill completed at a high level with authenticated member exchange and identity verification holding under coordination pressure

Why it matters:
- this is the first honest step into federation proper: the system can now exchange membership, verify remote participants, and make placement decisions from more than one real signal
- it also keeps the project from overstating itself as a full mesh; the current phase is authenticated federation membership and placement, not a finished all-to-all mesh
- the missed systems pattern was that distributed control only becomes real once membership, identity, and placement are all durable and explicit rather than inferred

Evidence:
- signed membership export/import is now part of the public progress surface
- remote node and worker identity is verified before placement decisions are accepted
- the peer-sync drill finished with the expected high-level outcome: authenticated coordination succeeded and placement followed the locality plus observed-latency path rather than a naive remote-first continuity route

What this unlocks next:
- broader multi-node federation that can grow from authenticated membership instead of ad hoc discovery
- more precise placement policies that continue to combine locality with latency, cost, and device affinity
- eventual mesh-style coordination if and when the authenticated membership model proves it can scale safely

#### Locality became a real worker-plane control signal, and benchmark drift gained an honest API

What changed:
- the harness now maintains a governed local node registry with explicit node heartbeat, registration, and removal routes instead of leaving locality as an internal-only hint
- worker placement can now score against node-locality in the live reservation path, so a healthy same-locality remote worker can outrank an equally capable cross-rack worker before cognition is dispatched
- the benchmark gate now proves this with a dedicated same-locality-versus-cross-rack assignment assertion instead of only checking that a remote worker lease exists
- published benchmark history can now be queried through `/api/benchmarks/trend`, which analyzes published run order, exposes drift verdicts, and stays explicit about the fact that it is a run-order trend rather than pretending to be a wall-clock forecast
- the trend loader was hardened after live validation exposed a Windows `EMFILE` failure mode from over-eager concurrent report reads

Why it matters:
- this closes an honesty gap in the worker plane: locality is no longer just a scoring idea on paper, it now shapes real worker assignment through a durable node surface
- it also closes an operator gap in the benchmark story: trend analysis is now queryable from the harness itself instead of existing only as a file-side computation
- the missed systems pattern was that distributed orchestration credibility begins before true federation; you first need stable node identity, explicit locality, and truthful trend reporting over the history you actually have

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed on `2026-04-13` after the node-plane and trend pass
- live harness smoke on `127.0.0.1:8874` showed node count rising from `1` local node to `3` total nodes after remote registration, and remote worker assignment chose `smoke-worker-near` with reason `remote-capable · locality rack-a · swarm-offload · layer demo-layer · model demo-model · watch`
- the same live smoke confirmed `/api/benchmarks/trend` was live with `trendCount=7`, `analysisBasis=published_run_order`, `sampleCount=5` for `durability-torture`, and a concrete drift verdict emitted directly from the harness API

What this unlocks next:
- authenticated networked federation where node identity and locality already exist as durable substrate primitives instead of needing to be invented later
- richer placement policies that combine locality with observed latency, cost, and device affinity
- operator and benchmark surfaces that can expose trend regressions before they turn into hidden long-run drift

### 2026-04-12

#### Credibility lanes stopped pretending to be smoke and started benchmarking the claims buyers will actually inspect

What changed:
- Immaculate now has three dedicated credibility lanes beyond the generic smoke/gate packs: `durability-torture`, `neurodata-external`, and `temporal-baseline`
- the durability lane now runs a real supervisor/worker crash harness across five failure modes for 1,000 total crash iterations and measures recovery success plus durable-marker loss instead of only claiming checkpoint recovery from a happy-path restart
- the neurodata lane now resolves a real OpenNeuro BIDS slice and a real DANDI NWB asset before measuring ingest throughput in MB/s and events/s
- the comparative lane now executes a minimal ingest -> process -> commit -> verify workflow through both Immaculate and Temporal and records wall-clock plus RSS on both sides
- benchmark timing metadata now treats these credibility lanes as unpaced benchmark-class runs instead of misclassifying them as smoke based on synthetic control-loop duration

Why it matters:
- this closes a major credibility gap: the benchmark story is no longer limited to internal substrate behavior and short control-loop smoke packs
- the missed systems pattern was that serious reviewers will care less about a pretty p95 chart and more about three harder questions: can it survive repeated crashes, can it ingest real external neurodata, and how does it compare honestly against a known orchestration baseline
- making those lanes first-class benchmark packs means the same publication, export, and replay surfaces can now carry the hard proof instead of leaving it in ad hoc notebooks or one-off test scripts

Evidence:
- `durability-torture` suite `immaculate-benchmark-2026-04-13T00-47-28-666Z` completed with `failedAssertions=0` after `1000` crash iterations across `5` modes and published to W&B
- `neurodata-external` suite `immaculate-benchmark-2026-04-13T01-32-33-217Z` completed with `failedAssertions=0` after resolving a real OpenNeuro dataset slice and a real DANDI NWB asset
- `temporal-baseline` suite `immaculate-benchmark-2026-04-13T01-33-10-895Z` completed with `failedAssertions=0` and now publishes the comparative wall-clock and RSS story as a first-class benchmark artifact

What this unlocks next:
- long-horizon trend analysis for crash durability, external ingest, and baseline comparison instead of only substrate-local smoke lanes
- future BCI buyer-facing benchmark packs where published external datasets matter more than internal fixture throughput
- broader honest comparison work where Immaculate can concede raw workflow speed to specialized engines while proving governance, verify gates, arbitration, and durable semantic ledgers on the execution path

#### Hour-class soak became real, and the persistence substrate stopped collapsing under its own event ledger

What changed:
- Immaculate now has a real wall-clock paced `latency-soak-60m` pack that ran for one full hour with sustained measured event throughput above 1,000 events per second instead of borrowing the word "soak" for a sub-second smoke lane
- the persistence layer now compacts event and history ledgers against the latest checkpoint, retains semantically important decision events across compaction, and widens the hot recoverability window so high-throughput runs do not silently lose pre-persist lineage
- the W&B publication path now avoids a fragile viewer probe and has enough timeout budget to publish hour-class benchmark artifacts instead of failing at the final upload edge

Why it matters:
- this is the point where the benchmark story stops being aspirational and becomes defensible under a serious review standard: the system now has a real one-hour soak with calibrated wall-clock timing, real hardware context, real recovery, and public publication
- the missed systems pattern was straightforward but important: long-run orchestration credibility is controlled less by the scheduler than by whether the persistence substrate can survive its own event pressure without turning recovery into a multi-gigabyte replay failure
- compacting only the noisy high-volume lineage while preserving semantic control events keeps the audit surface meaningful instead of forcing a false choice between total retention and hour-class execution

Evidence:
- `latency-soak-60m` suite `immaculate-benchmark-2026-04-12T21-48-36-880Z` completed in `3600967.49 ms` with `failedAssertions=0`, `integrity=verified`, and `recoveryMode=checkpoint`
- measured event throughput was `1270.78 events/s` on `knightly / Windows 11 Pro / AMD Ryzen 7 7735HS / 16 cores / 23.29 GiB RAM / SSD / Node v22.13.1`
- the published W&B soak run is `https://wandb.ai/arobi-arobi-technology-alliance/Immaculate/runs/bxncy45c`
- the soak report now publishes `P50/P95/P99/P99.9` latency series plus hardware context through the same repo/wiki export surface as the shorter benchmark lanes

What this unlocks next:
- real durability torture packs and real neurodata ingest packs that can run long enough to matter without the persistence layer becoming the bottleneck
- meaningful trend analysis over long-run behavior instead of only smoke-lane snapshots
- future node-federated and hardware-backed orchestration where long-running ledgers remain both recoverable and auditable

#### Parallel swarm execution stopped dead-ending on a single local worker lease

What changed:
- the local execution plane no longer models one host as one leaseable worker record; it can now materialize a bounded pool of local worker slots on the same local Q backend endpoint
- parallel swarm reservation now cleans up partially reserved leases if a later reservation fails, instead of stranding earlier leases until TTL expiry
- benchmark coverage now proves that three distinct local slot leases can be reserved on one host, and live guarded-swarm smoke now proves the non-guard turns actually launch under one parallel batch instead of failing on the second reservation

Why it matters:
- this closes the gap between a truthful parallel schedule in the ledger and a runtime that could only ever lease one local worker at a time
- the missed systems pattern was simple but important: local parallelism is still a worker-placement problem, but the worker record has to represent concurrency slots, not the whole host as a single indivisible lease
- without this, every local swarm formation was one reservation away from collapsing back into sequential reality

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the worker-slot pass on `2026-04-12T18:45:42.571Z` with `runCount=3` and `violationCount=0`
- live harness smoke on `127.0.0.1:8862` completed a guarded swarm with `executionTopology=parallel-then-guard`, `parallelWidth=3`, `roles=mid>soul>reasoner>guard`, and one shared `parallelBatchId`
- the three non-guard turns launched within `69.0 ms` of each other before guard review, which is the concrete runtime signal that the widened cognition path is parallel instead of merely labeled as such

What this unlocks next:
- truthful local-versus-remote placement policies that can choose between slot pools on one host and remote worker endpoints using the same lease substrate
- batch-level fault isolation and throughput tuning for wider swarms without rewriting the cognitive scheduler again
- real comparative orchestration baselines where parallel topology is no longer invalidated by a single local worker bottleneck

#### Benchmark truth stopped hiding behind synthetic durations and vague soak language

What changed:
- benchmark reports now carry explicit `runKind`, structured hardware context, planned duration, and measured wall-clock duration instead of only a free-text summary
- benchmark series now publish `P50`, `P95`, `P99`, and `P99.9`, and the report now exposes a real measured `event_throughput_events_s` series based on wall-clock runtime instead of only the internal throughput heuristic
- the short `latency-soak` pack is now published as `Latency Smoke` until a real 60-minute-plus soak lane exists
- W&B publication and export now carry the same benchmark truth surface as the local report: run kind, planned duration, wall-clock duration, and hardware context
- CI benchmark publication is now wired on every `main` push so W&B and the repo-tracked benchmark wiki surfaces stop depending on manual publication alone

Why it matters:
- this closes the benchmark honesty gap between what the system intended to run and what it actually measured on hardware
- it also removes one of the fastest ways to lose credibility with serious reviewers: calling a sub-second run a soak and publishing uncalibrated numbers without machine context
- the missed systems point is that benchmark trust is an architectural feature, not a marketing layer; if duration, hardware, and throughput are not first-class data, the whole trend line is suspect

Evidence:
- the latest benchmark gate passed with three runs and zero violations on `2026-04-12T18:31:02.112Z`
- the latest published smoke runs are now exported with explicit hardware context and wall-clock duration in `docs/wiki/Benchmark-Status.md` and `docs/wiki/Benchmark-Wandb-Export.md`
- the latest latency publication now shows `runKind=smoke`, `plannedDurationMs=12800`, `totalDurationMs=870.35`, and a measured event throughput series instead of an implied soak label

What this unlocks next:
- real 60-minute-plus soak lanes that can reuse the same truthful report contract without changing the publication surface again
- durability torture, neurodata ingest, and baseline comparison packs that publish under the same calibrated benchmark schema
- benchmark trend analysis that can reason over honest wall-clock results instead of mixing planned control-loop time with measured runtime

#### Worker placement became authoritative and session safety stopped trusting global defaults

What changed:
- cognition execution now reserves a concrete intelligence worker before it runs instead of only scoring workers as an advisory side channel
- worker reservations are lease-backed and visible in the registry, so duplicate assignment pressure is explicit and the same worker cannot be handed out twice concurrently
- cognitive executions now persist placement metadata including `sessionId`, worker id/label/host, execution profile, placement reason, score, and the concrete execution endpoint
- remote worker placement now uses a real but previously overlooked substrate: a worker can advertise a Q-runtime-compatible endpoint, and the runtime can place cognition there directly without inventing a separate remote orchestration RPC
- actuation dispatch and mediated orchestration no longer fall back to the newest global execution or frame when the caller omits sources; they now require explicit session binding or fail closed on mismatch

Why it matters:
- this closes the gap between “the scheduler said it used a worker” and “the durable system can prove where cognition actually ran”
- it also removes a subtle but dangerous safety failure mode where a session-scoped request could accidentally inherit the latest global execution context from a different session
- the hidden systems insight is that truthful scale-out does not start with a fancy distributed control bus; it starts with making placement, lease ownership, and source binding real in the execution ledger

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed after the worker-authority pass
- benchmark coverage now proves worker lease selection, duplicate assignment pressure, and session-bound source safety
- live harness smoke on `127.0.0.1:8854` showed a `remote_required` cognitive pass running with `assignedWorkerId=smoke-remote-worker`, `assignedWorkerProfile=remote`, and `executionEndpoint=http://127.0.0.1:11434`
- the same live drill showed session-bound mediation accepted for `session:smoke-a` and rejected the same source under `session:smoke-b` with `409 source_session_mismatch`

What this unlocks next:
- locality-aware placement that uses real worker endpoint health, observed latency, and cost as first-class scheduling signals
- multi-node orchestration that can widen a swarm across remote compute honestly instead of labeling every formation as local
- future worker federation where the current lease and placement substrate can become the control surface for broader backend diversity

#### Swarm scheduling became truthful and external LSL ingress became real

What changed:
- cognition schedules that widen into a swarm now execute non-guard layers in parallel at runtime instead of being labeled as a swarm while actually running as a sequential chain
- guarded swarms now close with a final review turn after the parallel cohort finishes, which makes the durable schedule topology match the real execution topology
- a real LSL bridge manager and Python inlet helpers now let external Lab Streaming Layer sources flow into the same live neuro spine as replayed and socket-fed frames
- the live harness exposes LSL discovery, connection, and stop routes so external neuro streams no longer depend on synthetic frame injection

Why it matters:
- this closes a core truthfulness gap in the intelligence plane: the schedule ledger now describes what the runtime really did instead of an idealized topology label
- it also crosses the next neuro-ingress boundary from simulated socket injection to a real external stream protocol used by EEG and BCI tooling
- the hidden systems point is that honest topology matters more than impressive labels, because replay, latency accounting, and future distributed scheduling all depend on the runtime matching the durable plan

Evidence:
- live mediation smoke showed `nonGuardStartSpreadMs: 0.0`, proving the non-guard cognition cohort started concurrently rather than serially
- direct LSL discovery, bridge, and manager smokes succeeded against a temporary live outlet and produced a real ingested neuro frame with derived band state
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the truthful-swarm and LSL ingress pass

What this unlocks next:
- heterogeneous swarm execution where different backends can participate in the same parallel formation honestly
- external device ingress paths that do not rely on synthetic harness-only injection
- future locality-aware worker routing where truthful concurrency and real neuro ingress become schedulable resources

#### Public benchmark publication became a tracked artifact instead of an external side effect

What changed:
- W&B publication now writes ownership, role, website, and artifact identity into the live run summary and artifact metadata instead of burying them only in run config
- the publisher now refreshes a tracked benchmark status surface in `docs/wiki/Benchmark-Status.md` and `docs/wiki/Benchmark-Status.json`
- the public repo now points directly at the live W&B project under `PossumX/immaculate` and keeps the generated runtime ledgers out of git

Why it matters:
- this closes the public truth gap: benchmark publication is now visible in three places at once, the live W&B run, the public repo, and the wiki source
- the project can now publish results publicly without leaking private runtime ledgers or pretending that CI artifacts are the same thing as public benchmark memory

Evidence:
- the benchmark publisher now emits project/run URLs and refreshes the tracked repo/wiki benchmark status page
- the README and wiki home now point directly at the live public W&B surface

What this unlocks next:
- repeatable public benchmark history by pack without turning the private runtime ledger into committed source
- clearer operator and community visibility into what has actually been validated recently
- richer future benchmark trend pages that can stay public without exposing internal run-state noise

#### W&B benchmark results now get pulled back into git wiki as an export surface

What changed:
- the repo now has a W&B export path that reads the live published benchmark runs back from W&B and writes a committed wiki export
- `docs/wiki/Benchmark-Wandb-Export.md` and `docs/wiki/Benchmark-Wandb-Export.json` now record run IDs, run URLs, states, summary fields, and benchmark-report artifact identity pulled from W&B itself
- this gives Immaculate a git-tracked benchmark memory even when the W&B workspace visibility is not fully public

Why it matters:
- this closes the last visibility gap between published experiment tracking and repo-held benchmark memory
- the project no longer depends on W&B privacy settings alone for community-visible benchmark results

Evidence:
- the export is generated from the live W&B runs rather than from the local benchmark runtime ledger
- the new wiki export page sits alongside the benchmark status page as a committed source artifact

What this unlocks next:
- periodic W&B export refreshes without exposing raw local benchmark ledgers
- benchmark diffs in git history that reflect what W&B actually stored, not just what the local publisher intended to send

#### The controller stopped pretending its timing math was static

What changed:
- the core engine now exports `STABILITY_POLE = 0.82` and uses it as an explicit stability threshold instead of scattering the same value through hidden control heuristics
- `predictionError` and `freeEnergyProxy` are now first-class live metrics and history fields, so the engine can expose latency surprise and model-fit pressure rather than only raw throughput/coherence
- adaptive phase increments are now persisted in durable state, which means the controller can carry a learned timing profile across recovery instead of rebooting into a permanently fixed phase table
- review-only mediated passes now emit a durable routing decision before dispatch, so the route ledger records held intent and not just delivered action

Why it matters:
- this is the point where Immaculate stops being only a governed heuristic controller and starts becoming an explicit adaptive control system
- a system that can hold action but still record the chosen route is more truthful, more replayable, and easier to improve than one that only becomes durable after outward dispatch
- the hidden systems insight is that orchestration quality depends as much on measured surprise and settling behavior as it does on raw latency

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the control-formalization pass
- the benchmark now asserts the throughput floor, the stability-pole coherence threshold, and bounded prediction error
- mediated review-only runs now persist a routing decision in the same durable ledger used by dispatched routes

What this unlocks next:
- explicit active-inference style optimization over the verify → optimize seam
- trend analysis over prediction error and free-energy proxy instead of only latency/coherence
- truthful future swarm orchestration where planned but suppressed actions still contribute to learned routing and safety memory

#### Spectral evidence now shapes mediation before outward action

What changed:
- execution arbitration now treats current-frame spectral evidence as a real control input instead of relying only on scalar decode confidence
- strong clean beta/gamma windows can keep the mediated decision path reflex-local, while contaminated spectral windows are forced into guarded review before outward action
- execution scheduling now widens contaminated review paths into guarded internal formations instead of silently preserving a narrow cognition lane
- the benchmark now proves spectral reflex arbitration, spectral guarded review, and guarded spectral scheduling in addition to the earlier route-pressure coverage

Why it matters:
- this closes the next hidden systems gap: a controller that reacts to contamination only at the routing layer is still too late, because cognition and actuation planning have already been shaped by bad input
- Immaculate now uses spectral evidence to decide whether it should think, widen, hold, or act before route selection commits to an outward lane
- the mediation layer is now beginning to behave like a real control surface for intelligence rather than a thin wrapper around model execution

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` passed after the mediation-coupling pass
- the benchmark gate now proves spectral arbitration and guarded spectral scheduling with zero violations on the latest all-pack run
- routing regressions introduced by stale prior coupling were fixed by making current-frame spectral evidence dominate when present

What this unlocks next:
- schedule-aware multi-agent mediation that can react to richer neural or decoder-side priors before cognition runs
- future confidence models that combine spectral quality, artifact suppression, and decoder reliability without trusting stale state
- domain benchmark packs where real neuro streams can prove not just route quality, but mediation quality under contamination and uncertainty

#### Spectral confidence became a real control signal instead of a decorative neuro metric

What changed:
- live neuro ingest now computes confidence from band structure when band power is available, with explicit `45-65 Hz` artifact detection and a clean continuity path to the legacy amplitude read when spectral bands are unavailable
- contamination is now represented directly in the core neuro schema and neural-coupling state through artifact power, total power, and artifact ratio
- routing now reads spectral pressure directly from the incoming frame or the persisted coupling state, so contaminated windows de-escalate before outward action instead of merely being tagged after the fact
- the benchmark now proves three cases: backward-compatible amplitude continuity, artifact-window suppression, and spectral routing pressure that pushes contaminated windows onto safer lanes

Why it matters:
- this closes a hidden but serious systems bug: a neuro-orchestration controller that rewards amplitude before it recognizes contamination can treat noise as agency
- the system now uses spectral quality as a control input, not just as operator-visible telemetry
- it is the first pass where neuro contamination changes outward route choice before dispatch

Evidence:
- `npm run typecheck`, `npm run build`, and `npm run benchmark:gate:all` all passed after the spectral pass
- the benchmark gate now includes artifact suppression and spectral route-pressure assertions
- live harness smoke on an isolated runtime showed a `60 Hz` artifact window ingest at `decodeConfidence: 0` and dispatch through `guarded continuity / visual / file`
- W&B offline publication captured the new benchmark surface in `wandb/offline-run-20260412_084945-s0i1clym/files`

What this unlocks next:
- arbitration and scheduling that react to neural coupling before route/dispatch
- better BCI-quality gating where contamination can suppress or defer cognition/actuation earlier in the control loop
- richer spectral models that separate neural rhythm quality from environmental artifact without weakening the governed harness

### 2026-04-12

#### Mediation now closes the loop with approval-gated dispatch

What changed:
- `POST /api/orchestration/mediate` now supports `dispatchOnApproval`, so the same call can return a plan only or complete dispatch when approval allows it
- blocked guard verdicts are written back into governance memory, so the next mediated pass sees the denial pressure
- the benchmark now covers both review-only mediation and single-call mediate-and-dispatch completion

Why it matters:
- this turns the guard from a passive report into a real control signal that changes subsequent governance pressure
- it closes the last gap between mediated decisioning and outward action when the operator explicitly allows dispatch

Evidence:
- benchmark coverage now asserts plan-only mediation, approval-gated dispatch, and guard-verdict governance memory
- the live harness route was updated to return plan-only results unless `dispatchOnApproval` is true

What this unlocks next:
- tighter session-scoped mediation policies
- better operator control over when Immaculate should think versus act
- richer single-call orchestration flows that remain governed end to end

### 2026-04-12

#### Tier 2 routing now follows bounded neural coupling

What changed:
- Tier 2 benchmark coverage now proves band dominance, phase bias, and coupled routing strength
- redacted projections still hide `bandPower` and `neuralCoupling`, while benchmark/session/audit scopes expose the right bounded values
- route selection now prefers the live neuro-coupling lane when decode readiness, transport health, and governance align

Why it matters:
- this is the first time the system can benchmark the coupling signal and use it as an actual routing influence without leaking raw neuro detail
- it closes the loop between neuro visibility, routing, and transport health in a measurable way

Evidence:
- `npm run benchmark:gate:all` passed after the Tier 2 pass
- benchmark series now track band dominance, route phase bias, and coupled routing
- benchmark and dashboard projections preserve the right bounded neuro coupling state

What this unlocks next:
- more selective coupling-aware route experiments
- stronger future policy feedback from live neuro state into orchestration
- richer benchmark packs for neuro-driven route choice and transport selection

### 2026-04-12

#### Tier 2 neural coupling became visible and measurable

What changed:
- redacted projections now hide both `bandPower` and `neuralCoupling`
- benchmark and audit scopes now preserve bounded neuro-band and coupling views
- the benchmark now generates long enough synthetic neuro windows to prove alpha, beta, and gamma band dominance plus route-phase bias
- the Tier 2 benchmark now tracks coupled routing strength as a first-class series

Why it matters:
- this closes the next real visibility gap in the neuro layer: the system can now distinguish raw neural detail from bounded operator-visible coupling signals
- route bias is now measurable against the band-dominance signal that feeds it

Evidence:
- benchmark gate remains green after the Tier 2 additions
- redacted snapshot reads hide coupling state and band power by default
- benchmark and audit projections now expose the correct bounded/full coupling views

What this unlocks next:
- stronger coupling-aware route selection experiments
- better neuro/cognition correlation studies without leaking raw signal detail
- more realistic future routing policy that can be benchmarked against band dominance and phase bias

### 2026-04-12

#### The schedule became the source of truth for multi-role cognition

What changed:
- the operator-override scheduler now records the full four-role formation (`mid>soul>reasoner>guard`) instead of a truncated subset
- the live conversation executor now follows the durable `schedule.layerIds` exactly, rather than widening the run opportunistically at execution time
- structured cognition parsing now accepts both line-separated and compact inline `ROUTE / REASON / COMMIT / VERDICT` formats
- the new cognitive-loop benchmark series now participate in historical comparison and W&B publication instead of being visible-only side data

Why it matters:
- this closes a subtle but serious systems gap: before this fix, the runtime conversation could outrun the schedule ledger and break replay authority
- the scheduler is now a real contract, not just a hint
- the parser is now resilient to a class of compact model outputs that would otherwise silently erase the structured control seam

Evidence:
- live governed mediation now returns a `guarded-swarm` schedule with `layerRoles = mid>soul>reasoner>guard` and a matching four-turn persisted conversation
- `npm run benchmark:gate:all` passed again with zero violations after the schedule-authority and parser-hardening fixes
- the benchmark publication now carries the Tier 1 cognitive-loop series into comparison deltas, not just the raw report payload

What this unlocks next:
- genuine schedule-aware heterogeneous execution, because the scheduler can now be trusted as the authoritative topology record
- stronger replay, audit, and future locality routing, because runtime cognition no longer diverges from the durable plan
- more aggressive structured-cognition experiments without brittle parser failure on compact model outputs

### 2026-04-12

#### The benchmark now exposes the cognitive loop as a first-class artifact

What changed:
- the benchmark publication now records parsed `ROUTE` / `REASON` / `COMMIT` structure from the cognition trace
- governance-aware cognition context is benchmarked explicitly instead of being an implicit assumption
- routing soft-prior bias is measured as a separate benchmark signal
- multi-role conversation order and guard verdicts are now part of the benchmark report and W&B payload

Why it matters:
- this makes the missing cognitive seam measurable before the runtime executor is widened further
- the project can now publish, inspect, and trend the shape of cognition, not just its downstream dispatch effects
- the benchmark report now reflects the real control problem: parse the model, inject governance, bias routing softly, and resolve the conversation with an explicit verdict

Evidence:
- `apps/harness/src/benchmark.ts` now emits dedicated assertions and series for parsed LLM structure, governance-aware cognition, routing soft priors, and multi-role conversation coverage
- the benchmark markdown and W&B publication automatically carry those new series and assertions

What this unlocks next:
- runtime prompt parsing and structured cognitive traces in the core execution path
- multi-role cognition executors that can carry the conversation ledger beyond a benchmark-local artifact
- tighter feedback between parsed model suggestions and future route selection

### 2026-04-12

#### Mediated orchestration learns to choose an intelligence formation

What changed:
- Immaculate now records a durable execution schedule between execution arbitration and cognition execution
- the system can now choose whether cognition should run as `single-layer`, `swarm-sequential`, `guarded-swarm`, `reflex-bypass`, or `held`
- `POST /api/orchestration/mediate` now emits both an arbitration decision and a scheduling decision before cognition runs
- `GET /api/intelligence/schedules` exposes that scheduling ledger to operators
- the benchmark now proves schedule width, swarm share, guarded scheduling, and schedule-ledger durability

Why it matters:
- this is the missing control seam between “decide whether to think” and “run one model”
- the system no longer treats cognition as a monolith; it can select a formation
- that is the first real step from a single-agent harness toward a programmable intelligence topology

Evidence:
- benchmark gate passed with zero violations after adding execution scheduling
- live mediation smoke formed a three-layer cognition schedule (`mid>reasoner>soul`) before dispatch
- the dashboard and TUI now surface `snapshot.executionSchedules[0]`

What this unlocks next:
- schedule-aware multi-agent execution across heterogeneous backends instead of a single local Q backend family
- schedule pressure feeding back into route, reason, and future locality-aware orchestration
- richer experiments where cognition width becomes a controlled systems variable instead of an accident of implementation

### 2026-04-12

#### Mediated orchestration becomes a first-class decision pass

What changed:
- Immaculate now has a mediated orchestration endpoint at `POST /api/orchestration/mediate`
- the system can now choose between `reflex-local`, `cognitive-escalation`, `guarded-review`, `suppressed`, and `operator-override` before it commits to outward action
- the arbitration decision is durable and queryable through `GET /api/intelligence/arbitrations`
- the mediated pass is benchmarked alongside the rest of the control plane, so the decision path is no longer implicit or ad hoc

Why it matters:
- this is a material leap from "dispatch something" to "decide whether to think, defer, or suppress before dispatching"
- the system now exposes an explicit mediation layer between perception, cognition, governance pressure, and actuation
- that mediation layer is the right shape for a control system that is meant to scale across agents, transports, and future human-in-the-loop pathways

Evidence:
- benchmark gate passed with zero violations after adding execution arbitration
- live mediation smoke returned `cognitive-escalation`, ran cognition, and then produced a guarded continuity route decision
- `GET /api/intelligence/arbitrations` exposes the durable arbitration ledger

What this unlocks next:
- routing pressure can be fed into multi-agent planning rather than only into the actuation lane
- future reasoning passes can choose between local reflex, agentic escalation, and suppressed action using the same durable mediation record
- more precise operator control over when Immaculate should act immediately versus when it should think first

### 2026-04-12

#### Public launch and live security pipeline stabilization

What changed:
- Immaculate was published as a public repository under Apache 2.0
- CI and Security workflows were repaired against clean GitHub runners
- CodeQL, gitleaks, GitHub secret scanning, push protection, and Dependabot security updates were brought into the live repo posture
- optional GitGuardian workflow wiring was added for external secret-monitoring expansion

Why it matters:
- this moved Immaculate from a local-only build into a governed public engineering program
- the project can now accept community contribution without sacrificing baseline security and benchmark discipline

Evidence:
- `PossumXI/Immaculate` is live publicly on GitHub
- CI passed on push
- Security passed on push
- GitGuardian workflow is present and green in its current unconfigured state

What this unlocks next:
- community-driven transport, orchestration, and neurodata improvements
- public benchmark trending and reproducible collaboration
- stricter branch protection and release discipline once the contribution flow grows

### 2026-04-12

#### Breakthroughs become first-class project artifacts

What changed:
- major engineering leaps and hidden-but-real system findings now have a dedicated standing record in the wiki source
- contribution rules now require updating the breakthrough log when a change materially moves the system
- engineering doctrine now explicitly prioritizes discovering leverage in control, timing, routing, replayability, and governance

Why it matters:
- important discoveries stop getting buried in commits, chat history, or scattered notes
- the project gains a durable memory for the exact moments where capability or understanding changed

Evidence:
- `docs/wiki/Breakthrough-Log.md` exists as a maintained milestone ledger
- `docs/wiki/Engineering-Doctrine.md` defines what counts as a real leap
- `CONTRIBUTING.md` requires contributors to update the breakthrough record when warranted

What this unlocks next:
- cleaner historical context for major architectural decisions
- faster onboarding for contributors who need the real inflection points, not just the file diff

### 2026-04-12

#### Route choice becomes a first-class orchestration object

What changed:
- Immaculate now records durable routing decisions in the shared snapshot and event spine instead of leaving route choice implicit inside the actuation path
- route selection now combines transport health, transport rank, decode confidence, cognitive state, and governance pressure into an explicit decision record
- the benchmark now proves two route modes: reflex-direct over the healthiest haptic lane and guarded continuity over the visual safety lane under critical governance pressure
- the dashboard and TUI now surface the latest route decision directly so operators can inspect the system's current choice without reverse-engineering it from downstream effects

Why it matters:
- this crosses a real systems boundary: orchestration is no longer only about whether delivery succeeded, but why a lane was selected in the first place
- route reasoning becomes replayable, inspectable, and benchmarkable, which is necessary if Immaculate is going to evolve from a transport controller into a control system for intelligence itself

Evidence:
- benchmark gate passed with zero violations after adding routing-decision persistence and assertions
- the benchmark now proves reflex-direct HTTP/2 haptic routing when governance is clear and guarded continuity UDP/OSC visual routing when governance pressure is critical
- live operator surfaces now expose `snapshot.routingDecisions[0]`

What this unlocks next:
- routing that feeds device health and governance pressure back into higher-level agent planning
- richer policy-aware outward actuation control instead of transport-only selection
- future multi-node orchestration where route choice is treated as a durable control-plane primitive

### 2026-04-12

#### Direct device routing stops being order-based and starts being health-based

What changed:
- Immaculate gained a supervised HTTP/2 direct device transport alongside UDP/OSC and serial lanes
- successful HTTP/2 device responses now feed liveness, capability coverage, firmware identity, and latency back into transport state
- actuation selection now ranks concrete transports by health, latency, capability fitness, and vendor/device readiness instead of registry insertion order

Why it matters:
- this turns actuation from a static handoff table into a real routing problem with measurable preference
- the system can now choose the best concrete lane for a command based on the actual state of the device path, not just the fact that the path exists

Evidence:
- benchmark gate passed with zero violations after adding the new transport class
- the benchmark now proves HTTP/2 direct delivery and preference over other healthy haptic transports
- the operator transport surface now exposes preference rank and score

What this unlocks next:
- richer RPC-class device adapters beyond the first HTTP/2 lane
- routing that can incorporate device health as a first-class orchestration signal
- future actuator swarms where direct hardware lanes compete on real measured fitness instead of static priority

### 2026-04-15

#### Cloudflare becomes a real Q-only deploy and evaluation lane

What changed:
- the repo now carries a local Cloudflare worker package under `deploy/cloudflare/worker/` with a bounded `Q`-only chat endpoint and Workers AI binding
- `training/q/export_cloudflare_adapter.py` now checks whether a Cloudflare-ready adapter artifact actually exists and packages it only when the required files are present
- `training/q/build_cloudflare_eval_bundle.py` now turns the tracked Q benchmark corpus into a replayable Cloudflare eval bundle
- `training/q/launch_cloudflare_q_inference.py` now stamps a machine-readable `Cloudflare-Q-Inference` surface instead of leaving Cloudflare as an idea in notes

Why it matters:
- this creates a real deploy/eval path for `Q` that can be controlled from the repo once Cloudflare auth and a compatible adapter artifact exist
- the repo can now treat Cloudflare as a serving and evaluation plane without lying that it replaced the heavier Q training backend
- the eval loop gets a direct path from benchmark-derived Q rows into a replayable cloud endpoint

Evidence:
- the worker, env template, deploy script, adapter export script, eval-bundle script, and controller are now all committed under `deploy/cloudflare/` and `training/q/`
- `docs/wiki/Cloudflare-Q-Inference.md` is generated as the truth surface for auth readiness, adapter readiness, worker typecheck state, and smoke-eval blockers
- `docs/wiki/Release-Surface.md` now includes the Cloudflare inference surface in the stamped evidence list

What this unlocks next:
- actual Cloudflare worker deployment as soon as `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_Q_BASE_MODEL`, and `CLOUDFLARE_Q_LORA_NAME` are present
- replaying the benchmark-derived Q eval bundle through AI Gateway metadata and logs
- promoting Cloudflare from scaffolded deploy plane to active Q-only inference edge once a Cloudflare-ready adapter exists
