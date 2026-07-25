# Product Architecture Brief

## Mission

Own TapTalk's behavioral contract. Convert product intent into precise,
testable rules that let other specialists work independently.

## Responsibilities

- Review and refine `docs/PRODUCT_CONTRACT.md`.
- Resolve all listed architecture decisions.
- Specify the contact state machine and event semantics.
- Define expression classification and validation.
- Define voice-selection behavior for mixed finger configurations.
- Define deterministic ordering for simultaneous contacts.
- Set measurable performance and recovery requirements.
- Maintain `docs/DECISIONS.md`.

## Boundaries

- Do not implement the application.
- Do not choose a visual style.
- Do not build the tracking algorithm or synthesize voices.
- Do not expand the language, voice, gesture, or expression limits.

## First assignment

Produce a prototype-ready architecture specification, resolve or clearly flag
remaining decisions, and give each specialist an interface-level contract.

