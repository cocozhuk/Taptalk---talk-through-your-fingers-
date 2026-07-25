# TapTalk Integration Protocol

## Working agreement

Each specialist owns a bounded subsystem. Specialists may read the entire
project but should change only their owned area unless the Integration task
explicitly coordinates a cross-cutting edit.

Every specialist must:

1. Read `docs/PRODUCT_CONTRACT.md`.
2. Read its brief in `docs/agent-briefs/`.
3. Preserve the product boundaries.
4. Record assumptions instead of silently inventing new behavior.
5. Define or respect subsystem interfaces.
6. Verify work proportionally to its risk.
7. End each work cycle with a concise handoff.

## Required handoff

- Decisions made
- Files or artifacts changed
- Interface exposed to other subsystems
- Verification performed
- Known limitations
- Unresolved questions
- Contract changes requested
- Recommended next integration step

## Ownership

| Area | Primary owner |
|---|---|
| Product contract and decisions | Product Architecture |
| Webcam, landmarks, contacts, rearming | Hand Tracking |
| Screens, overlays, editing, feedback | Interface Design |
| Speech identities, routing, processing, playback | Robotic Voices |
| Assignments, validation, events, persistence | App State and Storage |
| Acceptance tests, accessibility, privacy, performance | QA, Accessibility and Privacy |
| Project scaffolding, shared wiring, builds, end-to-end prototype | Integration and Prototype |

## Conflict rule

A specialist who needs to change another subsystem should document the
requested interface change and send it to Integration. Integration decides
whether to coordinate, defer, or reject the change.

