# TapTalk Prototype Release Readiness

Status: runnable integration scaffold; not an accepted full prototype

## Verified in this scaffold

- The app runs from a local static server with one pinned MediaPipe runtime
  dependency and a checked-in hand-landmarker model.
- The browser asks for camera access only after an explicit user action.
- The integration layer does not upload or persist camera frames by default.
  User-initiated recording saves the mirrored camera, fingertip overlays, and
  user-approved current-tab speech audio as a local browser download, with
  visible recording state.
- Configuration contains exactly eight assignments and persists only through
  browser local storage.
- Reset removes the persisted configuration and restores safe defaults.
- English and Mandarin expression rules reject mixed or ambiguous input.
- The UI exposes no voice picker; English and Mandarin use one locked default
  each.
- Activation batches use timestamp order and the documented stable finger-ID
  tie-break.
- Speech uses one global newest-wins lane: every new tap interrupts the current
  phrase and no stale request is queued.
- Browser speech remains at natural `1×` speed and supports immediate
  newest-tap preemption.
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
| Two natural locked language voices | Browser speech profiles only | Listening evaluation |
| Global newest-tap speech preemption | Dispatcher and browser cancellation integrated | Physical rapid-sequence verification |
| Audible onset within 500 ms | Instrumented, not qualified | Real adapters and physical-device measurement |
| Complete recovery/calibration UX | Basic camera errors only | Interface Design and QA review |
| Accessibility acceptance | Basic semantic/keyboard/reduced-motion support | QA accessibility audit |
| Privacy acceptance | Architecture review only | QA network/storage/runtime verification |

## Known limitations

- Hand landmarks and contact detection are a first-prototype implementation,
  not sign-language or arbitrary-gesture recognition.
- Browser Speech Synthesis identities and timing vary by device. Its global
  cancellation API matches the newest-tap policy, but it is retained only as a
  no-dependency integration fallback.
- Audible start telemetry uses the browser utterance `start` event, which is not
  a substitute for acoustic measurement.
- Static label positions are used only while the camera is off; live positions
  come from camera landmarks.
- Browser compatibility and performance have not yet been qualified across the
  target device matrix.

## Unresolved integration questions

- The Robotic Voices handoff must identify a local synthesis path that supports
  editable English and Mandarin expressions with immediate global preemption.
