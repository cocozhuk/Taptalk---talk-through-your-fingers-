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
    activationId: "activation-1",
    fingerId: "left_index",
    text: "Hello",
    voiceId: "en_shelley",
    onAudibleStart: (timestampMs) => {
      audibleAt = timestampMs;
    },
  });

  assert.deepEqual(calls, ["resume", "speak"]);
  assert.equal(audibleAt, 123);
  assert.equal(englishVoice, port.pickInternalVoice("en-US"));
});

test("the locked Shelley and Tingting profiles use natural speech settings", async () => {
  const utterances = [];
  const speechSynthesis = {
    getVoices: () => [],
    speak: (utterance) => {
      utterances.push(utterance);
      utterance.dispatchEvent(new Event("start"));
      utterance.dispatchEvent(new Event("end"));
    },
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
  });

  for (const [index, voiceId] of [
    "en_shelley",
    "zh_tingting",
  ].entries()) {
    await port.speak({
      activationId: `activation-${index}`,
      fingerId: "left_index",
      text: index === 0 ? "slay" : "好",
      voiceId,
    });
  }

  assert.deepEqual(
    utterances.map(({ rate }) => rate),
    [1, 1],
  );
  assert.deepEqual(
    utterances.map(({ pitch }) => pitch),
    [1, 1],
  );
});

test("the locked Mandarin voice selects Tingting when the browser supplies it", async () => {
  const utterances = [];
  const voices = [
    {
      name: "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)",
      lang: "zh-CN",
      localService: false,
    },
    {
      name: "Eddy (Chinese (China mainland))",
      lang: "zh_CN",
      localService: true,
    },
    {
      name: "Shelley (Chinese (China mainland))",
      lang: "zh-CN",
      localService: true,
    },
    {
      name: "Tingting",
      lang: "zh-CN",
      localService: true,
    },
  ];
  const speechSynthesis = {
    getVoices: () => voices,
    speak: (utterance) => {
      utterances.push(utterance);
      utterance.dispatchEvent(new Event("start"));
      utterance.dispatchEvent(new Event("end"));
    },
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
  });

  await port.speak({
    activationId: "mandarin-feminine",
    fingerId: "right_middle",
    text: "好的",
    voiceId: "zh_tingting",
  });

  assert.equal(
    utterances[0].voice.name,
    "Tingting",
  );
  assert.equal(utterances[0].pitch, 1);
});

test("the locked Mandarin voice remains Tingting among local Mac voices", async () => {
  const utterances = [];
  const speechSynthesis = {
    getVoices: () => [
      {
        name: "Eddy (Chinese (China mainland))",
        lang: "zh-CN",
        localService: true,
      },
      {
        name: "Shelley (Chinese (China mainland))",
        lang: "zh-CN",
        localService: true,
      },
      {
        name: "Tingting",
        lang: "zh-CN",
        localService: true,
      },
    ],
    speak: (utterance) => {
      utterances.push(utterance);
      utterance.dispatchEvent(new Event("start"));
      utterance.dispatchEvent(new Event("end"));
    },
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
  });

  await port.speak({
    activationId: "mandarin-feminine",
    fingerId: "right_middle",
    text: "好的",
    voiceId: "zh_tingting",
  });

  assert.equal(
    utterances[0].voice.name,
    "Tingting",
  );
});

test("the English default locks to Shelley when the browser supplies it", () => {
  const originalEnglishVoice = {
    name: "Original English",
    lang: "en-GB",
    localService: false,
  };
  const shelley = {
    name: "Shelley (English (US))",
    lang: "en-US",
    localService: true,
  };
  const speechSynthesis = {
    getVoices: () => [
      originalEnglishVoice,
      shelley,
    ],
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
  });

  assert.equal(
    port.pickInternalVoice("en-US", ["Shelley"]),
    shelley,
  );
});

test("interrupt cancels pending browser speech before any-finger replacement", async () => {
  const calls = [];
  const utterances = [];
  const scheduled = new Map();
  let nextTimerId = 0;
  const speechSynthesis = {
    getVoices: () => [],
    resume: () => calls.push("resume"),
    cancel: () => calls.push("cancel"),
    speak: (utterance) => {
      utterances.push(utterance);
      calls.push(`speak:${utterance.text}`);
    },
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
    schedule(callback) {
      const timerId = ++nextTimerId;
      scheduled.set(timerId, callback);
      return timerId;
    },
    cancelSchedule(timerId) {
      scheduled.delete(timerId);
    },
  });

  const first = port.speak({
    activationId: "activation-1",
    fingerId: "left_index",
    text: "slay",
    voiceId: "en_shelley",
  });
  assert.equal(
    port.interrupt({
      fingerId: "left_index",
      activationId: "activation-1",
      replacedByActivationId: "activation-2",
    }),
    true,
  );
  const second = port.speak({
    activationId: "activation-2",
    fingerId: "right_index",
    text: "period",
    voiceId: "en_shelley",
  });

  assert.deepEqual(await first, { status: "interrupted" });
  assert.deepEqual(calls, ["resume", "speak:slay", "cancel"]);
  assert.equal(scheduled.size, 1);
  for (const [timerId, callback] of [...scheduled]) {
    scheduled.delete(timerId);
    callback();
  }
  utterances[0].dispatchEvent(new Event("error"));
  utterances[1].dispatchEvent(new Event("start"));
  utterances[1].dispatchEvent(new Event("end"));
  assert.deepEqual(await second, { status: "ended" });
  assert.deepEqual(calls, [
    "resume",
    "speak:slay",
    "cancel",
    "resume",
    "speak:period",
  ]);
});

test("a rapid replacement burst starts only the newest utterance after cancellation flushes", async () => {
  const spoken = [];
  const scheduled = new Map();
  let nextTimerId = 0;
  const speechSynthesis = {
    getVoices: () => [],
    cancel() {},
    speak(utterance) {
      spoken.push(utterance);
    },
  };
  const port = new WebSpeechVoicePort({
    speechSynthesis,
    Utterance: FakeUtterance,
    schedule(callback) {
      const timerId = ++nextTimerId;
      scheduled.set(timerId, callback);
      return timerId;
    },
    cancelSchedule(timerId) {
      scheduled.delete(timerId);
    },
  });

  const first = port.speak({
    activationId: "activation-1",
    fingerId: "left_index",
    text: "slay",
    voiceId: "en_shelley",
  });
  port.interrupt({ activationId: "activation-1" });
  const second = port.speak({
    activationId: "activation-2",
    fingerId: "right_index",
    text: "好",
    voiceId: "zh_tingting",
  });
  port.interrupt({ activationId: "activation-2" });
  const third = port.speak({
    activationId: "activation-3",
    fingerId: "left_middle",
    text: "period",
    voiceId: "en_shelley",
  });

  assert.deepEqual(await first, { status: "interrupted" });
  assert.deepEqual(await second, { status: "interrupted" });
  assert.deepEqual(spoken.map(({ text }) => text), ["slay"]);
  assert.equal(scheduled.size, 1);

  for (const [timerId, callback] of [...scheduled]) {
    scheduled.delete(timerId);
    callback();
  }
  assert.deepEqual(spoken.map(({ text }) => text), ["slay", "period"]);

  spoken[1].dispatchEvent(new Event("start"));
  spoken[1].dispatchEvent(new Event("end"));
  assert.deepEqual(await third, { status: "ended" });
});
