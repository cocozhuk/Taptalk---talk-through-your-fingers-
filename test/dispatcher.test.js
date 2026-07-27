import assert from "node:assert/strict";
import test from "node:test";
import {
  ActivationDispatcher,
  compareActivationEvents,
} from "../src/core/activation-dispatcher.js";
import { createDefaultConfig } from "../src/core/config.js";

function event(overrides) {
  return {
    type: "activation",
    fingerId: "left_index",
    sessionId: "test-session",
    timestampMs: 100,
    frameId: 1,
    confidence: 1,
    ...overrides,
  };
}

test("same-timestamp contacts use the documented finger-ID tie-break", () => {
  const events = [
    event({ fingerId: "right_pinky" }),
    event({ fingerId: "left_middle" }),
    event({ fingerId: "left_index" }),
  ];

  events.sort(compareActivationEvents);
  assert.deepEqual(
    events.map(({ fingerId }) => fingerId),
    ["left_index", "left_middle", "right_pinky"],
  );
});

test("dispatcher orders activations and submits speech without awaiting playback", () => {
  const calls = [];
  const activations = [];
  const neverFinishes = new Promise(() => {});
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: {
      speak(request) {
        calls.push(request);
        return neverFinishes;
      },
    },
    onActivation: (activation) => activations.push(activation),
  });

  const accepted = dispatcher.dispatch([
    event({ fingerId: "right_index", timestampMs: 101, frameId: 2 }),
    event({ fingerId: "left_middle", timestampMs: 100 }),
    event({ fingerId: "left_index", timestampMs: 100 }),
  ]);

  assert.deepEqual(
    accepted.map(({ fingerId }) => fingerId),
    ["left_index", "left_middle", "right_index"],
  );
  assert.equal(calls.length, 3);
  assert.equal(activations.length, 3);
  assert.equal(calls[0].voiceId, "en_shelley");
  assert.equal(calls[2].voiceId, "zh_tingting");
});

test("dispatcher ignores legacy preferences and always uses the two fixed language voices", () => {
  const config = createDefaultConfig();
  config.voicePreferences = {
    en: "feminine",
    zh: "masculine",
  };
  const calls = [];
  const dispatcher = new ActivationDispatcher({
    getConfig: () => config,
    voicePort: {
      speak(request) {
        calls.push(request);
        return Promise.resolve();
      },
    },
  });

  dispatcher.dispatch([
    event({ fingerId: "left_index", frameId: 1 }),
  ]);
  dispatcher.dispatch([
    event({
      fingerId: "right_index",
      timestampMs: 101,
      frameId: 2,
    }),
  ]);

  assert.deepEqual(
    calls.map(({ voiceId }) => voiceId),
    ["en_shelley", "zh_tingting"],
  );
});

test("every rapid activation interrupts and replaces the global speech lane", async () => {
  const calls = [];
  const interrupts = [];
  const interruptedPairs = [];
  const audible = [];
  const failures = [];
  const controls = new Map();
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: {
      interrupt(input) {
        interrupts.push(input);
      },
      speak(request) {
        calls.push(request);
        return new Promise((resolve, reject) => {
          controls.set(request.activationId, { resolve, reject });
        });
      },
    },
    onAudibleStart: (activation) => audible.push(activation.activationId),
    onSpeechError: (_activation, error) => failures.push(error.message),
    onSpeechInterrupted: (previous, replacement) => {
      interruptedPairs.push([
        previous.activationId,
        replacement.activationId,
      ]);
    },
  });

  const [first] = dispatcher.dispatch([event()]);
  const [replacement] = dispatcher.dispatch([
    event({ timestampMs: 101, frameId: 2 }),
  ]);
  const [otherFinger] = dispatcher.dispatch([
    event({ fingerId: "right_index", timestampMs: 102, frameId: 3 }),
  ]);

  assert.equal(calls.length, 3);
  assert.deepEqual(interrupts, [
    {
      fingerId: "left_index",
      activationId: first.activationId,
      replacedByActivationId: replacement.activationId,
      replacementFingerId: "left_index",
    },
    {
      fingerId: "left_index",
      activationId: replacement.activationId,
      replacedByActivationId: otherFinger.activationId,
      replacementFingerId: "right_index",
    },
  ]);
  assert.deepEqual(interruptedPairs, [
    [first.activationId, replacement.activationId],
    [replacement.activationId, otherFinger.activationId],
  ]);
  assert.equal(otherFinger.fingerId, "right_index");

  calls[0].onAudibleStart(103);
  calls[0].onError(new Error("cancelled"));
  calls[1].onAudibleStart(104);
  calls[2].onAudibleStart(105);

  assert.deepEqual(audible, [
    otherFinger.activationId,
  ]);
  assert.deepEqual(failures, []);

  controls.get(first.activationId).reject(new Error("interrupted"));
  controls.get(replacement.activationId).reject(new Error("interrupted"));
  controls.get(otherFinger.activationId).resolve();
  await Promise.resolve();
  assert.deepEqual(failures, []);
});

test("a completed request does not trigger a later global interruption", async () => {
  const interrupts = [];
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: {
      interrupt(input) {
        interrupts.push(input);
      },
      speak() {
        return Promise.resolve();
      },
    },
  });

  dispatcher.dispatch([event()]);
  await Promise.resolve();
  dispatcher.dispatch([
    event({
      fingerId: "right_index",
      timestampMs: 101,
      frameId: 2,
    }),
  ]);

  assert.deepEqual(interrupts, []);
});

test("dispatcher rejects duplicate and stale activation events", () => {
  const calls = [];
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: {
      speak(request) {
        calls.push(request);
      },
    },
  });

  const newest = event({ frameId: 5 });
  assert.equal(dispatcher.dispatch([newest, newest]).length, 1);
  assert.equal(dispatcher.dispatch([event({ frameId: 4 })]).length, 0);
  assert.equal(calls.length, 1);
});

test("dispatcher ignores malformed and non-activation tracking events", () => {
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: { speak() {} },
  });

  assert.deepEqual(
    dispatcher.dispatch([
      event({ type: "separation" }),
      event({ fingerId: "thumb" }),
      event({ timestampMs: Number.NaN }),
    ]),
    [],
  );
});
