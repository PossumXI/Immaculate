# Arobi Audit Integrity

This page is generated from the `arobi-audit-integrity` benchmark pack. It proves the real harness can run governed Q requests, mediate them through Immaculate, and preserve a reviewable Arobi ledger trail with enough context for audit and insurance review without exposing hidden chain-of-thought.

- Generated: 2026-05-12T13:41:04.962Z
- Release: `0.1.0+fb59638`
- Repo commit: `fb59638`
- Q training bundle: `q-arobi-main-roots-20260512-bench-v1-7f0ae1c-22043bf3`

## Benchmark

- Suite: `immaculate-benchmark-2026-04-19T23-37-35-687Z`
- Pack: `Arobi Audit Integrity (arobi-audit-integrity)`
- Scenario count: `3`
- Failed assertions: `0`
- Linked records P50: `5`
- Source coverage P50: `4`
- Self-evaluations P50: `3`
- Audit completeness P50: `1`
- End-to-end latency P95: `64330.96 ms`
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics

## Scenario Diagnostics

### Defense non-contested review path

- Session: `arobi-audit-defense-non-contested-review-mo6eozss`
- Q accepted: `true`
- Mediation accepted: `true`
- Ledger linked: `true`
- Source coverage: `cognitive-execution` / `conversation` / `orchestration-arbitration` / `orchestration-schedule`
- Self-evaluations: `3` / evidence digests `5` / fingerprints `4`
- Q API audit captured: `true` / prompt captured `true` / reasoning captured `true`
- Route continuity: `cognitive => cognitive` / continuous `true`
- Latest review status: `completed`
- Governance pressure: `n/a`
- Completeness score: `1.00`
- Latest event hash: `5bcc617d6d4ee1de4557417848df5f5447efb2723eb92b38389643a9db343213`
- Failure class: `none`

### Healthcare escalation review path

- Session: `arobi-audit-healthcare-escalation-review-mo6eq7ep`
- Q accepted: `true`
- Mediation accepted: `true`
- Ledger linked: `true`
- Source coverage: `cognitive-execution` / `conversation` / `orchestration-arbitration` / `orchestration-schedule`
- Self-evaluations: `3` / evidence digests `5` / fingerprints `4`
- Q API audit captured: `true` / prompt captured `true` / reasoning captured `true`
- Route continuity: `cognitive => cognitive` / continuous `true`
- Latest review status: `completed`
- Governance pressure: `n/a`
- Completeness score: `1.00`
- Latest event hash: `dabb96ec0bf4d870894d73980804b07b1a77ac42b932f36c86c1ee10243b1a4e`
- Failure class: `none`

### Critical integrity hold

- Session: `arobi-audit-critical-integrity-hold-mo6erk2h`
- Q accepted: `true`
- Mediation accepted: `true`
- Ledger linked: `true`
- Source coverage: `cognitive-execution` / `conversation` / `orchestration-arbitration` / `orchestration-schedule`
- Self-evaluations: `3` / evidence digests `5` / fingerprints `4`
- Q API audit captured: `true` / prompt captured `true` / reasoning captured `true`
- Route continuity: `cognitive => cognitive` / continuous `true`
- Latest review status: `completed`
- Governance pressure: `n/a`
- Completeness score: `1.00`
- Latest event hash: `68825049fd007a54f3f1daddcee6ebf20e96d4115a151794796c2822f0fb1015`
- Failure class: `none`


## Assertions

- arobi-audit-integrity-health: `pass` | target `200 + status=ok` | actual `200`
- arobi-audit-integrity-q-surface: `pass` | target `enabled Q surface on Gemma 4` | actual `200 / Q / Gemma 4`
- arobi-audit-integrity-path: `pass` | target `all scenarios qAccepted=true and mediationAccepted=true` | actual `defense-non-contested-review:q=true/mediate=true/none, healthcare-escalation-review:q=true/mediate=true/none, critical-integrity-hold:q=true/mediate=true/none`
- arobi-audit-integrity-ledger: `pass` | target `linked ledger + cognitive/arbitration/schedule/conversation coverage` | actual `defense-non-contested-review:true/5/cognitive-execution|conversation|orchestration-arbitration|orchestration-schedule, healthcare-escalation-review:true/5/cognitive-execution|conversation|orchestration-arbitration|orchestration-schedule, critical-integrity-hold:true/5/cognitive-execution|conversation|orchestration-arbitration|orchestration-schedule`
- arobi-audit-integrity-context: `pass` | target `audit+prompt+reasoning+self-eval+digest coverage` | actual `defense-non-contested-review:audit=true/prompt=true/reason=true/self=3/evidence=5/fingerprint=4, healthcare-escalation-review:audit=true/prompt=true/reason=true/self=3/evidence=5/fingerprint=4, critical-integrity-hold:audit=true/prompt=true/reason=true/self=3/evidence=5/fingerprint=4`
- arobi-audit-integrity-route: `pass` | target `route continuous + completeness >= 0.95` | actual `defense-non-contested-review:cognitive=>cognitive/score=1.00/none, healthcare-escalation-review:cognitive=>cognitive/score=1.00/none, critical-integrity-hold:cognitive=>cognitive/score=1.00/none`
