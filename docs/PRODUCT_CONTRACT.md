# TapTalk Product Contract

Status: baseline for the first prototype

This document is the shared source of truth for every TapTalk specialist. A
specialist may propose a change, but only the Product Architecture task owns
changes to this contract. The Integration task records accepted changes in the
main project.

## Product purpose

TapTalk converts deliberate thumb-to-fingertip contacts into visible and spoken
expressions. It is a learned, configurable physical input system. It does not
interpret sign language, translate arbitrary gestures, or infer user intent.

## Fixed interaction model

1. A standard webcam observes both hands.
2. Each of the eight non-thumb fingers owns one editable expression.
3. Touching a fingertip to the thumb on the same hand selects that expression.
4. The interface immediately shows which expression was selected.
5. A compatible robotic voice speaks the expression.
6. The fingertip must separate from the thumb before that finger can activate
   again.

## Non-negotiable product boundaries

- Exactly eight finger inputs: four non-thumb fingers on each hand.
- Thumbs are activation controls and never expression inputs.
- Exactly one expression per finger.
- Each expression contains between one and five units.
- Spoken languages are English and Mandarin Chinese only.
- Each individual expression uses exactly one language. The eight finger
  assignments may contain a mixture of English and Mandarin expressions.
- Exactly four voice identities:
  - English masculine
  - English feminine
  - Mandarin Chinese masculine
  - Mandarin Chinese feminine
- Voices must sound deliberately synthetic, mechanical, charming, and
  emotionally expressive.
- Voice design may draw on broad warm/rough versus clean/bright robot
  archetypes, but must not copy, clone, or imitate a protected character voice.
- There is no conventional system-voice catalogue in the interface.
- There is no sign-language recognition.
- There is no arbitrary gesture recognition or intent prediction.
- Configuration is stored only on the user's device.

## Expression validation

### English

- One to five words.
- A word is a non-empty token separated by whitespace after trimming.
- An English expression must not contain Han-script characters.

### Mandarin Chinese

- One to five Chinese characters.
- Each Han-script character counts as one word/unit.
- A Mandarin expression must not contain Latin-script words.

### Mixed-script input

An individual expression containing both English and Mandarin lexical content
is invalid for the first prototype. The interface must explain that languages
can be mixed across fingers, but not inside one finger assignment.

Punctuation, digits, emoji, and language-detection edge cases remain an
architecture decision. Until the architect refines the rule, the safest
prototype behavior is to reject ambiguous input with a clear validation
message.

## Contact and rearming behavior

Each finger has a conceptual state machine:

```text
not visible
  -> separated
  -> approaching
  -> contact candidate
  -> contact confirmed and activated
  -> held
  -> separated and rearmed
```

- One sustained touch produces only one activation.
- A finger becomes eligible again only after confirmed separation.
- Detection must tolerate ordinary landmark jitter without producing repeated
  activations.
- Losing and reacquiring a hand must not create a synthetic contact event.

## Concurrent activations

- Confirmed activations are dispatched in timestamp order: first confirmed,
  first served.
- Speech is not globally serialized. Audio from multiple activations may
  overlap.
- Dispatch order still controls which activation is submitted first.
- If two contacts receive the same timestamp or video frame, the prototype
  must use a documented, deterministic finger-ID tie-break rather than random
  ordering.

## Voice routing

- The language of the assigned expression determines whether an English or
  Mandarin voice is used.
- The prototype should maintain one masculine/feminine preference for English
  and one masculine/feminine preference for Mandarin. This exposes the four
  product identities while allowing English and Mandarin assignments to coexist
  across fingers.
- Voice playback requests may overlap.
- Internal implementation may use a speech engine plus robotic audio
  processing, but the user-facing interface must expose only the four TapTalk
  identities.

The per-language preference model is provisional and must be confirmed or
refined by the Product Architecture task before the voice interface is frozen.

## Latency target

- Audible speech should begin within 500 milliseconds of confirmed contact.
- Measurement begins when contact is confirmed by the recognition state
  machine and ends at audible playback onset.
- The interface should provide visual acknowledgement earlier whenever
  possible.
- Tests must report median and slow-percentile latency rather than only a best
  case.

## Privacy and storage

- Finger assignments and voice preferences remain on the user's device.
- Webcam frames should be processed locally for the first prototype.
- Webcam frames must not be stored, uploaded, or retained by default.
- The user must receive a clear camera-permission explanation and a visible
  indication when the camera is active.
- Resetting TapTalk must provide a clear way to remove stored configuration.

## First-prototype acceptance path

The first narrow proof of concept is complete when:

1. One hand is visible through a standard webcam.
2. At least one non-thumb fingertip can contact its same-hand thumb.
3. One contact creates one activation.
4. Holding the contact does not retrigger it.
5. Separation rearms the finger.
6. The assigned expression is highlighted immediately.
7. A compatible robotic voice begins within the latency target under normal
   conditions.

The first full prototype then expands the same path to:

- two hands and all eight non-thumb fingers;
- eight locally editable and persistent assignments;
- English and Mandarin assignments across different fingers;
- four fixed robotic voice identities;
- overlapping playback;
- deterministic first-confirmed-first-served dispatch;
- fingertip-adjacent labels and contact feedback;
- camera, tracking, validation, and recovery states;
- privacy, accessibility, and performance checks.

## Shared finger identifiers

All subsystems should use stable identifiers:

- `left_index`
- `left_middle`
- `left_ring`
- `left_pinky`
- `right_index`
- `right_middle`
- `right_ring`
- `right_pinky`

Mirroring the camera preview must never change these semantic identifiers.

## Decisions still owned by Product Architecture

- The exact handling of punctuation, digits, emoji, and ambiguous script.
- The deterministic tie-break order for truly simultaneous contacts.
- Whether per-language voice preference is the final selection model.
- Confirmation, separation, and tracking-confidence timing targets.
- Recovery behavior after hand loss or camera interruption.

