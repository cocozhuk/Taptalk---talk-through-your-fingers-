# TapTalk Decision Log

Last updated: 2026-07-25

This log distinguishes decisions supplied and accepted in the product baseline
from resolutions made by Product Architecture under its delegated role.
Architecture resolutions are normative for the first prototype, but are not
represented as direct user decisions. Provisional recommendations are
explicitly non-normative until promoted in this log.

## Accepted product decisions

These rules came from the project-owner baseline and may not be changed by a
specialist.

| ID | Decision | Accepted rule |
|---|---|---|
| U-001 | Interaction scope | Exactly eight same-hand thumb-to-non-thumb-fingertip inputs; no sign-language, arbitrary-gesture, intent, or unrestricted text interpretation. |
| U-002 | Assignment cardinality | Exactly one expression of one to five units per finger. |
| U-003 | Languages | English and Mandarin only; one language inside an expression, with languages allowed to differ across fingers. |
| U-004 | Mandarin unit | One Han-script character counts as one word/unit. |
| U-005 | Voices | Exactly four fixed TapTalk identities: English masculine/feminine and Mandarin masculine/feminine; no system catalogue or protected-character imitation. |
| U-006 | Contact/rearm | One sustained contact activates once; confirmed separation is required before the same finger can activate again. |
| U-007 | Concurrency | First confirmed wins. While it is speaking, later activations are discarded with visual feedback and are never queued. |
| U-008 | Latency | Audible onset targets no more than 500 ms after confirmed contact, with median and slow-percentile reporting. |
| U-009 | Privacy/storage | Configuration stays on device; webcam processing is local and frames are not stored, uploaded, or retained by default. |
| U-010 | Semantic handedness | Stable user-hand finger IDs do not change when the camera preview is mirrored. |

## Product Architecture resolutions

These items resolve the baseline's open questions and are accepted as
prototype contract decisions under Product Architecture ownership. Full
normative detail is in [`ARCHITECTURE_SPEC.md`](ARCHITECTURE_SPEC.md).

| ID | Resolution | Status and rationale |
|---|---|---|
| A-001 | Language is explicitly saved as `en` or `zh`; script validation never auto-routes or silently changes it. | Accepted for prototype. Deterministic routing is safer than ambiguous language detection and supports mixed-language finger configurations. |
| A-002 | English accepts 1–5 Latin-script tokens with limited apostrophe, hyphen, and terminal punctuation. Mandarin accepts 1–5 Han code points with limited internal/terminal punctuation. Digits, emoji, controls, unsupported scripts/symbols, and mixed Latin/Han lexical content are rejected. | Accepted for prototype. The grammar is useful for short utterances while remaining deterministic and testable. |
| A-003 | Validation normalizes to NFC, trims, collapses English whitespace, rejects Mandarin internal whitespace, and returns stable prioritized error codes. | Accepted for prototype. Saved configuration has one canonical form and UI/tests share error semantics. |
| A-004 | Contact confirmation requires 60 ms and at least 2 usable samples; separation requires 120 ms and at least 3 usable samples; a tracking gap over 100 ms causes loss and disarming. | Accepted prototype defaults. They balance responsiveness and duplicate suppression; empirical revision requires a logged contract change. |
| A-005 | Initial visibility and reacquisition enter `rearm_required`; only confirmed separation arms a finger. Contact and release use spatial hysteresis, while calibrated distances remain Hand Tracking's responsibility. | Accepted for prototype. It prevents a held pose, hand loss, or camera recovery from creating synthetic activation. |
| A-006 | Dispatch sorts by confirmation timestamp, then frame sequence, then same-frame finger order: left index, middle, ring, pinky; right index, middle, ring, pinky. | Accepted for prototype. This preserves first-confirmed order and gives truly simultaneous input a total order independent of implementation iteration. |
| A-007 | Voice selection is one masculine/feminine preference per language, producing exactly four IDs; no per-finger voice preference exists. An activation snapshots assignment and voice at acceptance. | Accepted as the final prototype selection model. It permits mixed-language assignments without exposing a catalogue or ambiguous mid-flight changes. |
| A-008 | Warm-path acceptance is p95 ≤100 ms to visual presentation, p95 ≤50 ms to speech submission, and p95 ≤500 ms to output-graph audible onset, all from the confirming frame's capture time. | Accepted for prototype. Exact measurement points prevent API-call time from being mislabeled as audible onset. |
| A-009 | Tracking/camera recovery starts a new session when appropriate, disarms affected fingers, rejects stale/duplicate events, and preserves configuration. Speech failure is visible, is not auto-retried, and does not undo visual activation. | Accepted for prototype. Recovery cannot create speech without a new deliberate contact. |
| A-010 | Invalid saved configuration is never spoken. A complete valid factory configuration is used in memory without overwriting bad stored data until explicit reset or replacement. | Accepted for prototype. This keeps the product usable while making destructive recovery user-controlled. |
| A-011 | Tracking events are session/frame correlated and idempotent; App State dispatches one visual effect and one independent speech request from one assignment snapshot per accepted activation. | Accepted for prototype. This is the shared boundary needed for deterministic integration and latency correlation. |

## Provisional recommendations

These are not product requirements and must not be treated as accepted user
decisions:

| ID | Recommendation | Promotion condition |
|---|---|---|
| P-001 | Hand Tracking may tune normalized spatial contact/release thresholds per environment while preserving hysteresis and all normative timing/event rules. | Hand Tracking documents calibration and QA demonstrates the state-machine acceptance cases. |
| P-002 | Voice implementations should warm required resources before live mode rather than weaken the 500 ms warmed-path target. | Robotic Voices and Integration select a supported pipeline and publish cold/warm measurements. |
| P-003 | Factory expression copy should be short, common, and cover both languages in the demonstration configuration. | Product/Integration records the exact eight valid defaults without changing assignment or language limits. |

## Superseded provisional interpretations

The original provisional interpretations for mixed-script validation,
per-language voice preference, ambiguous characters, and same-frame tie-breaks
are superseded by A-001 through A-007.
