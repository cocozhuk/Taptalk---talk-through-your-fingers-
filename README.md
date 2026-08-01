<div align="center">
  <img src="assets/readme/taptalk-banner.svg" alt="TapTalk — talk through your fingers" width="100%" />

  <br />

  [![First prototype](https://img.shields.io/badge/status-first_prototype-ff91c8?style=flat-square&labelColor=17264a)](#prototype-status)
  [![Local first](https://img.shields.io/badge/privacy-local_first-a8dc34?style=flat-square&labelColor=17264a)](#privacy)
  [![English + 中文](https://img.shields.io/badge/languages-English_%2B_中文-80d8f7?style=flat-square&labelColor=17264a)](#the-product-rules)
  [![130 tests](https://img.shields.io/badge/tests-130_passing-a514ff?style=flat-square&labelColor=17264a)](#testing)

  **A camera-based communication interface that lets you talk through deliberate fingertip taps.**

  *Your hands become eight tiny, editable speech buttons.* ✦

  [Open the live TapTalk prototype](https://taptalk-talk-through-your-fingers.vercel.app)
</div>

---

## What is TapTalk?

TapTalk is an experimental communication interface for people who want—or
need—to produce speech without using their natural voice, a keyboard, or a
touchscreen.

A webcam watches both hands locally. Each of the eight non-thumb fingers holds
one short expression. Touch a fingertip to the thumb on the same hand and
TapTalk displays that expression and speaks it aloud. Separate the finger to
rearm it, then tap again whenever you are ready.

```text
webcam sees both hands
        ↓
fingertip touches its thumb
        ↓
assigned expression is selected
        ↓
the words appear + the voice speaks
```

TapTalk is a deliberately learned input system. It does **not** interpret sign
language, translate arbitrary gestures, or guess what the user means. The user
chooses the vocabulary; TapTalk makes each intentional contact visible and
audible.

## Run locally

### Requirements

- macOS with Google Chrome for the desktop experience, or an iPhone with
  Safari for the automatic iPhone web experience;
- Node.js 20 or newer;
- Python 3.9 or newer for the local Matcha Mandarin worker;
- an internet connection during initial dependency setup and the first English
  Piper download;
- a standard webcam.

### Start TapTalk

```sh
git clone git@github.com:cocozhuk/Taptalk---talk-through-your-fingers-.git
cd Taptalk---talk-through-your-fingers-
npm install
npm run setup:matcha
npm run dev
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

TapTalk intentionally binds to `127.0.0.1`; the development server is not
exposed to the local network.

For opt-in testing from a physical iPhone on the same trusted Wi-Fi network,
follow [`docs/IPHONE_LOCAL_TESTING.md`](docs/IPHONE_LOCAL_TESTING.md). The
separate HTTPS command requires explicit certificate and key paths; it does not
change the safe `npm run dev` default.

### Useful commands

```sh
npm run dev      # start the local TapTalk server
npm run dev:iphone -- --cert <path> --key <path> # opt-in iPhone HTTPS testing
npm test         # run the automated test suite
npm run build    # assemble the static production files in dist/
npm run check    # run tests, then build
```

## ✦ The first prototype

This repository contains the complete first working prototype:

- real-time local webcam preview;
- on-device MediaPipe tracking for up to two hands;
- eight editable fingertip slots, each independently enabled or disabled;
- labels that follow the detected fingertips;
- thumb-to-fingertip contact detection with separation rearming;
- English and Mandarin language detection from the expression itself;
- fixed local Piper English and Matcha Mandarin voices;
- newest-tap-wins speech with no hidden audio queue;
- local MP4 recording with fingertip labels and TapTalk speech included;
- local configuration storage and reset;
- camera-free mouse/touch and keyboard fallbacks;
- one shared web application with a desktop workspace and an automatic,
  sequential iPhone presentation;
- a single-page, dreamy retro-tech interface.

The red fingertip dots and electric blue, green, and violet labels are designed
to stay legible over live video while keeping TapTalk playful and immediate.
The sidebar groups the controls as **LEFT HAND 1–4** and **RIGHT HAND 1–4**.

## How to use it

On macOS, edit the eight expressions in the sidebar, save them, then select
**Start camera**. On iPhone, complete the same tutorial, configure the eight
expressions, and select **Continue**. TapTalk then asks whether to start the
camera alone or start the camera and record. In portrait, the live iPhone view
shows a centered 16:9 camera frame matching the saved video. If the user rotates
the phone, the camera expands into landscape and fingertip labels reflow with
the new direction.

In either presentation, face one or both palms toward the camera with the wrist
visible. Touch any non-thumb fingertip to the thumb on the same hand, then
separate it before activating that expression again.

When taps happen rapidly, TapTalk does not build a long speech queue. A new tap
interrupts the current phrase and starts the newest one. This keeps the audio
responsive and aligned with the user’s physical input.

## The product rules

These boundaries are intentional parts of TapTalk:

| Rule | TapTalk behavior |
| --- | --- |
| Finger inputs | Exactly eight: four non-thumb fingers per hand |
| Assignment | One editable expression per finger, or blank to disable it |
| Expression length | Active expressions use up to five English words or five Chinese characters |
| Language per finger | One language inside each assignment |
| Mixed setup | English and Chinese assignments can coexist across fingers |
| Spoken languages | English and Mandarin Chinese only |
| Default voices | Piper `hfc_female` for English, Matcha Baker for Mandarin |
| Rearming | A finger must separate from the thumb before activating again |
| Simultaneous contacts | First confirmed contact is served first |
| Target latency | Contact to speech within 500 ms |
| Storage | Configuration remains on the device |
| Interpretation | No sign-language recognition or arbitrary gesture guessing |

## Interaction details

### Fingertip tracking

MediaPipe Hand Landmarker runs in the browser and supplies hand landmarks.
TapTalk maps the index, middle, ring, and pinky fingertips on each hand to eight
configurable slots. A blank slot is disabled: its marker stays hidden and its
contacts are ignored. Contact distances are normalized against palm scale so the
same gesture works at different distances from the camera.

Short confirmation and separation hysteresis reduce accidental triggers from
landmark jitter. Losing a hand clears its contact state, so reacquiring a hand
cannot silently trigger speech.

### Speech

TapTalk uses two fixed local voices:

- **English:** Piper `en_US-hfc_female-medium`
- **Mandarin Chinese:** Matcha `matcha-icefall-zh-baker`

English is synthesized in Chrome. Mandarin is prepared by the project-local
Matcha worker during desktop use and by the same Matcha model in a Vercel
Python function when hosted. One-character Mandarin assignments are
synthesized inside a fixed carrier phrase, isolated between its pauses, and
padded with 150 ms of silence on each side; longer Mandarin assignments use
Matcha directly. All eight finished buffers are prepared before camera use.
Generated audio is played through Web Audio and routed into the recorder at the
same time.
A silent recording clock starts with the video so speech stays synchronized
even when the first fingertip tap happens several seconds later. Speech remains
interruptible: the newest deliberate tap replaces anything currently playing.

### Recording

Recording is composed locally from:

- the mirrored webcam image;
- live fingertip dots and expression labels;
- TapTalk’s generated speech audio;
- compact recording captions.

MP4 is preferred when the browser supports it. WebM remains a compatibility
fallback. If a browser fails to deliver its final recorder event, TapTalk uses a
bounded recovery path instead of leaving the interface stuck on “Saving…”.

## Privacy

TapTalk is local-first:

- camera frames are processed on the device;
- the hand-landmark model is bundled locally;
- saved expressions use browser local storage;
- English speech is generated locally in the browser;
- Mandarin expression text is processed locally by the desktop worker or sent
  to TapTalk's same-origin Matcha function on the hosted prototype;
- recordings are downloaded directly by the browser;
- camera frames, landmarks, saved expressions, and recordings are not uploaded.

Camera access is requested only after the user selects **Start camera**.
Microphone access is not required because TapTalk records its own generated
speech stream.

## Project map

```text
TapTalk
├── api/                       # hosted Matcha Mandarin function
├── assets/
│   ├── fonts/                 # bundled Gabarito typeface + license
│   ├── models/                # local MediaPipe hand model
│   └── readme/                # original project artwork
├── docs/                      # product, architecture, QA, and agent briefs
├── packages/robotic-voices/   # archived four-voice speech experiment
├── scripts/
│   ├── build.mjs              # production assembly
│   ├── patch-piper.mjs        # browser Piper compatibility patch
│   ├── matcha-worker.py       # desktop Mandarin synthesis
│   └── serve.mjs              # local development server
├── src/
│   ├── adapters/              # camera, hand model, speech, and recording
│   ├── app-state/             # validation and local persistence contracts
│   ├── core/                  # activation dispatch and configuration
│   ├── hand-tracking/         # landmark contact state machine
│   ├── ui/                    # interface rendering and feedback
│   └── main.js                # prototype composition root
└── test/                      # automated behavior and regression tests
```

The detailed product boundary is documented in
[`docs/PRODUCT_CONTRACT.md`](docs/PRODUCT_CONTRACT.md). See
[`docs/ARCHITECTURE_SPEC.md`](docs/ARCHITECTURE_SPEC.md) for the implementation
contract and [`docs/qa/ACCEPTANCE_MATRIX.md`](docs/qa/ACCEPTANCE_MATRIX.md) for
acceptance coverage.

## Testing

The current prototype has **130 passing automated tests** covering:

- expression and configuration validation;
- assignment persistence and migration;
- first-confirmed activation ordering;
- duplicate and stale event rejection;
- contact hysteresis and separation rearming;
- landmark mapping and visibility failure states;
- fixed Piper English and Matcha Mandarin routing;
- interruptible rapid-tap speech;
- recording audio inclusion and MP4 preference;
- recorder finalization recovery;
- fingertip overlay and tracking feedback;
- stable iPhone-versus-desktop interface selection;
- iPhone setup, camera-choice, recording, failure, and exit lifecycles.

Run everything before a release:

```sh
npm run check
```

## Prototype status

TapTalk is a first prototype, not a medical device or a finished accessibility
product. The desktop path currently works best on macOS. The iPhone web path is
implemented, locally verified, and smoke-tested in physical iPhone Safari. A
broader iPhone and iOS version matrix is still needed. In either case, use good,
even lighting with the palm and wrist clearly visible.

Known areas for future exploration:

- broader camera and browser testing;
- improved tracking across occlusion and unusual hand angles;
- user-adjustable contact sensitivity;
- a licensed cross-platform synthetic voice backend;
- accessibility studies with people who use alternative communication;
- an installable offline application;
- performance profiling on lower-power devices.

The core vocabulary will stay intentionally compact: up to eight active
fingers, short expressions, English and Mandarin only.

---

<div align="center">
  <strong>Tap. Separate. Speak. ✦</strong>
  <br />
  <sub>Designed as a tiny communication controller you already carry with you.</sub>
</div>
