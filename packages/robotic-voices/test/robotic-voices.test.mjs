import assert from "node:assert/strict";
import test from "node:test";

import {
  LatencyTracker,
  TapTalkSpeechError,
  VOICE_IDENTITIES,
  VOICE_IDENTITY_IDS,
  createTapTalkSpeech,
  createWorkerPcmBackend,
  routeVoiceIdentity,
} from "../src/index.mjs";
import { createDiagnosticToneBackend } from "../src/diagnostic-tone-backend.mjs";

class FakeAudioParam {
  value = 0;
  events = [];

  setValueAtTime(value, atTime) {
    this.value = value;
    this.events.push(["set", value, atTime]);
  }

  linearRampToValueAtTime(value, atTime) {
    this.value = value;
    this.events.push(["ramp", value, atTime]);
  }
}

class FakeAudioNode {
  connections = [];
  disconnected = false;

  connect(destination) {
    this.connections.push(destination);
    return destination;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeScheduledNode extends FakeAudioNode {
  constructor(context) {
    super();
    this.context = context;
  }

  start(atTime) {
    this.startedAt = atTime;
  }

  stop(atTime) {
    this.stoppedAt = atTime;
    if (atTime <= this.context.currentTime) {
      this.finish();
    }
  }

  finish() {
    if (!this.finished) {
      this.finished = true;
      this.onended?.();
    }
  }
}

class FakeBufferSource extends FakeScheduledNode {
  playbackRate = new FakeAudioParam();

  start(atTime) {
    super.start(atTime);
    this.context.startedSources.push(this);
  }
}

class FakeOscillator extends FakeScheduledNode {
  frequency = new FakeAudioParam();
  type = "sine";
}

class FakeGain extends FakeAudioNode {
  gain = new FakeAudioParam();
}

class FakeFilter extends FakeAudioNode {
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
  type = "lowpass";
}

class FakeCompressor extends FakeAudioNode {
  threshold = new FakeAudioParam();
  knee = new FakeAudioParam();
  ratio = new FakeAudioParam();
  attack = new FakeAudioParam();
  release = new FakeAudioParam();
}

class FakeBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  copyToChannel(source, channelNumber) {
    this.channels[channelNumber].set(source);
  }

  getChannelData(channelNumber) {
    return this.channels[channelNumber];
  }
}

class FakeAudioContext {
  currentTime = 2;
  baseLatency = 0.02;
  state = "running";
  destination = new FakeAudioNode();
  startedSources = [];

  createBuffer(numberOfChannels, length, sampleRate) {
    return new FakeBuffer(numberOfChannels, length, sampleRate);
  }

  createBufferSource() {
    return new FakeBufferSource(this);
  }

  createGain() {
    return new FakeGain();
  }

  createBiquadFilter() {
    return new FakeFilter();
  }

  createDynamicsCompressor() {
    return new FakeCompressor();
  }

  createOscillator() {
    return new FakeOscillator(this);
  }

  async resume() {
    if (this.resumeError !== undefined) {
      throw this.resumeError;
    }
    if (this.resumeLeavesSuspended !== true) {
      this.state = "running";
    }
  }
}

class FakeWorker {
  listeners = new Map();
  messages = [];
  terminated = false;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message) {
    this.messages.push(message);
    if (message.type === "taptalk-tts:warmup") {
      queueMicrotask(() => {
        this.emit("message", {
          type: "taptalk-tts:ready",
          operationId: message.operationId,
        });
      });
    }
    if (message.type === "taptalk-tts:synthesize") {
      queueMicrotask(() => {
        this.emit("message", {
          type: "taptalk-tts:result",
          operationId: message.operationId,
          sampleRate: 24_000,
          channels: [new Float32Array([0.1, 0.2]).buffer],
        });
      });
    }
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

function pcm(durationFrames = 2400) {
  return {
    sampleRate: 24_000,
    channels: [new Float32Array(durationFrames).fill(0.1)],
  };
}

function request(overrides = {}) {
  return {
    requestId: "activation-1",
    text: "Hello",
    language: "en",
    gender: "masculine",
    confirmedAtMs: 900,
    ...overrides,
  };
}

test("exports exactly four fixed identities and routes without inspecting text", () => {
  assert.deepEqual(VOICE_IDENTITY_IDS, [
    "en-masculine",
    "en-feminine",
    "zh-masculine",
    "zh-feminine",
  ]);
  assert.equal(Object.keys(VOICE_IDENTITIES).length, 4);
  assert.equal(routeVoiceIdentity("zh", "feminine").id, "zh-feminine");
  assert.throws(() => routeVoiceIdentity("fr", "feminine"), RangeError);
});

test("warm-up deduplicates in-flight synthesis and subsequent playback hits PCM cache", async () => {
  let syntheses = 0;
  const backend = {
    revision: "test-v1",
    async synthesize() {
      syntheses += 1;
      await Promise.resolve();
      return pcm();
    },
  };
  const context = new FakeAudioContext();
  const speech = createTapTalkSpeech({
    backend,
    audioContext: context,
    clock: { now: () => 1000 },
  });
  const preparation = { text: "Hello", language: "en", gender: "masculine" };

  const [first, second] = await Promise.all([
    speech.prepare(preparation),
    speech.prepare(preparation),
  ]);
  assert.equal(syntheses, 1);
  assert.deepEqual(new Set([first.cacheStatus, second.cacheStatus]), new Set(["miss", "shared"]));

  const playback = await speech.speak(request());
  assert.equal(playback.cacheStatus, "hit");
  assert.equal(syntheses, 1);
  context.startedSources[0].finish();
  await playback.ended;
});

test("a new request interrupts active Web Audio playback regardless of language", async () => {
  const context = new FakeAudioContext();
  const speech = createTapTalkSpeech({
    backend: {
      revision: "test-v1",
      async synthesize() {
        return pcm(4800);
      },
    },
    audioContext: context,
    clock: { now: () => 1000 },
  });

  const first = await speech.speak(request());
  const second = await speech.speak(
    request({
      requestId: "activation-2",
      text: "你好",
      language: "zh",
      gender: "feminine",
      confirmedAtMs: 905,
    }),
  );

  assert.equal(context.startedSources.length, 2);
  assert.notEqual(context.startedSources[0], context.startedSources[1]);
  assert.equal((await first.ended).reason, "interrupted");
  assert.equal(speech.activePlaybackCount(), 1);
  assert.equal(context.startedSources[0].startedAt, context.startedSources[1].startedAt);
  assert.equal(context.startedSources[1].playbackRate.value, 1.75);

  context.startedSources[1].finish();
  assert.equal((await second.ended).reason, "ended");
  assert.equal(speech.activePlaybackCount(), 0);
});

test("only the newest request may start when synthesis completes out of order", async () => {
  const context = new FakeAudioContext();
  const resolvers = new Map();
  const speech = createTapTalkSpeech({
    backend: {
      async synthesize({ text }) {
        return new Promise((resolve) => {
          resolvers.set(text, resolve);
        });
      },
    },
    audioContext: context,
    clock: { now: () => 1000 },
  });

  const first = speech.speak(request({ text: "first" }));
  await Promise.resolve();
  const second = speech.speak(
    request({
      requestId: "activation-2",
      text: "second",
      confirmedAtMs: 905,
    }),
  );
  const outcomes = Promise.allSettled([first, second]);
  for (let turn = 0; turn < 8 && resolvers.size < 2; turn += 1) {
    await Promise.resolve();
  }
  assert.equal(resolvers.size, 2);

  resolvers.get("first")(pcm());
  resolvers.get("second")(pcm());
  const [firstResult, secondResult] = await outcomes;

  assert.equal(firstResult.status, "rejected");
  assert.equal(firstResult.reason.code, "cancelled");
  assert.equal(secondResult.status, "fulfilled");
  assert.equal(context.startedSources.length, 1);
  context.startedSources[0].finish();
  await secondResult.value.ended;
});

test("estimated onset uses contact confirmation and output latency", async () => {
  const context = new FakeAudioContext();
  const speech = createTapTalkSpeech({
    backend: { synthesize: async () => pcm() },
    audioContext: context,
    clock: { now: () => 1000 },
    startLeadSeconds: 0.005,
  });

  const playback = await speech.speak(request());
  assert.equal(playback.onset.basis, "estimated-output");
  assert.equal(playback.onset.onsetAtMs, 1025);
  assert.equal(playback.onset.latencyMs, 125);

  const snapshot = speech.latencySnapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.medianMs, 125);
  assert.equal(snapshot.p95Ms, 125);

  context.startedSources[0].finish();
  await playback.ended;
});

test("observed loopback onset is recorded separately from estimates", async () => {
  const context = new FakeAudioContext();
  const speech = createTapTalkSpeech({
    backend: { synthesize: async () => pcm() },
    audioContext: context,
    clock: { now: () => 1000 },
  });

  const playback = await speech.speak(request());
  speech.recordAudibleOnset({
    requestId: "activation-1",
    audibleAtMs: 1110,
    basis: "loopback",
  });

  assert.equal(speech.latencySnapshot({ basis: "loopback" }).medianMs, 210);
  assert.equal(speech.latencySnapshot({ basis: "estimated-output" }).count, 1);
  context.startedSources[0].finish();
  await playback.ended;
});

test("one synthesis failure emits a typed event and does not block a later request", async () => {
  const events = [];
  const context = new FakeAudioContext();
  const speech = createTapTalkSpeech({
    backend: {
      async synthesize({ text }) {
        if (text === "fail") {
          throw new Error("backend unavailable");
        }
        return pcm();
      },
    },
    audioContext: context,
    clock: { now: () => 1000 },
    onEvent: (event) => events.push(event),
  });

  await assert.rejects(
    speech.speak(request({ text: "fail" })),
    (error) => error instanceof TapTalkSpeechError && error.code === "synthesis-failed",
  );
  const playback = await speech.speak(
    request({ requestId: "activation-2", text: "works" }),
  );
  assert.equal(context.startedSources.length, 1);
  assert.equal(events.find((event) => event.type === "speech-failed").requestId, "activation-1");

  context.startedSources[0].finish();
  await playback.ended;
});

test("a locked AudioContext fails instead of accumulating a hidden playback queue", async () => {
  const context = new FakeAudioContext();
  context.state = "suspended";
  context.resumeLeavesSuspended = true;
  const speech = createTapTalkSpeech({
    backend: { synthesize: async () => pcm() },
    audioContext: context,
    clock: { now: () => 1000 },
  });

  await assert.rejects(
    speech.speak(request()),
    (error) => error instanceof TapTalkSpeechError && error.code === "audio-locked",
  );
  assert.equal(context.startedSources.length, 0);
});

test("an autoplay-policy resume rejection remains an audio-locked failure", async () => {
  const context = new FakeAudioContext();
  context.state = "suspended";
  context.resumeError = new Error("Not allowed without a user gesture");
  const speech = createTapTalkSpeech({
    backend: { synthesize: async () => pcm() },
    audioContext: context,
    clock: { now: () => 1000 },
  });

  await assert.rejects(
    speech.speak(request()),
    (error) => error instanceof TapTalkSpeechError && error.code === "audio-locked",
  );
  assert.equal(context.startedSources.length, 0);
});

test("latency tracker reports median and nearest-rank p95", () => {
  const tracker = new LatencyTracker({ targetMs: 30 });
  for (const [index, latencyMs] of [10, 20, 30, 40].entries()) {
    tracker.record({
      requestId: `request-${index}`,
      identity: "en-masculine",
      confirmedAtMs: 100,
      onsetAtMs: 100 + latencyMs,
      basis: "loopback",
    });
  }

  assert.deepEqual(tracker.snapshot({ basis: "loopback" }), {
    basis: "loopback",
    count: 4,
    targetMs: 30,
    medianMs: 25,
    p95Ms: 40,
    maxMs: 40,
    withinTargetRatio: 0.75,
  });
});

test("diagnostic backend stays clearly non-speech and yields distinct fixed identities", async () => {
  const backend = createDiagnosticToneBackend();
  const first = await backend.synthesize({ identity: "en-masculine" });
  const second = await backend.synthesize({ identity: "zh-feminine" });

  assert.equal(first.sampleRate, 24_000);
  assert.equal(first.channels[0].length, second.channels[0].length);
  assert.notDeepEqual(first.channels[0], second.channels[0]);
});

test("worker adapter keeps model speakers private behind exactly four identities", async () => {
  const worker = new FakeWorker();
  const speakers = {
    "en-masculine": 13,
    "en-feminine": 5,
    "zh-masculine": 49,
    "zh-feminine": 45,
  };
  const backend = createWorkerPcmBackend({
    worker,
    speakers,
    revision: "model-build-1",
  });

  await backend.warmUp({ identities: VOICE_IDENTITY_IDS });
  const audio = await backend.synthesize({
    text: "Hello",
    identity: "en-masculine",
  });

  assert.equal(backend.revision, "model-build-1");
  assert.equal(audio.sampleRate, 24_000);
  assert.ok(Math.abs(audio.channels[0][0] - 0.1) < 1e-6);
  assert.ok(Math.abs(audio.channels[0][1] - 0.2) < 1e-6);
  assert.equal(worker.messages[0].voices.length, 4);
  assert.equal(worker.messages[1].speaker, 13);
  assert.equal("speakers" in backend, false);

  backend.dispose();
  assert.equal(worker.terminated, true);
});

test("worker adapter rejects missing identities instead of creating a wider catalogue", () => {
  assert.throws(
    () =>
      createWorkerPcmBackend({
        worker: new FakeWorker(),
        speakers: {
          "en-masculine": 13,
          "en-feminine": 5,
          "zh-masculine": 49,
        },
      }),
    /exactly the four/,
  );
});
