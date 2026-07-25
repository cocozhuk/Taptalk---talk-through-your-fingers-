import test from "node:test";
import assert from "node:assert/strict";

import { WebSpeechVoicePort } from "../src/adapters/web-speech-voice.js";

class FakeUtterance extends EventTarget {
  constructor(text) {
    super();
    this.text = text;
  }
}

test("resumes speech output and reports audible start", async () => {
  const calls = [];
  const englishVoice = { lang: "en-GB" };
  const speechSynthesis = {
    getVoices: () => [englishVoice],
    resume: () => calls.push("resume"),
    speak: (utterance) => {
      calls.push("speak");
      utterance.dispatchEvent(new Event("start"));
      utterance.dispatchEvent(new Event("end"));
    },
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
    clock: () => 123,
  });
  let audibleAt = null;

  await port.speak({
    text: "Hello",
    voiceId: "en_masculine",
    onAudibleStart: (timestampMs) => {
      audibleAt = timestampMs;
    },
  });

  assert.deepEqual(calls, ["resume", "speak"]);
  assert.equal(audibleAt, 123);
});
