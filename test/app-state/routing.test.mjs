import assert from "node:assert/strict";
import test from "node:test";

import {
  createRouterState,
  dispatchRouteResult,
  routeContactBatch,
} from "../../src/app-state/index.mjs";
import { makeConfiguration } from "./fixtures.mjs";

test("routes first-confirmed-first-served with the documented finger tie-break", () => {
  const initialState = createRouterState();
  const result = routeContactBatch(initialState, makeConfiguration(), {
    frameSequence: 4,
    contacts: [
      {
        eventId: "last",
        fingerId: "right_pinky",
        confirmedAtMs: 20,
      },
      {
        eventId: "third",
        fingerId: "right_index",
        confirmedAtMs: 10,
      },
      {
        eventId: "second",
        fingerId: "left_pinky",
        confirmedAtMs: 10,
      },
      {
        eventId: "first",
        fingerId: "left_index",
        confirmedAtMs: 10,
      },
    ],
  });

  assert.deepEqual(
    result.activations.map((activation) => activation.activationId),
    ["first", "second", "third", "last"],
  );
  assert.deepEqual(
    result.activations.map((activation) => activation.fingerId),
    ["left_index", "left_pinky", "right_index", "right_pinky"],
  );
  assert.deepEqual(result.activations[0], {
    activationId: "first",
    fingerId: "left_index",
    confirmedAtMs: 10,
    text: "Yes",
    language: "en",
    voiceIdentity: "en_feminine",
  });
  assert.equal(result.activations[2].voiceIdentity, "zh_masculine");
  assert.equal(result.state.lastFrameSequence, 4);
  assert.equal(result.state.lastConfirmedAtMs, 20);

  assert.equal(initialState.lastFrameSequence, -1);
  assert.equal(initialState.processedEventIds.size, 0);
});

test("rejects stale batches, stale timestamps, and reused event IDs", () => {
  const configuration = makeConfiguration();
  const first = routeContactBatch(createRouterState(), configuration, {
    frameSequence: 10,
    contacts: [
      {
        eventId: "accepted",
        fingerId: "left_index",
        confirmedAtMs: 100,
      },
    ],
  });

  const staleBatch = routeContactBatch(first.state, configuration, {
    frameSequence: 10,
    contacts: [],
  });
  assert.equal(staleBatch.rejections[0].reason, "stale_batch");
  assert.equal(staleBatch.state, first.state);

  const rejected = routeContactBatch(first.state, configuration, {
    frameSequence: 11,
    contacts: [
      {
        eventId: "accepted",
        fingerId: "left_middle",
        confirmedAtMs: 102,
      },
      {
        eventId: "old",
        fingerId: "left_ring",
        confirmedAtMs: 99,
      },
      {
        eventId: "equal",
        fingerId: "right_index",
        confirmedAtMs: 100,
      },
    ],
  });

  assert.deepEqual(rejected.activations, []);
  assert.deepEqual(
    rejected.rejections.map((entry) => entry.reason).sort(),
    ["duplicate_event", "stale_event", "stale_event"],
  );
  assert.equal(rejected.state.lastFrameSequence, 11);
  assert.equal(rejected.state.lastConfirmedAtMs, 100);
});

test("consumes a new batch while rejecting malformed and duplicate-finger contacts", () => {
  const result = routeContactBatch(
    createRouterState(),
    makeConfiguration(),
    {
      frameSequence: 0,
      contacts: [
        {
          eventId: "later",
          fingerId: "left_middle",
          confirmedAtMs: 2,
        },
        {
          eventId: "earlier",
          fingerId: "left_middle",
          confirmedAtMs: 1,
        },
        {
          eventId: "",
          fingerId: "left_index",
          confirmedAtMs: 1,
        },
        {
          eventId: "bad-finger",
          fingerId: "left_thumb",
          confirmedAtMs: 1,
        },
      ],
    },
  );

  assert.deepEqual(
    result.activations.map((activation) => activation.activationId),
    ["earlier"],
  );
  assert.deepEqual(
    result.rejections.map((entry) => entry.reason).sort(),
    ["duplicate_finger", "malformed_contact", "malformed_contact"],
  );
  assert.equal(result.state.lastFrameSequence, 0);

  const replay = routeContactBatch(result.state, makeConfiguration(), {
    frameSequence: 1,
    contacts: [
      {
        eventId: "later",
        fingerId: "left_middle",
        confirmedAtMs: 3,
      },
    ],
  });
  assert.equal(replay.rejections[0].reason, "duplicate_event");
  assert.deepEqual(replay.activations, []);
});

test("does not consume a malformed batch", () => {
  const initialState = createRouterState();
  const result = routeContactBatch(initialState, makeConfiguration(), {
    frameSequence: -1,
    contacts: [],
  });

  assert.equal(result.rejections[0].reason, "malformed_batch");
  assert.equal(result.state, initialState);
});

test("dispatches all visual feedback before starting speech without serialization", async () => {
  const routed = routeContactBatch(createRouterState(), makeConfiguration(), {
    frameSequence: 0,
    contacts: [
      {
        eventId: "one",
        fingerId: "left_index",
        confirmedAtMs: 1,
      },
      {
        eventId: "two",
        fingerId: "right_index",
        confirmedAtMs: 2,
      },
    ],
  });

  const timeline = [];
  const resolvers = [];
  const dispatched = dispatchRouteResult(routed, {
    onActivation(notification) {
      timeline.push(`ui:${notification.activationId}`);
    },
    speak(request) {
      timeline.push(`speech:${request.requestId}`);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
  });

  assert.deepEqual(timeline, [
    "ui:one",
    "ui:two",
    "speech:one",
    "speech:two",
  ]);
  assert.equal(resolvers.length, 2);

  resolvers[1]("second completed first");
  resolvers[0]("first completed second");
  assert.deepEqual(
    (await dispatched.speechSettled).map((result) => result.status),
    ["fulfilled", "fulfilled"],
  );
});

test("one speech sink failure does not prevent later requests from starting", async () => {
  const routed = routeContactBatch(createRouterState(), makeConfiguration(), {
    frameSequence: 0,
    contacts: [
      {
        eventId: "one",
        fingerId: "left_index",
        confirmedAtMs: 1,
      },
      {
        eventId: "two",
        fingerId: "left_middle",
        confirmedAtMs: 2,
      },
    ],
  });

  const started = [];
  const dispatched = dispatchRouteResult(routed, {
    onActivation() {},
    speak(request) {
      started.push(request.requestId);
      if (request.requestId === "one") {
        throw new Error("engine unavailable");
      }
      return "started";
    },
  });

  assert.deepEqual(started, ["one", "two"]);
  assert.deepEqual(
    (await dispatched.speechSettled).map((result) => result.status),
    ["rejected", "fulfilled"],
  );
});
