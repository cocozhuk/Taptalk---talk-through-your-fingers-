# TapTalk Integration Plan

Status: integration baseline for the first runnable prototype

## Stack decision

TapTalk will use a static, local-first web application built from native
HTML, CSS, and JavaScript modules. Development, tests, and production assembly
use Node.js 20 or newer, with Node's built-in test runner and a small repository
owned static-file server/build script.

The application shell avoids a UI framework. It has one pinned runtime
dependency, `@mediapipe/tasks-vision`, for local hand landmarks:

- webcam capture, local persistence, audio output, and rendering are already
  browser capabilities;
- a framework would not reduce the risk in the tracking or voice pipelines;
- specialist implementations can be integrated behind ports without coupling
  their algorithms to a UI framework;
- the checked-in hand-landmarker model and locally served WebAssembly keep
  camera inference on the device.

The robotic-voice specialist may add a local synthesis model after proving
overlapping, intelligible English and Mandarin playback. That choice must remain
inside the voice adapter and must not change the application-facing interfaces
below.

## Browser and deployment model

- The app is served from `localhost` during development and as static files in
  production.
- Camera access uses `navigator.mediaDevices.getUserMedia` and therefore
  requires `localhost` or another secure context.
- Frames remain attached to an in-page video element. The integration shell
  does not upload, record, or persist frames.
- Assignments and voice preferences use browser `localStorage`.
- No server, account, analytics service, or network API is part of the
  prototype architecture.

## Module boundaries

```text
tracking adapter
  -> TrackingEventBatch
  -> activation dispatcher
  -> Activation
  -> UI feedback + latency telemetry + voice port

configuration UI
  -> validation
  -> ConfigRepository
  -> localStorage
```

| Area | Integration boundary | Owner |
|---|---|---|
| Shared product vocabulary | Finger IDs, event/request shapes, fixed voice IDs | Integration, reviewed by Product Architecture |
| Tracking | Produces one ordered event batch per analyzed video frame | Hand Tracking |
| App state | Validates and persists configuration; suppresses stale/duplicate activations | App State and Storage |
| UI | Renders camera, fingertip positions/states, editor, recovery and feedback | Interface Design |
| Voice | Accepts independent `SpeechRequest` calls and reports audible onset/failure | Robotic Voices |
| QA telemetry | Records confirmation-to-visual and confirmation-to-audible timing | QA, Accessibility and Privacy |
| Composition | Creates adapters, connects ports, and owns development/build commands | Integration and Prototype |

Specialist code must not import another specialist's concrete adapter. It
imports only shared contracts or receives a port during composition.

## Shared integration interfaces

These are JavaScript object contracts. Millisecond timestamps use the same
monotonic clock as `performance.now()`.

### Tracking input

The tracking adapter calls `onEvents(events)` once per analyzed frame. Events
within the array may be unordered; the dispatcher orders confirmed activations.

```js
{
  type: "activation" | "separation" | "visibility",
  fingerId: "left_index" | "...",
  sessionId: "camera-session",
  timestampMs: 1234.5,
  frameId: 42,
  confidence: 0.93,
  position: { x: 0.25, y: 0.40 } // normalized, unmirrored image coordinates
}
```

Mirroring is a display transform only and never changes `fingerId`. The
tracking adapter owns contact confirmation, held-state suppression, separation
rearming, handedness stability, and safe recovery after hand loss.

### Activation output

For each accepted activation, the dispatcher synchronously publishes:

```js
{
  activationId: "camera-session:42:left_index",
  fingerId: "left_index",
  confirmedAtMs: 1234.5,
  expression: "Thank you",
  language: "en",
  voiceId: "en_masculine"
}
```

Visual acknowledgement happens during this synchronous publication. A
`SpeechRequest` is submitted only when no earlier request is active:

```js
{
  activationId: "camera-session:42:left_index",
  text: "Thank you",
  language: "en",
  voiceId: "en_masculine",
  confirmedAtMs: 1234.5,
  onAudibleStart(startedAtMs) {},
  onError(error) {}
}
```

The voice port method is `speak(request)`. App State admits the earliest
request and discards later activations until it settles, so the voice port must
not accumulate an additional hidden queue.

### Configuration

The persisted schema is versioned and contains exactly eight assignments plus
one masculine/feminine preference for each supported language:

```js
{
  version: 1,
  assignments: {
    left_index: { text: "Yes", language: "en" }
  },
  voicePreferences: {
    en: "masculine",
    zh: "feminine"
  }
}
```

Loaders must reject malformed or incomplete stored data and return safe
defaults. Reset removes the stored record. Webcam frames and tracking landmarks
must never enter this schema.

## Deterministic dispatch

Confirmed activations are ordered by `timestampMs`. Equal timestamps use this
fixed tie-break order:

1. `left_index`
2. `left_middle`
3. `left_ring`
4. `left_pinky`
5. `right_index`
6. `right_middle`
7. `right_ring`
8. `right_pinky`

This is a provisional implementation interpretation pending Product
Architecture approval. The dispatcher deduplicates activation IDs and rejects
events older than the last accepted frame for the same tracking session.
Specialists should submit all confirmations from one video frame in the same
batch.

## End-to-end latency budget

The product target is audible onset no later than 500 ms after tracking confirms
contact under normal conditions.

| Segment | Target | Measurement |
|---|---:|---|
| Event transfer and deterministic dispatch | 10 ms | confirmed timestamp to dispatcher completion |
| Visual acknowledgement | 50 ms | confirmed timestamp to next painted highlight |
| Text/voice routing | 5 ms | dispatcher entry to `speak` call |
| Synthesis preparation or cache lookup | 250 ms | `speak` call to playable audio |
| Audio scheduling/output margin | 185 ms | playable audio to audible onset |
| Total audible onset | 500 ms | confirmed timestamp to `onAudibleStart` |

Telemetry reports sample count, median, and 95th percentile separately for
visual acknowledgement and audible onset. Browser Speech Synthesis does not
provide portable guarantees for overlap or onset timing, so the initial
fallback adapter is a wiring aid, not evidence that the voice acceptance
criteria pass.

## Integration sequence

1. Completed: establish shared constants, object contracts, deterministic
   dispatch tests, a local configuration repository, and the application shell.
2. Completed: prove editing, persistence, routing, visual feedback, and voice
   submission with the manual contact harness.
3. Completed for the first prototype: integrate MediaPipe two-hand landmarks
   with the separation-gated contact tracker while retaining the manual
   fallback.
4. Completed for the first prototype: drive fingertip expression labels from
   normalized tracking positions and states.
5. Replace browser speech fallback with the four-identity local robotic voice
   adapter and verify first-wins playback without a stale backlog.
6. Execute the QA acceptance matrix, measure latency distributions on supported
   devices, and update release readiness.

## Remaining prototype limitations

- **Tracking qualification:** live landmarks and contact/rearm logic are
  integrated, but thresholds, crossed hands, occlusion, lighting, mobility
  variation, and supported-device performance still require physical testing.
- **Manual fallback:** static positions remain visible before the camera starts
  so the complete routing path can be tested without camera permission.
- **Robotic voice production:** the browser speech adapter exposes only the four
  TapTalk identities. The first-wins gate prevents browser queue buildup, but
  the browser voices do not guarantee the intended robotic character.
- **Latency qualification:** instrumentation is wired, but acceptance requires
  real tracking and voice adapters plus device-level audible-onset measurement.
- **Recovery/calibration polish:** basic camera errors and stop/start behavior
  are present; specialist recovery and calibration behavior is still pending.

These limitations must stay visible in the running prototype and release
record. They must not be presented as completed specialist functionality.
