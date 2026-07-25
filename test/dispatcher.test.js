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
  assert.equal(calls[0].voiceId, "en_masculine");
  assert.equal(calls[2].voiceId, "zh_feminine");
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

