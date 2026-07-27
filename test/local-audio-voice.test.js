import assert from "node:assert/strict";
import test from "node:test";

import { LocalAudioVoicePort } from "../src/adapters/local-audio-voice.js";

class FakeSource extends EventTarget {
  constructor() {
    super();
    this.connections = [];
    this.stopped = false;
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
  }

  createMediaStreamDestination() {
    return this.recordingDestination;
  }

  async decodeAudioData() {
    return { decoded: true };
  }

  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }

  async resume() {
    this.state = "running";
  }

  async close() {}
}

test("plays local speech to speakers and the recording stream", async () => {
  const requests = [];
  const port = new LocalAudioVoicePort({
    AudioContext: FakeAudioContext,
    fetchImpl: async (url) => {
      requests.push(url);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    },
    clock: () => 123,
  });
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
  assert.equal(audibleAt, 123);
  assert.equal(port.recordingStream, port.recordingDestination.stream);
  assert.match(requests[0], /format=shelley-tingting-v5/);
  assert.match(requests[0], /voiceId=en_shelley/);

  source.finish();
  assert.deepEqual(await playback, { status: "ended" });
});

test("interrupts active local speech immediately", async () => {
  const port = new LocalAudioVoicePort({
    AudioContext: FakeAudioContext,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
  });

  const playback = port.speak({
    activationId: "activation-2",
    text: "Stop",
    voiceId: "en_shelley",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(port.interrupt({ activationId: "activation-2" }), true);
  assert.equal(port.audioContext.sources[0].stopped, true);
  assert.deepEqual(await playback, { status: "interrupted" });
});

test("recording-only speech does not duplicate through the speakers", async () => {
  const port = new LocalAudioVoicePort({
    AudioContext: FakeAudioContext,
    connectToSpeakers: false,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    }),
  });

  const playback = port.speak({
    activationId: "capture-only",
    text: "Bolt",
    voiceId: "en_shelley",
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(port.audioContext.sources[0].connections, [
    port.recordingDestination,
  ]);
  port.audioContext.sources[0].finish();
  await playback;
});
