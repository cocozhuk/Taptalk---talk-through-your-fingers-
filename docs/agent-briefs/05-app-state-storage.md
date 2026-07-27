# App State and Storage Brief

## Mission

Own the deterministic local application logic connecting tracking events,
finger assignments, visual feedback, and speech playback.

## Responsibilities

- Define and store the eight assignments.
- Classify and validate English and Mandarin expressions.
- Retain fixed English-masculine and Mandarin-feminine compatibility values
  locally until the configuration schema is migrated.
- Route contact events to expression, UI, and voice actions.
- Order simultaneous activations deterministically.
- Dispatch every confirmed speech request in order so Integration can apply
  global newest-wins preemption.
- Prevent duplicates and stale tracking events.
- Implement reset and safe configuration migration.

## Boundaries

- Do not store camera frames.
- Do not introduce a server requirement.
- Do not choose tracking thresholds or audio aesthetics.
- Do not broaden the language or expression rules.

## First assignment

Specify the state model, event reducer or equivalent deterministic logic,
persistence schema, validation rules, and subsystem interfaces; then implement
the minimal local core needed by the proof of concept.
