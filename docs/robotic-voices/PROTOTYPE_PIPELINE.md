# Robotic voices prototype pipeline

Status: specialist recommendation and isolated browser-audio proof, 2026-07-25

## Decision

Use an in-browser, worker-hosted TTS runtime that returns PCM to the main
thread, then use `@taptalk/robotic-voices` for routing, caching, restrained
robotic processing, global newest-request preemption, rate-controlled Web Audio
playback, failure events, and latency instrumentation.

The first runtime candidate to benchmark is sherpa-onnx WebAssembly with the
`kokoro-multi-lang-v1_0` model package. That single package exposes American
and British masculine and feminine English speaker groups plus four Mandarin
masculine and four Mandarin feminine speakers. A single resident model is
simpler than loading separate language models, though its unpacked asset set is
still several hundred megabytes.

The product must select and pin only one speaker for each TapTalk identity.
Speaker IDs remain inside the backend; neither the operating-system catalogue
nor the model's full speaker list reaches the UI.

This is a prototype approximation. The source speakers were not designed as
TapTalk characters, and the subtle ring-modulation layer only adds a
mechanical accent. Production-quality identities require commissioned voice
direction or consented recordings, a model/training-data provenance review,
listening tests with English and Mandarin speakers, and explicit commercial
rights for the selected voices. No protected character should be used as a
reference target.

## Why PCM rather than browser speech synthesis

The browser Web Speech API is useful for a throwaway single-utterance demo, but
its `speak()` method adds each utterance to a shared queue. That conflicts with
TapTalk's immediate newest-tap replacement rule unless cancellation is managed
globally. It also does not expose generated samples to Web Audio, so the
robotic processing, playback-rate control, and real audio cache cannot be
portable. The `start` event says the utterance began, but it does not provide
the same scheduling and output-latency control as an `AudioBufferSourceNode`.

A PCM boundary avoids those constraints:

```text
activation
  -> route exact TapTalk identity
  -> stop active playback and invalidate older synthesis
  -> PCM cache hit, or synthesize in local worker
  -> create a rate-controlled Web Audio source and effect graph
  -> start only if this remains the newest request
  -> emit estimated onset and completion/failure events
```

The eight editable expressions form a deliberately small working set. After
model warm-up, pre-synthesize all eight whenever assignments or per-language
voice preferences change. Cache hits make contact-to-schedule time independent
of inference speed and make short expressions responsive enough for rapid
preemption. In-flight cache deduplication prevents two simultaneous first
requests for the same phrase from duplicating synthesis. The default 1.75× PCM
playback rate is an implementation starting point for the warmed 500-ms
one-unit completion target; listening tests must qualify intelligibility in
both languages.

## Stable speech interface

The public API lives in
`packages/robotic-voices/src/index.mjs` with TypeScript declarations beside it.

Inputs:

- `requestId`: integration-owned unique activation ID.
- `text`: already validated expression, passed through unchanged.
- `language`: exactly `en` or `zh`.
- `gender`: exactly `masculine` or `feminine`.
- `confirmedAtMs`: hand-tracking confirmation time using the
  `performance.now()` time origin.
- optional `AbortSignal`: cancels only that request.

Backend contract:

```ts
interface SpeechBackend {
  revision?: string;
  warmUp?(input: { identities: VoiceIdentityId[] }): Promise<void>;
  synthesize(input: {
    text: string;
    identity: VoiceIdentityId;
  }): Promise<{ sampleRate: number; channels: Float32Array[] }>;
  dispose?(): Promise<void>;
}
```

`createWorkerPcmBackend()` implements the main-thread transport. Its module
worker protocol is intentionally small:

- main to worker: `taptalk-tts:warmup`, `taptalk-tts:synthesize`, and
  `taptalk-tts:dispose`;
- worker to main: `taptalk-tts:ready`, `taptalk-tts:result`, and
  `taptalk-tts:error`;
- every operation carries an opaque `operationId`;
- synthesis results carry `sampleRate` and transferable per-channel
  `ArrayBuffer` values;
- the adapter requires an internal mapping for exactly the four fixed identity
  IDs and never publishes that mapping as a voice catalogue.

This subsystem rejects missing/unsupported route metadata but does not count
words, inspect scripts, normalize punctuation, infer language, or otherwise
change expression validation.

Outputs:

- one `PlaybackHandle` per successful request, with request/identity, cache
  status, onset record, per-playback `stop()`, and an `ended` promise;
- `speech-requested`, `speech-scheduled`, `speech-ended`, and `speech-failed`
  observer events;
- rolling count, median, p95, maximum, and within-500-ms ratio grouped by
  measurement basis.

## Four identities

| Stable ID | Input route | Prototype character | Processing |
|---|---|---|---|
| `en-masculine` | English + masculine | warm, grounded, gently rough | 34 Hz low-mid mechanical layer |
| `en-feminine` | English + feminine | bright, nimble, clear | 47 Hz upper-mid mechanical layer |
| `zh-masculine` | Mandarin + masculine | calm, rounded, steady | 31 Hz low-mid mechanical layer |
| `zh-feminine` | Mandarin + feminine | light, precise, lively | 43 Hz upper-mid mechanical layer |

Dry speech remains above 90% of the mix. The wet path is band-limited and
quiet, then both paths pass through modest compression and short anti-click
ramps. This favors intelligibility over a dramatic robot effect. Speaker
selection and prosody must do most of the expressive work.

These descriptions are design directions, not invitations to imitate any
existing fictional character or recognizable person.

## Warm-up and cache behavior

1. Start `warmUp()` as soon as application startup permits. Model loading and
   synthesis stay off the main thread in the eventual backend.
2. Pass all eight current assignments to `warmUp()`/`prepare()`.
3. Call `unlock()` from a genuine click or tap to resume the `AudioContext`
   under autoplay rules.
4. Re-prepare only affected cache keys after assignment or preference changes.
5. Keep the model resident while the camera interaction screen is active.

The proof cache is a bounded LRU (32 entries and 32 MiB by default), keyed by
backend revision, identity, and exact text. A backend revision change cannot
reuse stale audio. Production should tune the byte limit from measurements on
low-memory target devices.

## Preemption and ordering

Integration submits activation calls in its already-determined timestamp and
finger-ID order. This package does not reorder them and has no playback queue.
Every new valid call stops active playback immediately. It creates a fresh
`AudioBufferSourceNode`, oscillator, and effect graph only after its PCM is
ready and only if no newer request has superseded it. At most one request may
play.

A single TTS worker may internally serialize cache misses. To protect the
500-ms onset and one-unit completion targets, integration should pre-cache all
eight expressions. If live configuration testing shows cache misses are too
slow, benchmark a two-worker inference pool against its model-memory cost; do
not solve it by delaying a newer request behind old speech.

## Failure behavior

- Fail only the affected current request and emit a typed `speech-failed`
  event.
- Treat replacement cancellation as expected control flow, not as a reason to
  replay or queue old speech.
- Do not substitute a system voice, another language, or another identity.
- Do not speak an error phrase; UI provides immediate visible failure state.
- Evict rejected in-flight synthesis so a later activation may retry.
- Retain already cached phrases if the synthesis backend later becomes
  unavailable.
- Treat a locked `AudioContext` as `audio-locked` and direct the UI to request
  a user activation; do not accumulate a hidden playback queue.

## Request-to-audible-onset measurement

The start timestamp is `confirmedAtMs` from the contact state machine. The
service records an `estimated-output` endpoint from the Web Audio start time
plus the browser's `outputLatency` or `baseLatency` when available. This is
useful continuous telemetry, not proof of sound leaving the speaker.

Acceptance measurement must use an observed basis:

1. Emit a physical or digital marker at contact confirmation.
2. Record speaker output with a wired loopback where possible, otherwise a
   microphone with calibrated input/output delay.
3. Detect the first sustained speech energy above the noise floor, not the
   visual event or synthesis completion.
4. Feed the observed timestamp to `recordAudibleOnset({ basis: "loopback" })`.
5. Report median and p95 separately for warm cache hits, cold cache misses,
   English, Mandarin, and representative target devices.

At least 30 activations per condition is a useful prototype floor. The product
target is both median and slow-percentile visibility; a best-case sample is not
an acceptance result.

## Portability and licensing notes

| Option | Benefits | Blocking tradeoffs |
|---|---|---|
| sherpa-onnx WASM + Kokoro | Local/offline PCM, WebAssembly support, one model with all four required speaker groups, Apache-2.0 runtime | Hundreds of MB of model assets, cold start, WASM/mobile performance and memory must be measured; model/front-end dependencies need separate license review |
| Smaller Piper/VITS models | Faster published Raspberry Pi RTF and potentially much smaller per-model downloads | Likely needs separate English and Mandarin models; speaker gender coverage and each individual model's license/provenance must be audited |
| ONNX Runtime Web with a custom exported model | Broad browser WASM support and optional WebGPU acceleration | TapTalk must own preprocessing, model integration, and model/operator compatibility; WebGPU support is less uniform than WASM |
| Browser `speechSynthesis` | Smallest integration and broad basic availability | Shared utterance queue, OS-dependent identity/quality, no PCM/DSP cache; rejected for TapTalk playback |
| Remote TTS | Easy access to high-quality managed voices | Network latency and availability, sends expression text off-device, complicates privacy/storage expectations, and cannot guarantee the 500-ms target |
| Pre-rendered assets only | Fast, local, preemption-safe | Cannot speak editable expressions; useful only for fixed diagnostics |

The sherpa-onnx codebase is Apache-2.0, and the inspected Kokoro packages contain
Apache license files. Kokoro's English frontend can include eSpeak NG data,
whose project is GPL-3.0-or-later. Model weights, voice packs, lexicons,
phonemizers, WASM binaries, notices, and training-data/voice rights are distinct
artifacts: Integration must produce a dependency bill of materials and obtain
legal approval before shipping any of them. Never infer that the runtime's
license covers model or recorded-voice rights.

## Sources consulted

- [MDN: `SpeechSynthesis.speak()` queues utterances](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak)
- [MDN: speech synthesis `start` event](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/start_event)
- [MDN: `AudioBufferSourceNode.start()`](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start)
- [sherpa-onnx WebAssembly TTS documentation](https://k2-fsa.github.io/sherpa/onnx/tts/wasm/index.html)
- [sherpa-onnx Kokoro Mandarin/English speaker mapping](https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_0.html)
- [sherpa-onnx published Raspberry Pi model RTF/size comparisons](https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/rtf.html)
- [sherpa-onnx Apache-2.0 license](https://github.com/k2-fsa/sherpa-onnx/blob/master/LICENSE)
- [ONNX Runtime Web execution providers](https://onnxruntime.ai/docs/tutorials/web/)
- [eSpeak NG licensing](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING)

## Prototype boundary

The committed diagnostic tone backend proves the audio path only. It is
deliberately not speech and must never be described as a voice demo. No model,
voice pack, third-party runtime, or generated voice asset is vendored because
the repository has no web scaffold or dependency policy yet. The stable PCM
interface allows Integration to add the selected worker backend without
changing activation callers or the preemption/caching/measurement behavior.
