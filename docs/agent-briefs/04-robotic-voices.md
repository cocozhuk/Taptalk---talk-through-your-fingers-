# Robotic Voices Brief

## Mission

Create four fixed, expressive, clearly synthetic TapTalk voice identities with
low enough latency for contact-driven communication.

## Responsibilities

- Define the English masculine and feminine identities.
- Define the Mandarin masculine and feminine identities.
- Preserve intelligibility after robotic processing.
- Avoid imitation or cloning of protected character voices.
- Design language routing, caching, overlap, failure, and warm-up behavior.
- Evaluate local/browser speech and audio-processing options.
- Measure request-to-audible-onset latency.
- Keep the user-facing selection limited to the four identities.

## Boundaries

- Do not expose a conventional operating-system voice list.
- Do not add languages.
- Do not serialize playback globally; overlapping speech is required.
- Do not modify expression validation.

## First assignment

Recommend a prototype voice pipeline, document its licensing and portability
tradeoffs, and implement four distinguishable prototype identities behind a
stable speech interface when scaffolding is ready.

