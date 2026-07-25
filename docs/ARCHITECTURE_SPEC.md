# TapTalk Prototype Architecture Specification

Status: normative for the first prototype

Owner: Product Architecture

Decision date: 2026-07-25

This specification turns the product boundaries in
[`PRODUCT_CONTRACT.md`](PRODUCT_CONTRACT.md) into behavior that the specialist
subsystems can implement and test independently. The Product Contract remains
authoritative for scope. This document is authoritative for detailed prototype
behavior, and [`DECISIONS.md`](DECISIONS.md) records the source and status of
the decisions.

The words **must**, **must not**, **should**, and **may** are normative. A
specialist must raise a contract-change request rather than silently implement
different behavior.

## 1. Shared terms and identifiers

### Finger IDs and order

Every subsystem must use these semantic IDs:

1. `left_index`
2. `left_middle`
3. `left_ring`
4. `left_pinky`
5. `right_index`
6. `right_middle`
7. `right_ring`
8. `right_pinky`

The list order is also the simultaneous-contact priority, from highest to
lowest. `left` and `right` describe the user's hands, never screen position.
Mirroring the preview must not change an ID.

### Session, frame, and clock

- A `trackingSessionId` identifies one uninterrupted camera/tracking session.
  It must change after a camera restart, stream replacement, or recovery from a
  terminal tracking failure.
- A `frameSequence` is an integer that starts at zero or one and strictly
  increases within a tracking session in camera-capture order.
- Every duration and event timestamp must use one monotonic clock origin.
  Wall-clock time must not determine event order or latency.
- `capturedAtMs` is the monotonic capture timestamp of a frame.
- Frames emitted by Hand Tracking must have increasing `frameSequence` and
  nondecreasing `capturedAtMs`.

## 2. Assignment and language model

### Stored assignment

Each of the eight finger IDs has exactly one saved assignment:

```text
Assignment {
  fingerId: FingerId
  text: string
  language: "en" | "zh"
}
```

`language` is an explicit user choice and is the only source of truth for
validation and voice routing. Script inspection validates that choice; it must
not silently change it. An editor may hold an invalid draft, but invalid or
empty text must never replace the last valid saved assignment.

Saving is atomic: normalize, validate, then replace both `text` and `language`
together. Live activations continue to use the last valid saved assignment
while a draft is being edited.

### Common normalization

Before validation:

1. Normalize the draft to Unicode NFC.
2. Remove Unicode whitespace from both ends.
3. Reject control or format characters and line or paragraph separators,
   including zero-width characters and bidi controls.

English then collapses every remaining run of Unicode whitespace to one ASCII
space. Mandarin does not collapse internal whitespace; any internal whitespace
is invalid.

Normalization must not transliterate, translate, remove emoji, remove digits,
or convert one script to another.

### English grammar

An English expression is valid only when all of these are true:

- It contains one to five whitespace-delimited tokens after normalization.
- Every token contains one Latin-script lexical unit.
- A lexical unit is one or more Unicode Latin letters, with combining marks
  permitted only when attached to a preceding Latin letter.
- A token may join lexical units with a straight apostrophe (`'`), curly
  apostrophe (`’`), or ASCII hyphen (`-`), but a joiner must have a lexical unit
  on both sides.
- A token may end with at most one of comma, period, exclamation mark, or
  question mark (`,`, `.`, `!`, `?`).
- No other character is permitted.

Punctuation and joiners do not add units; each whitespace-delimited token is
one word. Accented Latin letters are valid. Han characters, non-Latin letters,
digits, emoji, standalone punctuation, repeated terminal punctuation, and
unsupported symbols are invalid.

Examples:

| Draft | Result |
|---|---|
| `  Thank   you! ` | valid; save as `Thank you!`; 2 units |
| `I'm okay.` | valid; 2 units |
| `well-being matters` | valid; 2 units |
| `help me please now quickly today` | invalid; 6 units |
| `hello123` | invalid; digit |
| `hello 世界` | invalid; mixed Latin and Han lexical content |
| `hello 😊` | invalid; emoji |

### Mandarin grammar

After common normalization, let `H` be one Unicode code point whose Unicode
Script property is Han. A Mandarin expression is valid only when:

- it contains one to five `H` code points;
- it contains no internal whitespace;
- its complete form matches `H+ (S H+)* T?`, where spaces in this notation are
  explanatory only:
  - `S` is one internal separator from `,`, `，`, or `、`;
  - `T` is one terminal mark from `.`, `!`, `?`, `。`, `！`, or `？`;
- it contains no other character.

Each Han code point is one unit. Permitted punctuation does not add units.
Punctuation is preserved as entered. Arabic and full-width digits, Latin
letters or pinyin, emoji, non-Han letters, unsupported symbols, repeated
punctuation, and leading punctuation are invalid. A Han character that also
serves as a Chinese numeral, such as `一`, remains a Han unit and is valid.

Script validation cannot prove natural-language meaning. Han-only text
explicitly declared as `zh` is treated as Mandarin; the prototype does not
attempt to distinguish Chinese from other uses of Han script.

Examples:

| Draft | Result |
|---|---|
| `你好` | valid; 2 units |
| `你好，朋友！` | valid; 4 units |
| `一二三四五` | valid; 5 units |
| `你 好` | invalid; internal whitespace |
| `你好6` | invalid; digit |
| `你好 friend` | invalid; mixed Han and Latin lexical content |
| `你好😊` | invalid; emoji |

### Validation result and error priority

Validation returns either the normalized value and unit count or one error:

```text
ValidationSuccess {
  valid: true
  normalizedText: string
  language: "en" | "zh"
  unitCount: 1 | 2 | 3 | 4 | 5
}

ValidationFailure {
  valid: false
  code:
    | "required"
    | "mixed_script"
    | "wrong_script"
    | "unsupported_character"
    | "invalid_spacing"
    | "invalid_punctuation"
    | "too_many_units"
  language: "en" | "zh"
}
```

If more than one rule fails, return the first applicable code in this order:

1. `required` when no content remains after trimming.
2. `mixed_script` when both Latin and Han lexical content occur.
3. `wrong_script` when the text has lexical content only from the other
   supported language.
4. `unsupported_character` for controls, digits, emoji, non-Latin/non-Han
   letters, or Unicode symbols outside the grammar.
5. `invalid_spacing`.
6. `invalid_punctuation` for punctuation outside the selected grammar or
   punctuation in an invalid position or sequence.
7. `too_many_units`.

The interface may explain errors in friendlier language, but automated logic
and tests must use these stable codes. A mixed-script message must explain that
English and Mandarin may be assigned to different fingers, but not combined in
one assignment.

## 3. Contact and rearm state machine

### Observation contract

For each non-thumb finger, Hand Tracking derives one observation per usable
frame:

- `separated`: distance is at or beyond the release threshold;
- `approaching`: distance lies between the contact and release thresholds;
- `contact`: distance is at or inside the contact threshold;
- `unusable`: required landmarks or stable semantic hand identity are not
  reliable enough to classify.

The release threshold must be strictly farther than the contact threshold.
This hysteresis is mandatory, while the calibrated spatial values are owned by
Hand Tracking. Contact and separation evidence must never both be true for one
finger in one frame. Handedness uncertainty, an identity swap risk, or missing
thumb/fingertip landmarks makes the observation `unusable`.

### Normative timing constants

| Constant | Prototype value | Meaning |
|---|---:|---|
| `CONTACT_CONFIRM_MS` | 60 ms | Minimum continuous contact evidence before activation |
| `CONTACT_CONFIRM_SAMPLES` | 2 | Minimum usable contact samples in that dwell |
| `SEPARATION_CONFIRM_MS` | 120 ms | Minimum continuous separation evidence before arming/rearming |
| `SEPARATION_CONFIRM_SAMPLES` | 3 | Minimum usable separated samples in that dwell |
| `TRACKING_GAP_MS` | 100 ms | Maximum unusable or missing-frame gap that preserves durable armed/held state |

A dwell passes only when both its time and sample-count requirements pass.
Elapsed time is the difference between the first qualifying sample's
`capturedAtMs` and the current qualifying sample's `capturedAtMs`. A
nonqualifying or `unusable` observation immediately clears an in-progress dwell
and its sample count. Time during an unusable gap never contributes to a dwell.

### States

Each finger has one durable state:

- `untracked`: no trustworthy current track; disarmed.
- `rearm_required`: visible, but activation is blocked until separation is
  confirmed.
- `separated`: separation is confirmed; armed.
- `approaching`: armed and inside the hysteresis region.
- `contact_candidate`: armed with an in-progress contact dwell.
- `held`: an activation was emitted; disarmed until separation is confirmed.

`activation_confirmed` and `rearmed` are transition events, not durable states.
The UI may render a brief confirmation effect without changing this model.

### State transitions

| Current state | Observation or condition | Next state and output |
|---|---|---|
| any state | camera/tracking session ends | `untracked`; clear all dwells; no activation |
| `untracked` | first usable observation in a session/reacquisition | `rearm_required`; no activation |
| `rearm_required` | separation dwell passes | `separated`; emit `rearmed` |
| `rearm_required` | `contact` or `approaching` | remain `rearm_required`; no activation |
| `separated` | `approaching` | `approaching` |
| `separated` | first `contact` sample | `contact_candidate`; start contact dwell |
| `approaching` | `separated` | `separated` |
| `approaching` | first `contact` sample | `contact_candidate`; start contact dwell |
| `contact_candidate` | contact dwell passes | `held`; emit exactly one `activation_confirmed` |
| `contact_candidate` | `approaching` | `approaching`; cancel contact dwell |
| `contact_candidate` | `separated` | `separated`; cancel contact dwell |
| `held` | separation dwell passes | `separated`; emit `rearmed` |
| `held` | `contact` or `approaching` | remain `held`; no activation |

For `rearm_required` and `held`, the separation dwell starts on the first
`separated` sample and resets on any other observation. When an `untracked`
finger's first usable observation is `separated`, that same sample may start,
but can never by itself finish, the required separation dwell.

### Tracking gaps and reacquisition

- On the first `unusable` observation or missing expected frame, clear every
  in-progress contact or separation dwell for the affected finger.
- If usable tracking returns within `TRACKING_GAP_MS` with the same stable hand
  identity, preserve only the durable armed/disarmed condition:
  - a previously armed finger may start fresh contact evidence;
  - a previously `held` or `rearm_required` finger remains disarmed and must
    complete a fresh separation dwell.
- If the gap exceeds `TRACKING_GAP_MS`, enter `untracked`. Reacquisition always
  enters `rearm_required`, even when the first observed posture is contact.
- A finger visible in contact when the application first starts, a camera
  resumes, a tab wakes, or a hand is reacquired must not activate. It must
  separate for the full separation dwell first.

These rules guarantee one activation per sustained touch and prevent hand loss
or reacquisition from synthesizing a touch.

## 4. Tracking events and deterministic dispatch

### Required tracking event

Hand Tracking exposes activation events with at least:

```text
ActivationConfirmed {
  schemaVersion: 1
  type: "activation_confirmed"
  eventId: string
  trackingSessionId: string
  frameSequence: integer
  confirmedAtMs: number
  contactEvidenceStartedAtMs: number
  fingerId: FingerId
  confidence: number
}
```

- `confirmedAtMs` is the `capturedAtMs` of the frame that satisfied the contact
  dwell, not the later delivery time.
- `contactEvidenceStartedAtMs` is the `capturedAtMs` of the first sample in the
  uninterrupted dwell that led to this activation.
- `eventId` must be unique for the tuple of session, frame, finger, and event
  type and stable if delivery is retried.
- `confidence` is normalized to the closed interval 0 through 1, with 1 as
  highest confidence, and is diagnostic. Downstream systems must not
  reinterpret a confirmed activation by applying a second undocumented
  confidence threshold.
- A frame may contain multiple activation events. Hand Tracking must deliver
  them as one frame-correlated batch or otherwise preserve their common
  `frameSequence`.

The shared frame boundary is:

```text
TrackingFrame {
  schemaVersion: 1
  trackingSessionId: string
  frameSequence: integer
  capturedAtMs: number
  fingers: FingerState[8]
  activations: ActivationConfirmed[]
  rearms: Rearmed[]
}

FingerState {
  fingerId: FingerId
  state:
    | "untracked"
    | "rearm_required"
    | "separated"
    | "approaching"
    | "contact_candidate"
    | "held"
  observation: "unusable" | "separated" | "approaching" | "contact"
  confidence: number
}

Rearmed {
  schemaVersion: 1
  type: "rearmed"
  eventId: string
  trackingSessionId: string
  frameSequence: integer
  rearmedAtMs: number
  fingerId: FingerId
  confidence: number
}
```

`rearmedAtMs` is the `capturedAtMs` of the frame that satisfied the separation
dwell. `fingers` contains exactly one entry per fixed finger ID; an unobserved
finger uses `untracked`, `unusable`, and confidence `0`. Tracking may add
landmark positions and implementation diagnostics without changing these
fields. A complete `TrackingFrame` must be delivered before any later frame.

### Acceptance and deduplication

App State accepts a `TrackingFrame` atomically only when its
`trackingSessionId` is current and its `frameSequence` is strictly greater than
the last accepted frame sequence for that session. Within an accepted frame,
an activation is accepted only when its session, frame, and confirmation time
match the parent frame, its `eventId` has not already been accepted, and its
finger ID is one of the eight fixed IDs.

A stale or repeated frame is rejected as a whole. A duplicate or malformed
activation in an otherwise accepted frame is rejected individually. Neither
case produces visual activation or speech. After sorting and dispatching the
accepted events, App State records the frame sequence as processed. The
accepted `eventId` is the activation ID used by every downstream effect.

### Total dispatch order

Activation order is:

1. lower `confirmedAtMs`;
2. when timestamps are equal but frames differ, lower `frameSequence`;
3. for activations confirmed in the same frame, the fixed finger priority from
   section 1.

All activations from one frame must be sorted as a batch before dispatch.
Mirroring, landmark array order, asynchronous callback order, and object-key
order must never affect dispatch.

Dispatch order selects the single earliest activation admitted to speech.
While that request is active, later confirmations are consumed and reported as
busy-time drops. They are not submitted to the voice subsystem and never play
later from a backlog.

## 5. Activation snapshot and voice selection

### Preferences

The final prototype selection model has exactly two saved preferences:

```text
VoicePreferences {
  en: "masculine" | "feminine"
  zh: "masculine" | "feminine"
}
```

They select exactly four user-facing TapTalk identities:

| Assignment language | Preference | Voice ID |
|---|---|---|
| `en` | `masculine` | `en_masculine` |
| `en` | `feminine` | `en_feminine` |
| `zh` | `masculine` | `zh_masculine` |
| `zh` | `feminine` | `zh_feminine` |

There is no per-finger voice setting, automatic speaker-gender choice, or
system-voice catalogue. Changing the English preference must not change the
Mandarin preference, and vice versa.

### Dispatch snapshot

When an activation is accepted, App State atomically snapshots:

```text
ActivationDispatch {
  activationId: string
  trackingSessionId: string
  fingerId: FingerId
  confirmedAtMs: number
  frameSequence: integer
  text: string
  language: "en" | "zh"
  voiceId:
    | "en_masculine"
    | "en_feminine"
    | "zh_masculine"
    | "zh_feminine"
}
```

The same snapshot drives immediate visual acknowledgement and the speech
request. Edits or preference changes after the snapshot affect only future
activations. A speech backend must reject a language/voice mismatch rather than
silently substitute another TapTalk identity.

The earliest accepted activation submits one speech request. Until it ends or
fails, later activations are discarded with visual feedback. An audio failure
must not undo the visual activation or automatically replay stale speech; once
the busy gate is released, the next deliberate activation may try again.

The voice subsystem returns correlated telemetry:

```text
SpeechTelemetry {
  activationId: string
  speechRequestedAtMs: number
  status: "audible" | "failed" | "cancelled"
  audibleOnsetAtMs?: number
  errorCode?: string
}
```

`audibleOnsetAtMs` is required only for `audible`; `errorCode` is required for
`failed`. A repeated request with an already accepted `activationId` must not
create a second playback.

## 6. Latency and telemetry

### Measurement points

All points use the shared monotonic clock:

- `confirmedAtMs`: capture time of the frame that confirmed contact.
- `visualPresentedAtMs`: time of the first rendered UI frame known to contain
  the selected-expression acknowledgement.
- `speechRequestedAtMs`: time the voice subsystem accepts the dispatch.
- `audibleOnsetAtMs`: time the first non-silent sample for that activation
  begins at the application's final audio output graph.

Calling a speech API, decoding an asset, or scheduling an audio node is not
audible onset. If an environment cannot expose output-graph onset, tests must
label the measurement as a proxy rather than claim physical audible onset.
Hardware loopback may be used to measure speaker onset and must be reported
separately because it includes device/output buffering.

Per activation:

```text
visualLatencyMs = visualPresentedAtMs - confirmedAtMs
speechDispatchLatencyMs = speechRequestedAtMs - confirmedAtMs
audioOnsetLatencyMs = audibleOnsetAtMs - confirmedAtMs
```

Failed or cancelled speech is a failure outcome, not a latency of zero and not
an omitted sample.

### Prototype performance requirements

Under normal warmed conditions:

- visual latency p95 must be at most 100 ms;
- speech dispatch latency p95 must be at most 50 ms;
- audio onset latency p95 must be at most 500 ms.

Normal warmed conditions mean the camera and tracker are running, camera and
audio permissions are already resolved, the audio context is unlocked, needed
voice resources are loaded, and the test uses a documented supported device
and browser without deliberate CPU/network throttling. Cold start, permission
prompts, and recovery runs must be reported separately and must not be mixed
into the warmed distribution.

For each path, QA must report sample count, p50, p95, maximum, and failure
count, with at least 100 successful single-activation trials for the primary
warmed result. Concurrent activations require a separate distribution with the
same per-activation correlation. A best-case result alone is not evidence of
acceptance.

Physical-contact-to-confirmation time is a separate tracking metric. It is not
part of the 500 ms audio target, but Hand Tracking must report it so a long
dwell or processing delay cannot be hidden.

## 7. Recovery and failure behavior

| Condition | Required behavior |
|---|---|
| Brief unusable tracking, at most 100 ms | Clear dwell timers, preserve durable armed/held condition, and resume only with fresh evidence. |
| Hand loss or unusable tracking over 100 ms | Put affected fingers in `untracked`, suppress activations, then require confirmed separation after reacquisition. |
| Handedness or identity uncertainty | Treat affected observations as `unusable`; never swap left/right assignments to follow screen position. |
| Camera permission denied | Enter a non-active permission state, explain how to retry, emit no tracking or activation events, and preserve local configuration. |
| Camera interrupted or unavailable | Stop accepting tracking events, show camera inactive/error state, preserve configuration, and create a new tracking session on recovery. |
| Tab/device resumes after a frame gap | Treat the gap as tracking loss; do not infer the pose changes that happened while suspended. |
| Stale or duplicate event | Reject it without visual or speech effects. |
| Speech request fails before onset | Keep visual confirmation, expose a non-blocking audio error correlated to the activation, record failure telemetry, and do not auto-retry. |
| Configuration fails schema or validation checks at load | Do not speak invalid data; use a complete valid factory configuration in memory, retain the bad stored value until the user explicitly resets or replaces it, and show a recovery notice. |
| User confirms reset | Remove persisted assignments and voice preferences, load the complete factory configuration, and leave camera permission state unchanged. |

Camera or tracking loss does not cancel speech that was already dispatched;
that speech represents a previously confirmed deliberate activation. Reset may
cancel speech that has not reached audible onset when the backend supports
correlated cancellation, but must not replay or substitute it.

The prototype must ship a complete factory configuration containing eight
valid assignments and two valid voice preferences so first run and recovery
never create missing assignments. The exact factory expression copy is product
content, not an expansion of this behavioral contract; it must pass the same
validator and be documented by Integration before release.

## 8. Subsystem interface contract

### Hand Tracking

- Own spatial calibration and confidence computation.
- Emit ordered, session-scoped frame state, `activation_confirmed`, and
  `rearmed` data using sections 1, 3, and 4.
- Never emit an activation before confirmed separation or on reacquisition.
- Provide physical-contact-to-confirmation telemetry.

### Interface Design

- Render semantic finger IDs correctly in a mirrored preview.
- Present `untracked`, `rearm_required`, `separated`, `approaching`,
  `contact_candidate`, `held`, activation, camera, and audio-error feedback.
- Keep invalid editor drafts separate from saved assignments.
- Show stable validation messages for the codes in section 2.
- Expose two language-specific masculine/feminine preferences representing
  exactly four TapTalk identities.

### Robotic Voices

- Accept `ActivationDispatch` speech fields and preserve the supplied
  language/voice pairing.
- Deduplicate by `activationId`, keep at most one request active, and return
  onset/failure telemetry correlated to that ID.
- Expose no additional identity or operating-system catalogue to the user.

### App State and Storage

- Own the saved assignment/preference model, validator, atomic snapshots,
  event deduplication, deterministic sorting, persistence versioning, reset,
  and recovery from invalid stored data.
- Use one accepted activation to produce one visual dispatch and one speech
  request from the same snapshot.
- Never persist camera frames or landmark streams.

### QA, Accessibility, and Privacy

- Derive state-transition, grammar, ordering, routing, recovery, and latency
  tests directly from this specification.
- Exercise all eight IDs, mixed-language finger configurations, simultaneous
  frames, tracking gaps on both sides of 100 ms, held contacts, and failure
  recovery.
- Verify local configuration and local webcam-frame handling, and distinguish
  measured output-graph onset from physical speaker onset.

### Integration and Prototype

- Preserve the schemas and shared monotonic time correlation across subsystem
  boundaries.
- Provide a complete factory configuration, version it, and document its
  validated values.
- Ensure one-frame activation batches are reduced deterministically and only
  the earliest activation is admitted while speech is busy.
- Record any unavoidable platform proxy or deviation as a contract-change
  request before calling the prototype accepted.
