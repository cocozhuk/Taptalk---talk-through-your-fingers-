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
- a press-and-hold manual contact harness for integration work.

Real landmark/contact tracking and production robotic, overlapping speech are
clearly marked placeholders awaiting their specialist implementations. The
manual harness proves the shared routing, rearming, persistence, and feedback
path without claiming that those specialist acceptance criteria pass.

## Run locally

Node.js 20 or newer is the only prerequisite.

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. Start the camera when ready, then press and hold
one of the eight fingertip markers (or keyboard keys 1–8) to simulate a
confirmed contact. Release it to rearm that finger.

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
