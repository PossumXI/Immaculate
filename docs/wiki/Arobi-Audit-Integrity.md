# Arobi Audit Integrity

This page is generated from the `arobi-audit-integrity` benchmark pack. It proves the real harness can run governed Q requests, mediate them through Immaculate, and preserve a reviewable Arobi ledger trail with enough context for audit and insurance review without exposing hidden chain-of-thought.

- Generated: 2026-05-14T17:32:24.048Z
- Release: `0.1.0+b71d328`
- Repo commit: `b71d328`
- Q training bundle: `q-arobi-main-roots-20260512-bench-v1-a7e67ff-22043bf3`

## Benchmark

- Suite: `immaculate-benchmark-2026-05-14T16-02-16-215Z`
- Pack: `Arobi Audit Integrity (arobi-audit-integrity)`
- Scenario count: `3`
- Failed assertions: `0`
- Linked records P50: `7`
- Source coverage P50: `5`
- Self-evaluations P50: `5`
- Audit completeness P50: `1`
- End-to-end latency P95: `91161.05 ms`
- Hardware: knightly / win32-x64 / AMD Ryzen 7 7735HS with Radeon Graphics

## Scenario Diagnostics

### Defense non-contested review path

- Session: `arobi-audit-defense-non-contested-review-mp5ofr1i`
- Q accepted: `true`
- Mediation accepted: `true`
- Ledger linked: `true`
- Source coverage: `agent-intelligence-assessment` / `cognitive-execution` / `conversation` / `orchestration-arbitration` / `orchestration-schedule`
- Self-evaluations: `5` / evidence digests `7` / fingerprints `4`
- Q API audit captured: `true` / prompt captured `true` / reasoning captured `true`
- Route continuity: `cognitive => cognitive` / continuous `true`
- Latest review status: `completed`
- Governance pressure: `elevated`
- Completeness score: `1.00`
- Latest event hash: `df1ef94e2ca93eb151979f5503df255a8fea5946e41087dcd1ff1cefec78003e`
- Failure class: `none`

### Healthcare escalation review path

- Session: `arobi-audit-healthcare-escalation-review-mp5ohulc`
- Q accepted: `true`
- Mediation accepted: `true`
- Ledger linked: `true`
- Source coverage: `agent-intelligence-assessment` / `cognitive-execution` / `conversation` / `orchestration-arbitration` / `orchestration-schedule`
- Self-evaluations: `5` / evidence digests `7` / fingerprints `4`
- Q API audit captured: `true` / prompt captured `true` / reasoning captured `true`
- Route continuity: `guarded => cognitive` / continuous `true`
- Latest review status: `completed`
- Governance pressure: `elevated`
- Completeness score: `1.00`
- Latest event hash: `dab2ca33e59f2e5ffef223204d3c6aa648d812ff3ed175a43dd6addf33f19b1e`
- Failure class: `none`

### Critical integrity hold

- Session: `arobi-audit-critical-integrity-hold-mp5ok32q`
- Q accepted: `true`
- Mediation accepted: `true`
- Ledger linked: `true`
- Source coverage: `agent-intelligence-assessment` / `cognitive-execution` / `conversation` / `orchestration-arbitration` / `orchestration-schedule`
- Self-evaluations: `5` / evidence digests `7` / fingerprints `4`
- Q API audit captured: `true` / prompt captured `true` / reasoning captured `true`
- Route continuity: `guarded => guarded` / continuous `true`
- Latest review status: `completed`
- Governance pressure: `elevated`
- Completeness score: `1.00`
- Latest event hash: `cedc70f41bb7e681e6d72a8743f2066c658e94db8ba22f466ed3b43b87502fac`
- Failure class: `none`


## Assertions

- arobi-audit-integrity-health: `pass` | target `200 + status=ok` | actual `200`
- arobi-audit-integrity-q-surface: `pass` | target `enabled Q surface on Gemma 4` | actual `200 / Q / Gemma 4`
- arobi-audit-integrity-path: `pass` | target `all scenarios qAccepted=true and mediationAccepted=true` | actual `defense-non-contested-review:q=true/mediate=true/none, healthcare-escalation-review:q=true/mediate=true/none, critical-integrity-hold:q=true/mediate=true/none`
- arobi-audit-integrity-ledger: `pass` | target `linked ledger + cognitive/arbitration/schedule/conversation coverage` | actual `defense-non-contested-review:true/7/agent-intelligence-assessment|cognitive-execution|conversation|orchestration-arbitration|orchestration-schedule, healthcare-escalation-review:true/7/agent-intelligence-assessment|cognitive-execution|conversation|orchestration-arbitration|orchestration-schedule, critical-integrity-hold:true/7/agent-intelligence-assessment|cognitive-execution|conversation|orchestration-arbitration|orchestration-schedule`
- arobi-audit-integrity-context: `pass` | target `audit+prompt+reasoning+self-eval+digest coverage` | actual `defense-non-contested-review:audit=true/prompt=true/reason=true/self=5/evidence=7/fingerprint=4, healthcare-escalation-review:audit=true/prompt=true/reason=true/self=5/evidence=7/fingerprint=4, critical-integrity-hold:audit=true/prompt=true/reason=true/self=5/evidence=7/fingerprint=4`
- arobi-audit-integrity-route: `pass` | target `route continuous + completeness >= 0.95` | actual `defense-non-contested-review:cognitive=>cognitive/score=1.00/none, healthcare-escalation-review:guarded=>cognitive/score=1.00/none, critical-integrity-hold:guarded=>guarded/score=1.00/none`
