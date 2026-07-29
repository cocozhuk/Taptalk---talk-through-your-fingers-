# TapTalk Prototype Release Readiness

Status: first local and hosted prototype implemented; ready for controlled
macOS + Chrome testing

Last updated: 2026-07-30

## Verified in the current prototype

- The app runs from a local static server with one pinned MediaPipe runtime
  dependency and a checked-in hand-landmarker model.
- The browser asks for camera access only after an explicit user action.
- The integration layer does not upload or persist camera frames by default.
  User-initiated recording saves the mirrored camera, fingertip overlays, and
  locally generated speech audio as a local browser download, with
  visible recording state.
- Configuration contains exactly eight assignments and persists only through
  browser local storage.
- Reset removes the persisted configuration and restores safe defaults.
- English and Mandarin expression rules reject mixed or ambiguous input.
- The UI exposes no voice picker. English uses Piper
  `en_US-hfc_female-medium`; Mandarin uses Matcha
  `matcha-icefall-zh-baker`.
- Voice preparation begins on page load, reports combined progress, and blocks
  camera start until both local models are ready.
- Activation batches use timestamp order and the documented stable finger-ID
  tie-break.
- Speech uses one global newest-wins lane: every new tap interrupts the current
  phrase and no stale request is queued.
- Local speech supports immediate newest-tap preemption and is routed to
  both the speakers and the recording stream.
- Up to two hands are detected locally with MediaPipe landmarks.
- The specialist contact state machine is wired to the webcam path and requires
  separation before rearming a finger.
- Live fingertip expression labels follow unmirrored landmark coordinates in a
  mirrored preview.
- The manual press-and-hold harness suppresses repeated activation until
  release, works with pointer or keyboard input, and remains a fallback.
- Latency instrumentation reports sample count, median, and 95th percentile.
- The automated regression suite contains 93 passing tests and the production
  build completes successfully.

## Awaiting specialist implementation or evidence

| Acceptance area | Current state | Required owner/evidence |
|---|---|---|
| One/two-hand landmarks | Integrated, not device-qualified | Camera/device matrix and handedness checks |
| Thumb-to-fingertip contact confirmation | Integrated and unit-tested | Physical threshold calibration |
| Jitter, occlusion, hand loss and rearming | State machine tested | Real-world reliability results |
| Live fingertip-adjacent label positions | Integrated | Visual tests across devices and occlusion |
| Two locked local language voices | Piper English and Matcha Mandarin integrated | Listening evaluation on supported devices |
| Global newest-tap speech preemption | Web Audio interruption integrated | Physical rapid-sequence verification |
| Audible onset within 500 ms | Instrumented, not qualified | Real adapters and physical-device measurement |
| Complete recovery/calibration UX | Basic camera errors only | Interface Design and QA review |
| Accessibility acceptance | Basic semantic/keyboard/reduced-motion support | QA accessibility audit |
| Privacy acceptance | Architecture review only | QA network/storage/runtime verification |

## Known limitations

- Hand landmarks and contact detection are a first-prototype implementation,
  not sign-language or arbitrary-gesture recognition.
- Local setup requires `npm run setup:matcha` once. The checked-in Matcha
  models occupy approximately 125 MB, and the English Piper model downloads on
  first use.
- Hosted Mandarin uses a Vercel Python function containing the same Matcha
  model and 150 ms one-character crop. Cold starts and hosted synthesis latency
  still require production measurement.
- Audible-start telemetry estimates output onset and is not a substitute for
  acoustic loopback measurement.
- Static label positions are used only while the camera is off; live positions
  come from camera landmarks.
- Browser compatibility and performance have not yet been qualified across the
  target device matrix.

## Remaining release evidence

- Run first-use tests from an empty browser cache on supported macOS + Chrome
  devices.
- Record physical tap accuracy, false activations, audible latency, and
  recording synchronization across representative lighting and cameras.
- Complete a focused accessibility and privacy audit before making broader
  conformance or compatibility claims.
