# TapTalk Risk-Based Acceptance Matrix

Status: QA baseline for the narrow proof and first full prototype

Contract baseline reviewed: 2026-07-25

Owner: QA, Accessibility and Privacy

## Purpose and authority

This matrix translates
[`docs/PRODUCT_CONTRACT.md`](../PRODUCT_CONTRACT.md) and
[`docs/DECISIONS.md`](../DECISIONS.md) into verifiable acceptance checks. It
does not change product behavior. Where the contract deliberately leaves
behavior to Product Architecture, the affected test is blocked rather than
silently choosing an answer.

The matrix uses WCAG 2.2 as a testing reference for interface controls. This is
not a claim that TapTalk conforms to WCAG. The primary webcam-contact input has
no contract-approved keyboard alternative, so a general WCAG conformance claim
would be premature.

References:

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2 keyboard guidance](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)
- [WCAG 2.2 non-text contrast guidance](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html)
- [WCAG 2.2 motion guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

## Current readiness diagnosis

At this baseline, the repository contains product and specialist documentation
only. There is no executable camera, tracking, interface, validation, storage,
or audio subsystem and no integrated prototype. Consequently:

- every runtime case below is `BLOCKED-NO-IMPLEMENTATION`;
- no narrow-proof or full-prototype behavior has been observed;
- contract and fixture review can be completed now, but it is not evidence of
  product behavior;
- no reliability, accessibility, latency, or privacy claim is currently
  supportable.

This is an expected starting state, not a runtime failure. A gate remains
blocked until the required implementation and evidence exist.

## Risk, result, and evidence rules

### Priority

| Priority | Meaning | Examples |
|---|---|---|
| P0 | A failure violates privacy, creates phantom/repeated speech, or misrepresents the prototype. It blocks every QA gate. | Frame upload, stored frames, activation on hand reacquisition, false accessibility/privacy claim |
| P1 | A failure breaks the core interaction, language/voice correctness, permission safety, or access to configuration. It blocks the applicable gate. | Missed rearm, wrong expression or voice, audio over 500 ms, keyboard trap |
| P2 | A failure materially degrades resilience or usability. It blocks a full-prototype recommendation unless explicitly accepted and disclosed by Integration and Product Architecture. | Poor recovery messaging, unsupported environmental condition |

### Result vocabulary

| Result | Rule |
|---|---|
| `PASS` | The test ran in the recorded environment, all hard criteria were met, and the required evidence is attached. |
| `FAIL` | At least one hard criterion was violated. One passing retry does not erase the failure; retain both results and diagnose the cause. |
| `BLOCKED-NO-IMPLEMENTATION` | The required subsystem or instrumentation does not yet exist. |
| `BLOCKED-DECISION` | Product Architecture has not fixed behavior needed to calculate the expected result. |
| `INCONCLUSIVE` | The test ran but evidence, calibration, sample size, or ground truth was insufficient. This is not a pass. |
| `NOT-APPLICABLE` | The case is outside the named gate. It must not be used for an untested supported condition. |

No test passes by code inspection alone when its criterion describes runtime
behavior. Automated assertions, event traces, screen/audio capture, network
capture, and manual observation should be combined according to the risk.

### QA sampling rules

These sample sizes define evidence strength; they do not alter the interaction
semantics.

- A contact cycle is: separated, deliberate same-hand thumb-to-fingertip
  contact, held for two seconds unless the case says otherwise, then confirmed
  separation.
- Narrow tracking evidence uses 30 consecutive cycles on one declared
  non-thumb finger, plus ten 10-second hold trials.
- Full normal-condition evidence uses 20 consecutive cycles for each of the
  eight stable finger IDs, plus five 10-second hold trials per finger.
- Hand-loss, rapid-contact, and audio-preemption cases use 20 trials each.
- Environmental and mobility characterizations use at least ten deliberate
  contacts in each named condition. The result and activation rate are reported
  per condition, never only as an aggregate.
- Correctness invariants use zero-tolerance sampling: no duplicate, phantom,
  wrong-finger, wrong-expression, wrong-language, ordering, privacy, or
  permission-indicator violation is acceptable in the recorded trials.
- A missed intended contact is recorded even if a later retry succeeds.
  Product Architecture and Integration must declare the supported operating
  envelope before environmental results can be promoted from characterization
  to a release gate.

Participant sessions involving differences in skin appearance, hand size,
tremor, or mobility must be opt-in. Do not retain webcam recordings or infer a
medical diagnosis. Record only the condition needed to interpret the test and
use aggregate results in shared reports.

### Required evidence packet

Every test run records:

1. build/commit, date, tester, operating system, browser/runtime, camera model,
   requested and observed resolution/frame rate;
2. test IDs, assignment map, language, and fixed voice routes;
3. ambient-light reading or repeatable lighting description, background,
   camera position, mirroring state, and declared support status;
4. monotonic event trace for visibility, contact confirmation, activation,
   separation/rearm, dispatch, first visual paint, playback request, and audible
   onset where applicable;
5. trial counts, raw outcomes, p50, p95, maximum, and failed-trial details rather
   than only a best case;
6. redacted screenshots or screen/audio captures when needed, with no retained
   webcam frames unless a separate, explicit, time-limited research consent
   process is approved;
7. runtime network capture and before/after local-storage inventory for privacy
   cases;
8. result, defect link, limitation wording, and retest result without deleting
   the original evidence.

## Narrow proof gate

The seven `NP` cases directly mirror the contract's narrow acceptance path.
The three `NG` cases are P0/P1 QA guardrails: they do not rewrite the seven
functional points, but QA will not recommend demonstrating or distributing a
proof that violates them.

| ID | Pri. | Contract behavior and method | Hard pass criteria |
|---|---:|---|---|
| NP-01 | P1 | Start with one hand in view through one recorded standard webcam configuration. Observe visibility and tracking state for 30 seconds before contact trials. | The hand becomes visibly tracked; its semantic handedness is correct for the preview mode; no activation occurs before an intended contact. |
| NP-02 | P1 | Exercise at least one non-thumb fingertip against its same-hand thumb for 30 contact cycles. | All 30 intended contacts select the configured finger; no thumb is exposed as an expression input; no wrong-finger or cross-hand activation occurs. |
| NP-03 | P0 | Correlate manually observed contacts, `contact-confirmed` events, activation events, visual selection, and playback requests. | Each of the 30 cycles creates exactly one activation, one correct visual selection, and one playback request. There are no ungrounded activations. |
| NP-04 | P0 | Hold the chosen contact for ten seconds in each of ten trials while retaining raw detector/state traces. | Each trial activates once at confirmation and zero additional times while held, including during ordinary landmark jitter. |
| NP-05 | P1 | After a confirmed activation, separate and contact again for ten paired trials. Include a near-separation movement that does not reach the implementation's confirmed-separation state. | No activation occurs before confirmed separation. Every confirmed separation rearms the finger, and the following confirmed contact activates exactly once. |
| NP-06 | P1 | Capture `contact-confirmed` and actual first-painted selection acknowledgement on a common monotonic timeline. | The assigned expression is correct and becomes visible on the first UI render after activation. Report contact-to-visual p50, p95, maximum, and sample count. A state update that is not painted is not acknowledgement. |
| NP-07 | P1 | Measure from recognition state-machine confirmation to actual audible waveform onset for 30 normal-condition trials. Do not substitute speech-request time for audio onset. | A compatible robotic voice speaks the correct expression; all recorded normal-condition trials begin audibly within 500 ms. Report p50, p95, maximum, and failures. |
| NG-01 | P0 | Review the explanation shown before the operating-system camera prompt, denial behavior, and camera-active state. | The explanation states why the camera is needed before prompting; denial does not start capture; a persistent visible indicator is present whenever capture is active. |
| NG-02 | P0 | Run the proof from a production build under network capture and inventory files/storage before, during, and after use. | No webcam frame, derived image, configured expression, or routing field is uploaded. No webcam frame is retained by default. Any unrelated runtime network traffic is documented and contains none of this data. |
| NG-03 | P0 | Review every user-facing scope, privacy, reliability, and accessibility claim in the proof. | The proof identifies itself as experimental; does not claim sign-language/arbitrary-gesture/intent recognition; states the tested environment and known limitations; and makes no unsupported accessibility, privacy, or reliability claim. |

### Narrow proof decision

The narrow functional proof is `PASS` only when NP-01 through NP-07 all pass in
one identified build. QA approval of that proof additionally requires NG-01
through NG-03 to pass. A `FAIL`, `BLOCKED`, or `INCONCLUSIVE` P0/P1 case blocks
the corresponding decision. Results from different builds cannot be combined
without a documented equivalence analysis.

Current narrow-proof result: `BLOCKED-NO-IMPLEMENTATION`.

## Full prototype matrix

The full gate inherits every narrow-proof case and expands it as follows.

### Tracking, rearming, and recovery

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| TR-01 | P1 | Configure unique expressions for all shared IDs: `left_index`, `left_middle`, `left_ring`, `left_pinky`, `right_index`, `right_middle`, `right_ring`, `right_pinky`. Run with preview mirroring on and off. | Exactly those eight non-thumb inputs are exposed. Every contact selects the semantic ID and assignment expected from the physical hand; mirroring never swaps semantic IDs. |
| TR-02 | P0 | Run 20 normal-condition contact cycles per finger, one finger active at a time. Correlate annotated physical contact with the state trace. | Every confirmed contact produces exactly one activation for the correct finger and expression. No duplicate, phantom, wrong-finger, or cross-hand activation occurs. Report intended-contact recognition rate per finger. |
| TR-03 | P0 | Hold each finger in contact for five 10-second trials while varying the hand slightly within ordinary tracking jitter. | One and only one activation occurs per hold, regardless of landmark jitter. |
| TR-04 | P1 | For every finger, alternate confirmed contact, sub-threshold near-separation, confirmed separation, and renewed contact. | Near-separation never rearms; confirmed separation rearms once; the next confirmed contact activates once. |
| TR-05 | P0 | Begin separated, remove the hand until it is not visible, then reacquire it in separated and touching poses; repeat 20 times and with the other hand retained where possible. | Hand loss or reacquisition never synthesizes an activation. The recovery state and eligibility transition match the architecture-approved policy. Until that policy is documented, only the no-phantom assertion can pass and complete recovery remains `BLOCKED-DECISION`. |
| TR-06 | P1 | Test partial fingertip/thumb occlusion, one hand occluding the other, and crossed hands. | No confident contact is invented from missing/ambiguous landmarks; no semantic hand-ID swap causes an activation. Tracking uncertainty is visible and recoverable. Recognition rates are reported by condition. |
| TR-07 | P1 | Interrupt the camera stream and revoke permission during separated, approaching, held, and just-rearmed states. | Capture stops promptly; no event is synthesized during interruption or recovery; the user receives an actionable state. Exact post-interruption eligibility behavior remains `BLOCKED-DECISION` until Architecture defines it. |

### Lighting, camera, body, and movement variation

These are characterization cases until Integration and Product Architecture
declare a supported envelope. Each individual condition still receives
`PASS`/`FAIL` using the stated correctness criteria; an unsupported failed
condition must become a visible limitation, not disappear from the report.

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| EV-01 | P1 | At minimum characterize even front lighting, dim lighting, bright lighting, side lighting, and strong backlighting. Record lux when practical and avoid auto-exposure changes between repeated trials. | In each condition, zero duplicate, phantom, wrong-finger, or wrong-expression events occur. Intended-contact recognition rate and tracking-loss rate are reported separately per condition. A condition is a gate pass only if it is inside the declared supported envelope and all sampled intended contacts succeed. |
| EV-02 | P1 | Repeat against plain light, plain dark, low hand/background contrast, and visually cluttered backgrounds. | The same correctness requirements as EV-01 hold and results are reported per background. Skin appearance must not be described as the cause without evidence that separates it from lighting/exposure/background. |
| EV-03 | P1 | Exercise at least a built-in webcam and an external consumer webcam where available; record resolution, observed frame rate, autofocus/exposure behavior, and dropped frames. Include a degraded-quality characterization. | Every declared supported camera configuration meets exact-once correctness and the 500 ms audio target. Degraded/unsupported outcomes are measured and disclosed. “Standard webcam” remains an unresolved support definition until Architecture accepts an envelope. |
| EV-04 | P1 | Conduct opt-in live sessions spanning varied skin appearances and small/medium/large hand sizes; factors may overlap across participants. Do not store camera imagery. | No participant/condition has a duplicate, phantom, or systematic wrong-ID pattern. Report contact success and tracking loss by test condition without publishing identifying data. Any observed disparity is investigated and disclosed; it cannot be hidden by an aggregate average. |
| EV-05 | P1 | Conduct opt-in live sessions with natural or simulated tremor at more than one amplitude/frequency, including holds and separation/rearm. | Tremor does not create duplicate or phantom activation. Intended-contact rate, unintended contact candidates, and rearm outcomes are reported. Supported tremor conditions meet all exact-once criteria; unsupported ranges are stated plainly. |
| EV-06 | P1 | Conduct opt-in sessions with variation in range of motion, finger extension, hand orientation, contact angle, and pace. Do not instruct a participant to exceed a comfortable movement. | For every declared supported movement pattern, deliberate contacts can be completed without a forced precise timing requirement and meet exact-once/rearm criteria. Unusable postures or ranges are recorded as product limitations, not user error. |

### Rapid and simultaneous contacts

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| CC-01 | P1 | Run 20 rapid sequences across different fingers and 20 rapid separated-contact cycles on the same finger, varying intervals down to the documented supported limit. Include three taps on one finger assigned `slay`. | Every confirmed activation is dispatched once in confirmation-timestamp order. The same finger does not reactivate without confirmed separation, and there is no additional UI/audio cooldown after rearm. Each accepted tap interrupts the previous phrase, so the three-tap case can produce `s`, `s`, `slay`. |
| CC-02 | P0 | Produce two contacts with distinguishable confirmation timestamps in both left-first and right-first orders. Compare confirmation, dispatch, visual, playback-request, and interruption traces. | First confirmed is first submitted. The second activation immediately interrupts it and starts, regardless of finger. Neither request waits or enters a delayed queue. |
| CC-03 | P1 | Reproduce contacts assigned the same timestamp/video frame and repeat with the same trace. | Dispatch order is deterministic and matches the documented stable finger-ID tie-break. This test is `BLOCKED-DECISION` until Architecture records the exact order; repeatability alone is insufficient. |
| CC-04 | P1 | Run three or more near-simultaneous contacts, including one held contact and a rearmed contact. | The ordered activation list is a stable sort of confirmation time plus the approved tie-break, with no dropped or duplicate confirmed event. Each finger retains independent held/rearmed state. |

### Expression validation

The reusable cases in
[`qa/fixtures/expression-validation.json`](../../qa/fixtures/expression-validation.json)
are the minimum boundary set. UI tests must also verify the message and
non-destructive editing behavior.

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| VA-01 | P1 | Execute English cases at empty, one-word, five-word, and six-word boundaries, extra whitespace, Han-only, and mixed lexical content. | After trimming and whitespace tokenization, one to five non-Han English tokens are accepted. Empty, over-five, Han, and mixed lexical content are rejected. The existing valid assignment is not silently destroyed on rejection. |
| VA-02 | P1 | Execute Mandarin cases at empty, one-Han, five-Han, and six-Han boundaries, Latin-only, and mixed lexical content. | One to five Han characters are accepted, with each Han character counted as one unit. Empty, over-five, Latin-word, and mixed lexical content are rejected without destroying the existing valid assignment. |
| VA-03 | P1 | Enter mixed English/Mandarin lexical content and inspect the error visually and through accessibility APIs. | The expression is rejected and the message explains that languages may be mixed across fingers, but not within one finger assignment. The error identifies the affected field without relying only on color. |
| VA-04 | P1 | Execute digit, punctuation, emoji, and ambiguous-script cases from the fixture. | The current provisional implementation rejects them with a clear message. The final expected result is `BLOCKED-DECISION` until Architecture settles the policy; QA updates the fixture after an accepted contract/decision change. |
| VA-05 | P1 | Assign valid English and Mandarin expressions to different fingers in the same saved configuration, reload, activate, edit, cancel, and reset. | Cross-finger language mixing remains valid; each finger retains exactly one one-language expression; persistence never changes the string, language, or finger association. |

### Voice identity, routing, and preemption

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| VO-01 | P1 | Use unique English and Mandarin assignments across fingers, including a stored legacy configuration with opposite preference values. Inspect routing and audible output. | English always uses Piper `en_US-hfc_female-medium` and Mandarin always uses Matcha `matcha-icefall-zh-baker`. A one-character Mandarin assignment uses the approved context crop with 150 ms padding per side. Legacy preferences do not alter routing. |
| VO-02 | P1 | Inspect the complete interface and runtime route. | No voice-choice controls or operating-system/system-voice catalogue are exposed. |
| VO-03 | P1 | Trigger a second long expression after the first becomes audible but well before it completes. Run same-finger and different-finger English/English, Mandarin/Mandarin, and cross-language pairs for 20 total trials. Isolate request streams or waveforms where possible. | The current phrase is cut off and replaced by the newest request in every case, with no backlog. Only the final request completes when taps continue. |
| VO-04 | P1 | Review asset/model provenance and perform an intelligibility/identity listening check without prompting listeners with protected character names. | Each output is intelligible in its assigned language and distinguishable as the selected synthetic, mechanical TapTalk identity. Provenance contains no cloning or imitation instruction for a protected character. QA does not make a legal non-infringement determination. |
| VO-05 | P1 | Alternate same-finger and different-finger activations while natural-speed speech is still playing. Record the output waveform and run at least 20 pairs per language. | Every newer output begins without waiting for the old phrase to finish. Interrupted speech is neither resumed nor queued, and the newest output remains intelligible. |

### Visual and audio latency

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| LT-01 | P1 | Instrument contact confirmation and actual first painted acknowledgement on a common monotonic clock. Run normal and rapid-preemption cases per finger. | Correct expression/feedback appears on the first render after activation. Report p50, p95, maximum, and missing-paint count by condition; a state update that never paints fails. |
| LT-02 | P1 | Capture contact confirmation and real audible onset using calibrated loopback or microphone/audio analysis. Include warm and first-use runs, both languages, every identity, and rapid preemption. | Under each declared normal supported condition, all measured trials begin within 500 ms. Report p50, p95, maximum, sample count, measurement uncertainty, and failures. Playback-request time is not a substitute. |
| LT-03 | P2 | Compare visual and audible onset traces. | Visual acknowledgement precedes audible onset whenever the render path can produce a frame first. Any audio-first result is reported with evidence of whether earlier visual acknowledgement was technically possible; repeated unexplained audio-first output fails the “visual earlier whenever possible” expectation. |

### Privacy, persistence, and camera permission

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| PR-01 | P0 | Review production code/dependencies and run first use, tracking, configuration, speech, hand loss, and reset under network capture. Test with the network unavailable. | No frame, derived image, landmark payload, configured expression, or preference leaves the device. Frame analysis continues locally. If speech cannot operate without sending configured text, the local-configuration requirement fails. Unrelated traffic is enumerated and shown not to contain protected data. |
| PR-02 | P0 | Inventory browser/app storage, caches, temporary files, logs, crash reports, and media artifacts before/during/after a session. | No webcam frame or recoverable frame sequence is stored or retained by default. Logs contain no image data and no unnecessary expression content. Only documented on-device configuration is persistent. |
| PR-03 | P1 | Save all eight assignments, reload/restart, then invoke reset and inspect storage directly. | Assignments persist only on device and remain correctly associated. Reset clearly warns what it removes, clears the stored configuration, and a subsequent start does not restore it. |
| PR-04 | P0 | Start from a fresh permission state. Exercise allow, deny, dismiss, retry, revoke while active, device unavailable, and device removed. | A plain-language explanation precedes the OS prompt. Denial/dismissal does not capture and leads to actionable recovery. Revocation/device loss ends active capture and shows an accurate state without phantom activation. |
| PR-05 | P0 | Observe all screens, tabs/windows, and responsive sizes while capture is active, paused, stopped, denied, or interrupted. | A persistent, non-color-only camera-active indication is visible whenever capture is active and never falsely indicates capture after it stops. The interface never claims the OS indicator replaces TapTalk's own indication. |

### Keyboard, contrast, motion, and understandable states

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| AX-01 | P1 | Use only keyboard to reach and operate setup, camera start/retry, all eight expression editors, language controls, save/cancel, reset, help, and any modal. Repeat at 200% text zoom where applicable. | Controls have a logical focus order, visible un-obscured focus, correct accessible name/role/state, standard activation keys, and no keyboard trap or timing-dependent keystroke. Pointer-only editing or permission recovery fails. |
| AX-02 | P1 | Evaluate whether the primary “select expression and speak it” function has an architecture-approved non-camera input path. | The existing configuration UI is keyboard-accessible. Because the contract defines exactly eight physical finger inputs and no alternative activation path, full keyboard equivalence is `BLOCKED-DECISION`; TapTalk must not claim full keyboard or WCAG conformance unless Architecture approves a behavior-preserving solution. The limitation must be disclosed in the prototype. |
| AX-03 | P1 | Measure computed foreground/background pairs for text, input errors, labels, fingertip overlays, tracking/contact states, camera indicator, and focus. Test over representative light/dark camera imagery. | Normal text is at least 4.5:1; large text is at least 3:1; required UI boundaries, focus, and meaningful graphics are at least 3:1 against adjacent colors. Correct selection, error, tracking, and camera state do not rely on color alone. |
| AX-04 | P1 | Enable the operating system/browser reduced-motion preference and exercise setup, tracking, contact feedback, errors, and navigation. Inspect automatic and contact-triggered effects. | Non-essential position/scale motion is removed or disabled under reduced motion. Essential state remains available without animation. Nothing flashes more than three times in any one-second period, and no critical status is conveyed only by motion. |
| AX-05 | P1 | Review setup, validation, permission, tracking uncertainty/loss, camera interruption, save/reset, and playback errors with keyboard and accessibility APIs. | Messages state what happened and an actionable next step; status changes are programmatically exposed without unexpectedly moving focus; language is concise and does not blame tremor, mobility, skin appearance, or user technique. |

### Honest scope and limitations

| ID | Pri. | Coverage and method | Hard pass criteria |
|---|---:|---|---|
| CL-01 | P0 | Search user-facing copy, demo script, README/release notes, and metadata for capability claims. Compare them with executed evidence. | TapTalk is described only as learned thumb-to-fingertip input for eight expressions. It never claims sign-language recognition, arbitrary gesture interpretation, translation, intent prediction, unrestricted text entry, or a general voice catalogue. |
| CL-02 | P0 | Review the prototype's setup/help/about and release handoff against the latest failed, blocked, and characterization cases. | Experimental status, tested browsers/cameras/conditions, hand-loss behavior, environmental and mobility limits, language edge cases, latency distribution, local-data behavior, and input/accessibility limits are disclosed accurately. No `BLOCKED`, `INCONCLUSIVE`, or untested condition is described as working. |
| CL-03 | P1 | Compare implementation configuration and UI with fixed product boundaries. | There are exactly eight non-thumb inputs, one expression per finger, one to five units per expression, only English/Mandarin, and exactly two fixed local voices. No hidden or “advanced” path broadens those boundaries. |

## Full prototype decision

The full prototype receives a QA `PASS` recommendation only when:

1. NP-01 through NP-07 and NG-01 through NG-03 pass on the candidate build;
2. every P0 and P1 full-prototype case has a recorded `PASS`, with no unresolved
   `FAIL`, `BLOCKED`, or `INCONCLUSIVE` result;
3. Product Architecture has resolved the decision-blocked expected results
   listed below;
4. environmental, camera, skin appearance, hand size, tremor, and mobility
   characterizations are complete, the supported envelope is declared, and
   every condition inside it passes;
5. every P2 failure is either corrected or explicitly accepted by Integration
   and Product Architecture with accurate user-facing limitation wording;
6. the complete evidence packet is tied to one candidate build and retained
   without webcam imagery or identifying participant data.

Current full-prototype result: `BLOCKED-NO-IMPLEMENTATION` and
`BLOCKED-DECISION`.

## Architecture decisions required before final acceptance

These are requests for clarification, not proposed behavior:

| Decision | Tests blocked | Needed answer |
|---|---|---|
| Confirmation, separation, and tracking-confidence timing targets | TR-04, CC-01, environmental comparison | Exact timing/confidence rules and any supported minimum inter-contact interval |
| Hand-loss and camera-interruption recovery | TR-05, TR-07, PR-04 | Eligibility/state transition after loss, reacquisition, revocation, and device restart |
| Same-frame deterministic tie-break | CC-03, CC-04 | Complete ordered list of the eight stable finger IDs |
| Punctuation, digit, emoji, and ambiguous-script policy | VA-04 | Accept/reject and unit-count behavior plus required error semantics |
| Supported operating envelope | EV-01 through EV-06, LT-02 | Minimum supported cameras, frame rate/resolution, lighting/background range, and how mobility/tremor limitations are stated |
| Keyboard equivalence of primary activation | AX-02 | Whether an alternative activation path is allowed without violating the exactly-eight-finger interaction boundary |

Until these answers are accepted in the contract or decision log, QA must not
invent expected values in test code or mark the affected full-prototype cases
as passing.
