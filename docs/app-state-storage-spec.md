# TapTalk App State, Event, and Storage Specification

Status: specialist interface proposal for Integration

This document specifies the dependency-free application core owned by App State
and Storage. It applies the current product contract and provisional decisions
without defining tracking thresholds, UI layout, or voice processing.

## Invariants

- The semantic finger set is exactly:
  `left_index`, `left_middle`, `left_ring`, `left_pinky`, `right_index`,
  `right_middle`, `right_ring`, and `right_pinky`.
- A valid configuration has exactly one valid expression for every finger.
- An expression is either English (`en`) or Mandarin Chinese (`zh`), never
  mixed.
- Voice preference is stored independently for `en` and `zh`; each preference
  is `masculine` or `feminine`.
- Persisted data contains only assignments, language tags, voice preferences,
  and a schema version. Tracking events and camera data are never persisted.
- Routing is deterministic. Speech requests are submitted in activation order
  but are not placed behind a global completion queue.

## Validation

Input is normalized with Unicode NFC and outer whitespace is trimmed.

The provisional safe parser accepts:

- English: one to five whitespace-delimited tokens, where every code point in
  every token is a Unicode Latin-script letter.
- Mandarin: one to five adjacent Unicode Han-script code points.

All punctuation, digits, emoji, other scripts, and internal whitespace in
Mandarin are rejected as ambiguous. Input containing both Latin and Han lexical
content is rejected as mixed-language input. This deliberately conservative
policy implements the current decision log and can be replaced behind the same
result interface if Product Architecture later refines the rule.

Successful validation returns normalized text, detected language, and unit
count. Failure returns one of these stable codes:

- `empty`
- `mixed_language`
- `ambiguous_characters`
- `english_too_many_words`
- `mandarin_too_many_characters`

`validateExpression(text)` is the canonical classifier and validator.
`updateAssignment(configuration, fingerId, text)` uses its result and never
accepts a caller-supplied language that could disagree with the text.

## Configuration state

```text
Configuration {
  assignments: {
    [FingerId]: { text: string, language: "en" | "zh" }
  },
  voicePreferences: {
    en: "masculine" | "feminine",
    zh: "masculine" | "feminine"
  }
}
```

The core does not invent the eight initial phrases. Integration supplies one
known-valid fallback configuration to the store constructor. The constructor
validates it immediately. This preserves the exactly-eight invariant while
leaving initial product copy to Product Architecture and Integration.

Configuration updates are immutable:

```text
updateAssignment(config, fingerId, text)
  -> { ok: true, configuration, assignment }
   | { ok: false, error }

updateVoicePreference(config, language, preference)
  -> { ok: true, configuration }
   | { ok: false, error }
```

## Tracking input and routing state

Hand Tracking sends complete, monotonically sequenced batches:

```text
ContactBatch {
  frameSequence: non-negative safe integer,
  contacts: ContactConfirmation[]
}

ContactConfirmation {
  eventId: non-empty string,
  fingerId: FingerId,
  confirmedAtMs: finite non-negative monotonic timestamp
}
```

A batch must contain every confirmation sharing its frame or timestamp. This
atomic boundary is required so the router can apply its deterministic tie-break
before emitting effects. Tracking owns contact confirmation and rearming; the
app core does not infer either from landmarks.

Routing state is transient and session-only:

```text
RouterState {
  lastFrameSequence,
  lastConfirmedAtMs,
  processedEventIds
}
```

`routeContactBatch(routerState, configuration, batch)` is a pure transition. It
returns the next state, ordered activations, ordered UI notifications, ordered
speech requests, and rejected inputs.

### Ordering

Within a batch, valid contacts are ordered by:

1. ascending `confirmedAtMs`;
2. the canonical finger order printed in the product contract and repeated
   above;
3. ascending `eventId` as a final total-order safeguard.

Across batches, `frameSequence` must strictly increase and accepted timestamps
must strictly advance beyond the preceding batch. Consequently, contacts with
an equal timestamp must arrive together. The use of the product contract's
printed finger order is provisional until Product Architecture freezes the
simultaneous-contact tie-break.

### Rejection

The router rejects and reports:

- malformed batches or contacts;
- a batch whose sequence is not newer than the last consumed sequence;
- an event ID that was already processed, including reuse in a newer batch;
- an event timestamp older than or equal to the last timestamp accepted from a
  preceding batch;
- a second confirmation for the same finger in one batch.

A structurally valid, newer batch is consumed even if some or all of its
contacts are rejected. This prevents a corrected replay from changing history.
Rejected inputs produce no UI or speech effect.

## Routed output and speech concurrency

Each accepted contact resolves its current assignment and voice identity:

```text
Activation {
  activationId: eventId,
  fingerId,
  confirmedAtMs,
  text,
  language,
  voiceIdentity:
    "en_masculine" | "en_feminine" |
    "zh_masculine" | "zh_feminine"
}
```

`dispatchRouteResult(result, sinks)` first calls the UI activation sink in
activation order. It then invokes every speech sink in that same order without
awaiting an earlier request. It returns one shared settlement promise for
diagnostics only. A speech engine may therefore overlap requests, while
submission order remains first-confirmed-first-served.

The core does not select a system voice, synthesize audio, wait for playback,
or define a robotic personality.

## Local persistence and migration

The stable storage key is `taptalk.configuration`. The current on-device schema
is version 2:

```json
{
  "schemaVersion": 2,
  "assignments": {
    "left_index": { "text": "Yes", "language": "en" }
  },
  "voicePreferences": {
    "en": "feminine",
    "zh": "masculine"
  }
}
```

The example omits the other seven required assignment entries only for
readability; stored version-2 data must contain all eight and no unknown finger
keys.

The dependency-injected storage adapter has the browser-local shape
`getItem(key)`, `setItem(key, value)`, and `removeItem(key)`. No network adapter
exists in this subsystem.

`createConfigurationStore(storage, fallbackConfiguration)` exposes:

- `load()`: read, parse, migrate, and fully validate configuration;
- `save(configuration)`: fully validate, then write version 2;
- `reset()`: remove the key and return a fresh fallback configuration.

Schema version 1 is the only legacy input:

```text
{
  schemaVersion: 1,
  assignments: {
    [FingerId]: {
      expression: string,
      language: "english" | "mandarin"
    }
  },
  voicePreferences: {
    english: "masculine" | "feminine",
    mandarin: "masculine" | "feminine"
  }
}
```

A valid version-1 value is converted atomically to version 2 and the migrated
value is written back locally. Malformed, missing, or unsupported future data
returns the fallback plus a warning and is not overwritten. Storage API
failures are reported as results rather than crashing the app.

Reset removes only TapTalk configuration. It does not clear unrelated browser
storage. Transient router history is intentionally retained by a running app
controller so reset cannot make an already processed tracking event eligible
again; a new application session creates a new router state.

## Integration interfaces

- Hand Tracking calls `routeContactBatch` with complete ordered-frame batches.
- Interface Design consumes ordered `Activation` notifications and calls the
  immutable configuration update functions.
- Robotic Voices consumes `SpeechRequest`, whose `voiceIdentity` is one of the
  four TapTalk identities; the core does not pass through arbitrary voice IDs.
- Integration owns lifecycle wiring, supplies the fallback assignments and a
  local storage adapter, saves successful configuration changes, and retains
  router state between batches.

The implementation is isolated under `src/app-state/` and exports its public
surface from `src/app-state/index.mjs`.
