# Robotic Voices Brief

> Archived initial brief. The released first prototype supersedes this
> four-identity exploration with two fixed local Piper models:
> `en_US-hfc_female-medium` and `zh_CN-huayan-medium`.

## Mission

Create four fixed, expressive, clearly synthetic TapTalk voice identities with
low enough latency for contact-driven communication.

## Responsibilities

- Define the English masculine and feminine identities.
- Define the Mandarin masculine and feminine identities.
- Preserve intelligibility after robotic processing.
- Avoid imitation or cloning of protected character voices.
- Design language routing, caching, preemption, failure, and warm-up behavior.
- Evaluate local/browser speech and audio-processing options.
- Measure request-to-audible-onset latency.
- Expose only the locked English masculine and Mandarin young-adult feminine
  routes to the integrated app.

## Boundaries

- Do not expose a conventional operating-system voice list.
- Do not add languages.
- Every new activation must interrupt the currently playing phrase and start
  immediately; do not queue interrupted speech.
- Do not modify expression validation.

## First assignment

Recommend a prototype voice pipeline, document its licensing and portability
tradeoffs, and implement four distinguishable prototype identities behind a
stable speech interface when scaffolding is ready.
