# TapTalk Prototype Release Readiness

Status: runnable integration scaffold; not an accepted full prototype

## Verified in this scaffold

- The app runs from a local static server with no package dependencies.
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
- Speech requests are submitted without application-level global
  serialization.
- The manual press-and-hold harness suppresses repeated activation until
  release and works with pointer or keyboard input.
- Latency instrumentation reports sample count, median, and 95th percentile.

## Awaiting specialist implementation or evidence

| Acceptance area | Current state | Required owner/evidence |
|---|---|---|
| One/two-hand landmarks | Placeholder | Hand Tracking adapter and device tests |
| Thumb-to-fingertip contact confirmation | Placeholder | Hand Tracking state machine |
| Jitter, occlusion, hand loss and rearming | Manual harness only | Hand Tracking reliability results |
| Live fingertip-adjacent label positions | Demonstration positions | Tracking coordinates + Interface UI |
| Four charming robotic identities | Browser speech profiles only | Robotic Voices implementation/evaluation |
| Guaranteed overlapping spoken playback | Not guaranteed by browser speech | Robotic Voices independent audio pipeline |
| Audible onset within 500 ms | Instrumented, not qualified | Real adapters and physical-device measurement |
| Complete recovery/calibration UX | Basic camera errors only | Interface Design and QA review |
| Accessibility acceptance | Basic semantic/keyboard/reduced-motion support | QA accessibility audit |
| Privacy acceptance | Architecture review only | QA network/storage/runtime verification |

## Known limitations

- The current contact controls are a clearly labeled development harness, not
  gesture or sign-language recognition.
- Browser Speech Synthesis may serialize requests and its installed voices vary
  by device. It is retained only as a no-dependency integration fallback.
- Audible start telemetry uses the browser utterance `start` event, which is not
  a substitute for acoustic measurement.
- The static label layout is not derived from camera landmarks.
- Browser compatibility and performance have not yet been qualified across the
  target device matrix.

## Unresolved integration questions

- Product Architecture must accept or replace the provisional finger-ID
  tie-break in `docs/INTEGRATION_PLAN.md`.
- Product Architecture must confirm the per-language masculine/feminine
  preference model before the voice interface is frozen.
- Specialist handoffs must agree on the monotonic timestamp origin and one-batch
  per-frame event delivery.
- The Robotic Voices handoff must identify a local synthesis path that supports
  editable English and Mandarin expressions with genuinely overlapping output.

