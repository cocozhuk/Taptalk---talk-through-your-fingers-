# TapTalk Prototype Release Readiness

Status: runnable integration scaffold; not an accepted full prototype

## Verified in this scaffold

- The app runs from a local static server with one pinned MediaPipe runtime
  dependency and a checked-in hand-landmarker model.
- The browser asks for camera access only after an explicit user action.
- The integration layer does not upload, record, or persist camera frames.
- Configuration contains exactly eight assignments and persists only through
  browser local storage.
- Reset removes the persisted configuration and restores safe defaults.
- English and Mandarin expression rules reject mixed or ambiguous input.
- The UI exposes exactly four TapTalk voice identities through two
  per-language preferences.
- Activation batches use timestamp order and the documented stable finger-ID
  tie-break.
- Speech uses a first-wins busy gate: one request is active and later rapid
  taps are discarded rather than added to the browser queue.
- Up to two hands are detected locally with MediaPipe landmarks.
- The specialist contact state machine is wired to the webcam path and requires
  separation before rearming a finger.
- Live fingertip expression labels follow unmirrored landmark coordinates in a
  mirrored preview.
- The manual press-and-hold harness suppresses repeated activation until
  release, works with pointer or keyboard input, and remains a fallback.
- Latency instrumentation reports sample count, median, and 95th percentile.

## Awaiting specialist implementation or evidence

| Acceptance area | Current state | Required owner/evidence |
|---|---|---|
| One/two-hand landmarks | Integrated, not device-qualified | Camera/device matrix and handedness checks |
| Thumb-to-fingertip contact confirmation | Integrated and unit-tested | Physical threshold calibration |
| Jitter, occlusion, hand loss and rearming | State machine tested | Real-world reliability results |
| Live fingertip-adjacent label positions | Integrated | Visual tests across devices and occlusion |
| Four charming robotic identities | Browser speech profiles only | Robotic Voices implementation/evaluation |
| First-wins speech with no stale backlog | Integrated and unit-tested | Physical rapid-tap verification |
| Audible onset within 500 ms | Instrumented, not qualified | Real adapters and physical-device measurement |
| Complete recovery/calibration UX | Basic camera errors only | Interface Design and QA review |
| Accessibility acceptance | Basic semantic/keyboard/reduced-motion support | QA accessibility audit |
| Privacy acceptance | Architecture review only | QA network/storage/runtime verification |

## Known limitations

- Hand landmarks and contact detection are a first-prototype implementation,
  not sign-language or arbitrary-gesture recognition.
- Browser Speech Synthesis may queue requests internally, so the integration
  submits only the earliest request and discards taps while it is active.
- Audible start telemetry uses the browser utterance `start` event, which is not
  a substitute for acoustic measurement.
- Static label positions are used only while the camera is off; live positions
  come from camera landmarks.
- Browser compatibility and performance have not yet been qualified across the
  target device matrix.

## Unresolved integration questions

- The Robotic Voices handoff must identify a local synthesis path that supports
  editable English and Mandarin expressions with genuinely overlapping output.
