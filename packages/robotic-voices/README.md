# TapTalk robotic voices

> Archived experiment — this package is not used by the current TapTalk app.
> The active implementation is `src/adapters/piper-voice.js` and exposes only
> the fixed Piper English and Matcha Mandarin voices documented in the main
> README. The
> four-identity API below remains for historical tests and research.

This package owns the browser-side speech boundary for exactly four identities:

- `en-masculine`
- `en-feminine`
- `zh-masculine`
- `zh-feminine`

It routes explicit language and gender preferences, caches synthesized PCM,
adds a restrained mechanical Web Audio layer, immediately preempts older
playback, reports typed failures, and records request-to-onset measurements.
It does not validate expression content and does not expose a speech-engine
voice list.

## Integration

Provide a synthesis backend that returns mono or multichannel `Float32Array`
PCM. A worker-hosted local TTS implementation is the intended backend;
`createWorkerPcmBackend()` supplies the main-thread side of that transport and
requires a private mapping for exactly the four identity IDs.

```js
import { createTapTalkSpeech } from "@taptalk/robotic-voices";

const speech = createTapTalkSpeech({
  backend: localTtsWorkerBackend,
  audioContext: new AudioContext({ latencyHint: "interactive" }),
  onEvent: (event) => appEvents.dispatch(event),
});

// Begin model loading early. Prime all eight assigned expressions whenever
// configuration changes; this is what makes contact playback reliably fast.
await speech.warmUp(
  assignments.map(({ text, language, gender }) => ({ text, language, gender })),
);

// Must run inside a click/tap handler so browser autoplay policy can unlock it.
await speech.unlock();

// Do not await one activation before submitting the next. Each call immediately
// stops or supersedes the previous request so the newest activation owns audio.
const playbackPromise = speech.speak({
  requestId: activation.id,
  text: assignment.text,
  language: assignment.language,
  gender: voicePreferences[assignment.language],
  confirmedAtMs: activation.confirmedAtMs, // performance.now() time origin
});
playbackPromise.catch(showSpeechFailure);
```

`speech-scheduled` contains an `estimated-output` onset. It includes the
browser's reported output/base latency but is not a physical speaker
measurement. QA can feed loopback or instrumented observations back through
`recordAudibleOnset()` and then read median and p95 with
`latencySnapshot({ basis: "loopback" })`.

## Failure behavior

- A missing route, locked audio context, malformed backend response, synthesis
  failure, or cancellation rejects only that request and emits `speech-failed`.
- Failed synthesis is evicted from the in-flight map so the next activation can
  retry.
- Cached phrases remain playable if later synthesis fails.
- There is no `speechSynthesis` fallback because it would silently replace the
  identity and does not provide the same PCM timing and interruption control.
- UI feedback owns the user-facing error state; this package does not speak an
  error message that could mask or delay another activation.

## Diagnostic backend

`@taptalk/robotic-voices/diagnostic` provides four short, distinct tones for
tests and integration wiring. They are not speech, are not intelligible, and
must never be presented as the four product voices.

Serve this directory over HTTP and open `demo/index.html` to exercise the real
browser audio path. The page repeats the same non-speech warning and displays
current playback, cache state, and estimated median/p95 timing.
