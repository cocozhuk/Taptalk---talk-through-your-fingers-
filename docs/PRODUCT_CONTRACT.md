# TapTalk Product Contract

Status: architecture-resolved contract for the first prototype (updated 2026-07-28)

This document is the shared source of truth for every TapTalk specialist. A
specialist may propose a change, but only the Product Architecture task owns
changes to this contract. The Integration task records accepted changes in the
main project. Detailed normative behavior and subsystem interfaces live in
[`ARCHITECTURE_SPEC.md`](ARCHITECTURE_SPEC.md). Decision source and status live
in [`DECISIONS.md`](DECISIONS.md).

## Product purpose

TapTalk converts deliberate thumb-to-fingertip contacts into visible and spoken
expressions. It is a learned, configurable physical input system. It does not
interpret sign language, translate arbitrary gestures, or infer user intent.

## Fixed interaction model

1. A standard webcam observes both hands.
2. Each of the eight non-thumb fingers owns one editable expression.
3. Touching a fingertip to the thumb on the same hand selects that expression.
4. The interface immediately shows which expression was selected.
5. A compatible robotic voice speaks the expression.
6. The fingertip must separate from the thumb before that finger can activate
   again.

## Non-negotiable product boundaries

- Exactly eight finger inputs: four non-thumb fingers on each hand.
- Thumbs are activation controls and never expression inputs.
- Exactly one expression per finger.
- Each expression contains between one and five units.
- Spoken languages are English and Mandarin Chinese only.
- Each individual expression uses exactly one language. The eight finger
  assignments may contain a mixture of English and Mandarin expressions.
- Exactly two locked local Piper language voices:
  - English: `en_US-hfc_female-medium`
  - Mandarin Chinese: `zh_CN-huayan-medium`
- Voices must sound deliberately synthetic, mechanical, charming, and
  emotionally expressive.
- Voice design may draw on broad warm/rough versus clean/bright robot
  archetypes, but must not copy, clone, or imitate a protected character voice.
- There is no conventional system-voice catalogue in the interface.
- There is no sign-language recognition.
- There is no arbitrary gesture recognition or intent prediction.
- Configuration is stored only on the user's device.

## Expression validation

Every saved assignment contains an internal `en` or `zh` language derived from
its expression text. The interface does not ask the user to choose a language.
Text is normalized to Unicode NFC and trimmed before validation.

### English

- One to five words.
- A word is a non-empty token separated by whitespace after trimming.
- English accepts whitespace-separated Latin-letter words, including accented
  letters.
- Han characters, non-Latin letters, digits, emoji, controls, and unsupported
  symbols or punctuation are invalid.

### Mandarin Chinese

- One to five Chinese characters.
- Each Han-script Unicode code point counts as one word/unit.
- Internal whitespace, Latin or other non-Han letters, digits, emoji, controls,
  punctuation, and unsupported symbols are invalid.

### Mixed-script input

An individual expression containing both English and Mandarin lexical content
is invalid. The interface explains that languages can be mixed across fingers,
but not inside one finger assignment. Script validation does not claim to
identify natural language: Han-only text is routed as Mandarin.

The exact accepted grammars, normalization, validation codes, error priority,
and examples are normative in the Architecture Specification.

## Contact and rearming behavior

Each finger uses this durable state machine:

```text
untracked
  -> rearm required
  -> separated and armed
  -> approaching
  -> contact candidate
  -> activation confirmed
  -> held and disarmed
  -> separated and rearmed
```

- One sustained touch produces only one activation.
- Contact requires at least 60 ms and two usable contact samples.
- A finger becomes eligible initially and after activation only after at least
  120 ms and three usable separation samples.
- Once separation is confirmed, no UI, dispatch, or audio-completion cooldown
  delays the next activation.
- A tracking gap over 100 ms disarms the affected finger. Reacquisition always
  requires confirmed separation before a new activation.
- Detection must tolerate ordinary landmark jitter without producing repeated
  activations.
- Losing and reacquiring a hand, starting in contact, or resuming after camera
  interruption must not create a synthetic contact event.
- Contact and release spatial thresholds must use hysteresis. Hand Tracking
  owns their calibrated values, not the event semantics or timing above.

## Rapid activations

- Confirmed activations are dispatched by confirmation timestamp, then capture
  frame sequence.
- Speech uses one global newest-wins lane. Every new confirmed activation,
  regardless of finger, interrupts unfinished playback and starts its
  expression immediately.
- Interrupted requests are not queued, resumed, or replayed.
- Dispatch order still controls which activation is submitted first.
- Contacts confirmed in the same frame use this tie-break:
  `left_index`, `left_middle`, `left_ring`, `left_pinky`, `right_index`,
  `right_middle`, `right_ring`, `right_pinky`.
- Preview mirroring and callback/landmark order never affect dispatch.

## Voice routing

- The language of the assigned expression determines whether an English or
  Mandarin voice is used.
- English always routes to `en_US-hfc_female-medium`; Mandarin always routes to
  `zh_CN-huayan-medium`.
- There is no user-facing voice preference or per-finger voice selection.
- An activation snapshots its saved text, language, and current compatible
  voice. Later edits affect only later activations.
- At most one voice request plays at a time. The newest confirmed activation
  preempts the previous request, regardless of finger.
- Speech is synthesized locally with Piper after the two models have downloaded
  and been cached by the browser. The interface exposes no voice picker.

## Latency target

- Under documented normal warmed conditions, p95 audible onset must be no more
  than 500 ms after confirmed contact.
- Voices play at a natural `1×` rate. A newer activation may interrupt an
  unfinished expression at any point; completion is not required before the
  replacement starts.
- The same distribution must meet p95 visual acknowledgement of 100 ms and p95
  speech-request dispatch of 50 ms.
- Measurement begins at the capture time of the frame that confirms contact.
  Audio measurement ends at the first non-silent sample at the final
  application output graph, not when a speech API is called.
- Tests must report sample count, p50, p95, maximum, and failures, including
  rapid preemption and intelligibility checks in English and Mandarin. Cold
  start, permission, and recovery paths are reported separately.

## Privacy and storage

- Finger assignments and legacy routing compatibility fields remain on the
  user's device.
- Webcam frames should be processed locally for the first prototype.
- Webcam frames must not be stored, uploaded, or retained by default.
- Recording is an explicit user action available only while the camera is
  active. The saved video must contain the mirrored camera, visible fingertip
  markers and expression labels, and TapTalk speech audio. Stopping creates a
  local browser download; TapTalk must not upload or retain a copy.
- The user must receive a clear camera-permission explanation and a visible
  indication when the camera or recorder is active.
- Resetting TapTalk must provide a clear way to remove stored configuration.

## Recovery behavior

- Camera inactivity suppresses all new tracking and activation events without
  deleting configuration.
- A camera restart creates a new tracking session and leaves every finger
  disarmed until separation is confirmed.
- Stale or duplicate activation events have no visual or speech effect.
- Speech failure does not undo visual acknowledgement and must not automatically
  replay stale speech.
- Invalid persisted configuration must never be spoken. The application uses a
  complete valid factory configuration in memory and waits for explicit user
  reset or replacement before overwriting bad stored data.
- A confirmed reset removes saved assignments and preferences and restores the
  complete factory configuration.

## First-prototype acceptance path

The first narrow proof of concept is complete when:

1. One hand is visible through a standard webcam.
2. At least one non-thumb fingertip can contact its same-hand thumb.
3. One contact creates one activation.
4. Holding the contact does not retrigger it.
5. Separation rearms the finger.
6. The assigned expression is highlighted immediately.
7. A compatible robotic voice begins within the latency target under normal
   conditions.

The first full prototype then expands the same path to:

- two hands and all eight non-thumb fingers;
- eight locally editable and persistent assignments;
- English and Mandarin assignments across different fingers;
- one locked voice per language;
- global newest-tap playback with no delayed queue;
- deterministic first-confirmed-first-served dispatch;
- fingertip-adjacent labels and contact feedback;
- camera, tracking, validation, and recovery states;
- privacy, accessibility, and performance checks.

## Shared finger identifiers

All subsystems should use stable identifiers:

- `left_index`
- `left_middle`
- `left_ring`
- `left_pinky`
- `right_index`
- `right_middle`
- `right_ring`
- `right_pinky`

Mirroring the camera preview must never change these semantic identifiers.

## Architecture decision status

The architecture decisions formerly listed as open are resolved for the first
prototype. Exact validation, state transitions, event schemas, voice routing,
ordering, latency measurement, and recovery rules are in
[`ARCHITECTURE_SPEC.md`](ARCHITECTURE_SPEC.md). Accepted product decisions,
architecture-owned resolutions, and non-normative provisional recommendations
are distinguished in [`DECISIONS.md`](DECISIONS.md).
