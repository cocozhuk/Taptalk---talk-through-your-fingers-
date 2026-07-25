# TapTalk

TapTalk is an experimental, local-first webcam communication interface. It maps
deliberate thumb-to-fingertip contacts to eight short spoken expressions in
English or Mandarin Chinese.

The current runnable integration scaffold includes:

- local webcam preview with explicit start/stop and camera-active feedback;
- exactly eight editable assignments with local persistence and reset;
- strict first-prototype English and Mandarin validation;
- exactly four fixed TapTalk voice identities;
- deterministic timestamp/finger-ID activation dispatch;
- visual and audible-onset latency instrumentation;
- on-device MediaPipe landmarks for up to two hands;
- scale-normalized thumb-to-fingertip contact detection with separation rearm;
- fingertip-adjacent expression labels driven by live landmark positions;
- a press-and-hold manual fallback for development and camera-free testing.

The first prototype now runs its camera and hand-landmark model locally. The
four voice identities still use a browser-speech fallback in the integrated UI;
the separate robotic-voice package proves concurrent PCM playback but still
needs a licensed English/Mandarin synthesis model before it is production
quality.

## Run locally

Node.js 20 or newer is required.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:4173`, start the camera, and hold both hands in view.
Touch a non-thumb fingertip to the thumb on the same hand; separate them before
using that finger again. The marker and keyboard controls remain available as a
camera-free fallback.

## Verify

```sh
npm test
npm run build
# or both:
npm run check
```

The static production assembly is written to `dist/`.

## Project contracts

The shared product rules live in
[`docs/PRODUCT_CONTRACT.md`](docs/PRODUCT_CONTRACT.md), the prototype-ready
behavior is specified in
[`docs/ARCHITECTURE_SPEC.md`](docs/ARCHITECTURE_SPEC.md), and the runnable
architecture and specialist ports are recorded in
[`docs/INTEGRATION_PLAN.md`](docs/INTEGRATION_PLAN.md). Individual specialist
responsibilities live in [`docs/agent-briefs`](docs/agent-briefs).

No specialist may silently broaden TapTalk into sign-language recognition,
arbitrary gesture interpretation, unrestricted text entry, or a general voice
catalogue.
