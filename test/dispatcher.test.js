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

test("dispatcher speaks the earliest activation and drops rapid taps", async () => {
  const calls = [];
  const activations = [];
  const dropped = [];
  const resolvers = [];
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: {
      speak(request) {
        calls.push(request);
        return new Promise((resolve) => {
          resolvers.push(resolve);
        });
      },
    },
    onActivation: (activation) => activations.push(activation),
    onSpeechBusy: (event, activeActivation) => {
      dropped.push({
        fingerId: event.fingerId,
        activeFingerId: activeActivation.fingerId,
      });
    },
  });

  const accepted = dispatcher.dispatch([
    event({ fingerId: "right_index", timestampMs: 101, frameId: 2 }),
    event({ fingerId: "left_middle", timestampMs: 100 }),
    event({ fingerId: "left_index", timestampMs: 100 }),
  ]);

  assert.deepEqual(
    accepted.map(({ fingerId }) => fingerId),
    ["left_index"],
  );
  assert.equal(calls.length, 1);
  assert.equal(activations.length, 1);
  assert.equal(calls[0].voiceId, "en_masculine");
  assert.deepEqual(dropped, [
    { fingerId: "left_middle", activeFingerId: "left_index" },
    { fingerId: "right_index", activeFingerId: "left_index" },
  ]);

  resolvers[0]();
  await Promise.resolve();

  const next = dispatcher.dispatch([
    event({
      fingerId: "right_index",
      timestampMs: 102,
      frameId: 3,
    }),
  ]);
  assert.equal(next.length, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].voiceId, "zh_feminine");
  resolvers[1]();
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

test("speech failure releases the first-wins gate", async () => {
  const failures = [];
  let rejectSpeech;
  const dispatcher = new ActivationDispatcher({
    getConfig: createDefaultConfig,
    voicePort: {
      speak() {
        return new Promise((_resolve, reject) => {
          rejectSpeech = reject;
        });
      },
    },
    onSpeechError: (_activation, error) => failures.push(error.message),
  });

  assert.equal(dispatcher.dispatch([event()]).length, 1);
  rejectSpeech(new Error("engine failed"));
  await Promise.resolve();

  assert.equal(
    dispatcher.dispatch([
      event({ fingerId: "left_middle", frameId: 2, timestampMs: 101 }),
    ]).length,
    1,
  );
  assert.deepEqual(failures, ["engine failed"]);
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
