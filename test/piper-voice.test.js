import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_VOICE_MODELS,
  PIPER_VOICE_MODELS,
  PiperVoicePort,
} from "../src/adapters/piper-voice.js";

const matchaRequests = [];

async function fakeFetch(url) {
  matchaRequests.push(url);
  return {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(16),
    text: async () => "",
  };
}

class FakeSource extends EventTarget {
  constructor() {
    super();
    this.connections = [];
  }

  connect(destination) {
    this.connections.push(destination);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
    this.dispatchEvent(new Event("ended"));
  }

  disconnect() {
    this.disconnected = true;
  }

  finish() {
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeAudioContext {
  constructor() {
    this.state = "running";
    this.destination = { name: "speakers" };
    this.recordingDestination = {
      name: "recorder",
      stream: { getAudioTracks: () => [{ kind: "audio" }] },
    };
    this.sources = [];
    this.constantSources = [];
    this.decoded = [];
  }

  createMediaStreamDestination() {
    return this.recordingDestination;
  }

  async decodeAudioData(audioData) {
    const buffer = { audioData };
    this.decoded.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  createConstantSource() {
    const source = new FakeSource();
    source.offset = { value: 1 };
    this.constantSources.push(source);
    return source;
  }

  async resume() {
    this.state = "running";
  }

  async close() {}
}

class FakeTtsSession {
  static _instance = null;
  static created = [];
  static predictions = [];

  static reset() {
    this._instance = null;
    this.created = [];
    this.predictions = [];
  }

  static async create(options) {
    this.created.push(options.voiceId);
    const session = new FakeTtsSession(options.voiceId);
    this._instance = session;
    return session;
  }

  constructor(voiceId) {
    this.voiceId = voiceId;
  }

  async predict(text) {
    FakeTtsSession.predictions.push({
      text,
      voiceId: this.voiceId,
    });
    return {
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  }
}

function assignments() {
  return {
    left_index: { language: "en", text: "Hello" },
    left_middle: { language: "en", text: "Hello" },
    left_ring: { language: "en", text: "" },
    right_index: { language: "zh", text: "你好" },
  };
}

test("locks synthesis to Piper English and Matcha Mandarin", async () => {
  FakeTtsSession.reset();
  matchaRequests.length = 0;
  const port = new PiperVoicePort({
    TtsSession: FakeTtsSession,
    AudioContext: FakeAudioContext,
    fetchImpl: fakeFetch,
  });

  await port.warmAssignments(assignments());

  assert.deepEqual(PIPER_VOICE_MODELS, {
    en: "en_US-hfc_female-medium",
  });
  assert.deepEqual(LOCAL_VOICE_MODELS, {
    en: "en_US-hfc_female-medium",
    zh: "zh_matcha-baker-local",
  });
  assert.deepEqual(FakeTtsSession.created, [
    PIPER_VOICE_MODELS.en,
  ]);
  assert.deepEqual(FakeTtsSession.predictions, [
    { text: "Hello", voiceId: PIPER_VOICE_MODELS.en },
  ]);
  assert.deepEqual(matchaRequests, [
    "/api/matcha-speech?text=%E4%BD%A0%E5%A5%BD",
  ]);
});

test("plays approved local audio to speakers and recorder together", async () => {
  FakeTtsSession.reset();
  const port = new PiperVoicePort({
    TtsSession: FakeTtsSession,
    AudioContext: FakeAudioContext,
    clock: () => 321,
    fetchImpl: fakeFetch,
  });
  await port.warmAssignments(assignments());
  let audibleAt = null;

  const playback = port.speak({
    activationId: "activation-1",
    text: "Hello",
    voiceId: "en_shelley",
    onAudibleStart: (time) => {
      audibleAt = time;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const source = port.audioContext.sources[0];
  assert.equal(source.started, true);
  assert.deepEqual(source.connections, [
    port.audioContext.destination,
    port.recordingDestination,
  ]);
  assert.equal(audibleAt, 321);
  assert.equal(port.recordingStream, port.recordingDestination.stream);

  source.finish();
  assert.deepEqual(await playback, { status: "ended" });
});

test("starts continuous silent audio before recording to keep video synchronized", async () => {
  FakeTtsSession.reset();
  const port = new PiperVoicePort({
    TtsSession: FakeTtsSession,
    AudioContext: FakeAudioContext,
    fetchImpl: fakeFetch,
  });
  port.audioContext.state = "suspended";

  await port.prepareRecording();

  const clockSource = port.audioContext.constantSources[0];
  assert.equal(port.audioContext.state, "running");
  assert.equal(clockSource.offset.value, 0);
  assert.equal(clockSource.started, true);
  assert.deepEqual(clockSource.connections, [
    port.recordingDestination,
  ]);

  port.finishRecording();
  assert.equal(clockSource.stopped, true);
  assert.equal(clockSource.disconnected, true);
});

test("rapid replacement interrupts active local playback", async () => {
  FakeTtsSession.reset();
  const port = new PiperVoicePort({
    TtsSession: FakeTtsSession,
    AudioContext: FakeAudioContext,
    fetchImpl: fakeFetch,
  });
  await port.warmAssignments(assignments());

  const playback = port.speak({
    activationId: "activation-2",
    text: "你好",
    voiceId: "zh_tingting",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(port.interrupt({ activationId: "activation-2" }), true);
  assert.equal(port.audioContext.sources[0].stopped, true);
  assert.deepEqual(await playback, { status: "interrupted" });
});
