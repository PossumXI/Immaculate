# Arobi Network Architecture

This is the plain-English operating model for the stack.

- `Arobi Network` is the ledger-backed private and public operator network and audit substrate.
- `Immaculate` is the governed harness and intelligent orchestrator.
- `Q` is the brain: the reasoning model that works inside Immaculate.

## What That Means

When a real task enters the system, it should not disappear into a black box.

The intended path is:

1. A request or operator order enters the governed system.
2. Immaculate decides how that work should be handled, what policy applies, and whether the task is allowed to proceed.
3. Q produces the reasoning output that helps choose the route, the rationale, and the commit.
4. Immaculate arbitrates, schedules, guards, and records the action boundary.
5. Arobi Network anchors the reviewable record: request, governed decision, evidence, outcome, and linked hashes.

## Why The Split Matters

- Arobi Network exists so the system has a durable audit trail instead of disposable logs.
- Immaculate exists so the system has a harness that can govern action, not just generate text.
- Q exists so the system has one clear reasoning brain instead of a shifting set of public model identities.

## Why Auditors And Insurers Care

For review and insurability, the important question is not just "what answer did the AI give?"

The important questions are:

- what was asked
- what policy applied
- which governed route was chosen
- what evidence was available
- what outcome was produced
- whether drift or policy pressure was detected

The generated review surfaces in this repo are meant to answer those questions without pretending the system exposed hidden chain-of-thought.

## Best Starting Pages

- [Release-Surface](Release-Surface.md)
- [Arobi-Decision-Review](Arobi-Decision-Review.md)
- [Q-API-Audit](Q-API-Audit.md)
- [Q-Mediation-Drift](Q-Mediation-Drift.md)
- [Q-Gateway-Substrate](Q-Gateway-Substrate.md)
