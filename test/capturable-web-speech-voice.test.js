import assert from "node:assert/strict";
import test from "node:test";

import { CapturableWebSpeechVoicePort } from "../src/adapters/capturable-web-speech-voice.js";

function request() {
  return {
    activationId: "activation-1",
    fingerId: "left_index",
    text: "Hello",
    voiceId: "en_shelley",
  };
}

test("browser speech remains authoritative while capture audio stays silent", async () => {
  const calls = [];
  const liveVoice = {
    speechSynthesis: {},
    Utterance: function Utterance() {},
    speak: async () => {
      calls.push("browser");
      return { status: "ended" };
    },
    interrupt: () => false,
  };
  const recordingVoice = {
    connectToSpeakers: false,
    recordingStream: { id: "capture" },
    warmAssignments: async () => {},
    speak: async () => {
      calls.push("capture");
      return { status: "ended" };
    },
    interrupt: () => false,
    destroy() {},
  };
  const port = new CapturableWebSpeechVoicePort({
    liveVoice,
    recordingVoice,
  });

  assert.equal(port.hasPreparedRecordingAudio, false);
  await port.warmAssignments([]);
  assert.equal(port.hasPreparedRecordingAudio, true);
  assert.deepEqual(await port.speak(request()), { status: "ended" });
  assert.deepEqual(calls, ["capture", "browser"]);
  assert.equal(recordingVoice.connectToSpeakers, false);
});

test("local output remains audible only when browser speech is unavailable", async () => {
  const calls = [];
  const liveVoice = {
    speechSynthesis: null,
    Utterance: null,
    interrupt: () => false,
  };
  const recordingVoice = {
    connectToSpeakers: false,
    recordingStream: { id: "capture" },
    warmAssignments: async () => {},
    speak: async () => {
      calls.push("local");
      return { status: "ended" };
    },
    interrupt: () => false,
    destroy() {},
  };
  const port = new CapturableWebSpeechVoicePort({
    liveVoice,
    recordingVoice,
  });

  assert.deepEqual(await port.speak(request()), { status: "ended" });
  assert.deepEqual(calls, ["local"]);
  assert.equal(recordingVoice.connectToSpeakers, true);
});

test("failed recording speech preparation enables the hosted fallback", async () => {
  const liveVoice = {
    speechSynthesis: {},
    Utterance: function Utterance() {},
    interrupt: () => false,
  };
  const recordingVoice = {
    connectToSpeakers: false,
    recordingStream: { id: "capture" },
    warmAssignments: async () => {
      throw new Error("Local endpoint unavailable");
    },
    interrupt: () => false,
    destroy() {},
  };
  const port = new CapturableWebSpeechVoicePort({
    liveVoice,
    recordingVoice,
  });

  await assert.rejects(
    port.warmAssignments([]),
    /Local endpoint unavailable/,
  );
  assert.equal(port.hasPreparedRecordingAudio, false);
});
