# Hand Tracking Design and Risk Note

Status: specialist proposal for Integration; thresholds remain provisional

## Scope and integration boundary

The hand-tracking subsystem consumes already-localized hand landmark frames and
produces deterministic per-finger tracking snapshots plus state-transition
events. It does not own camera UI, a particular landmark model, phrase
assignment, speech, persistence, or interpretation of gestures.

Because the repository has no shared application scaffold yet, the first
implementation is a dependency-free, detector-agnostic module. Integration
must supply a local webcam landmark provider and normalize its labels so
`left` and `right` mean the user's anatomical hands regardless of whether the
preview is mirrored.

## Input contract

Each frame supplies:

- a finite, monotonically nondecreasing `timestampMs` from one monotonic clock;
- a caller-stable `frameId`;
- zero, one, or two hand observations;
- for each hand, semantic `handedness`, handedness confidence, tracking
  confidence, and the 21 MediaPipe-compatible hand landmarks.

Normalized landmark coordinates are accepted. The preview transform must never
be applied to tracker coordinates. If a provider reports duplicate handedness
labels, the implementation deterministically keeps the observation with the
higher combined confidence and then the earlier input position. Repeated,
correct semantic labels are therefore more important than screen position when
hands cross.

## Output contract

Every processed frame returns:

- `fingers`: snapshots for all eight stable finger IDs, including current
  state, confidence, fingertip and thumb-tip landmarks, normalized
  thumb-to-tip distance, and whether the finger is armed;
- `events`: ordered activation, confirmed-separation, and visibility-loss
  transitions containing `fingerId`, `timestampMs`, `frameId`, `state`, and
  confidence.

Activation events use state `activated`. Sustained contact then reports `held`
in snapshots without another activation. Confirmed continuous separation emits
`separated`. A visible-to-missing transition emits `not_visible`. Reacquisition
while touching cannot activate: that finger must first pass confirmed
separation and rearm.

Events are ordered by timestamp. Events confirmed in the same frame use this
provisional tie-break:

`left_index`, `left_middle`, `left_ring`, `left_pinky`, `right_index`,
`right_middle`, `right_ring`, `right_pinky`.

## Contact state machine

Contact distance is divided by palm scale (wrist to middle-finger MCP), so the
threshold follows camera distance. Defaults are intentionally conservative and
configurable:

- contact at or below `0.32` palm scale;
- separation at or above `0.48` palm scale;
- two consecutive visible frames to confirm contact;
- two consecutive visible frames to confirm separation;
- minimum usable combined landmark confidence `0.50`.

The gap between contact and separation is hysteresis. Frames in that gap retain
held behavior and reset an unconfirmed contact candidate rather than
oscillating. A finger starts unarmed after construction or hand loss. It
becomes armed only after confirmed separation. Invalid scale, low confidence,
missing hands, or missing landmarks are treated as not visible; they never
count toward contact confirmation.

## Integration hook

Import `ContactTracker` from `src/hand-tracking/index.mjs`, construct one
tracker for a camera stream, and call `processFrame` once per detector result.
The module has no runtime dependencies. Its focused verification command is
`node --test test/hand-tracking/contact-tracker.test.mjs`.

## Risks and provisional assumptions

- Thresholds and consecutive-frame counts have not been calibrated against
  real users, cameras, skin tones, lighting, mobility ranges, or frame rates.
  They require QA measurement of false activations, misses, and latency.
- Frame-count confirmation has latency proportional to camera frame time. A
  future revision may add elapsed-time bounds after measured evidence.
- Two-dimensional landmark distance can appear small when fingertips overlap
  in the image but are separated in depth. The module includes `z` when a
  provider supplies it, but model depth quality still limits contact certainty.
- Provider handedness may flip under mirroring or during crossing/occlusion.
  Integration must normalize semantic labels before this boundary; a future
  tracker may add persistent hand identities if provider behavior requires it.
- Dropping immediately to `not_visible` is safe against false activation but
  can make intermittent low-confidence input feel unresponsive. Reacquisition
  deliberately favors safety by requiring observed separation.
- `frameId` is only correlation data; timestamps determine dispatch order.
  Timestamp regression is rejected rather than silently reordered.

## Requested architecture confirmations

Product Architecture should confirm or revise the provisional thresholds,
confirmation timing, hand-loss recovery rule, and simultaneous-event tie-break
before the public interface is frozen.
