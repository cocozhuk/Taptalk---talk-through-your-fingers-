import test from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_CONTACT_OPTIONS,
  mapMediaPipeResult,
  normalizeMediaPipeHandedness,
  translateContactEvents,
} from "../src/adapters/mediapipe-hand-tracker.js";

function landmarks() {
  return Array.from({ length: 21 }, (_, index) => ({
    x: index / 100,
    y: index / 120,
    z: 0,
  }));
}

test("live contacts accept a short deliberate tap with hysteresis", () => {
  assert.equal(LIVE_CONTACT_OPTIONS.contactConfirmFrames, 1);
  assert.equal(LIVE_CONTACT_OPTIONS.separationConfirmFrames, 1);
  assert.ok(
    LIVE_CONTACT_OPTIONS.separationThreshold >
      LIVE_CONTACT_OPTIONS.contactThreshold,
  );
});

test("maps MediaPipe landmarks to semantic hand observations", () => {
  const left = landmarks();
  const right = landmarks();
  const mapped = mapMediaPipeResult({
    landmarks: [left, right],
    handedness: [
      [{ categoryName: "Left", score: 0.91 }],
      [{ categoryName: "Right", score: 0.87 }],
    ],
  });

  assert.deepEqual(
    mapped.map(({ handedness, handednessConfidence }) => ({
      handedness,
      handednessConfidence,
    })),
    [
      { handedness: "left", handednessConfidence: 0.91 },
      { handedness: "right", handednessConfidence: 0.87 },
    ],
  );
  assert.equal(mapped[0].landmarks, left);
  assert.equal(mapped[1].landmarks, right);
});

test("ignores observations without a supported handedness label", () => {
  assert.deepEqual(
    mapMediaPipeResult({
      landmarks: [landmarks()],
      handedness: [[{ categoryName: "Unknown", score: 1 }]],
    }),
    [],
  );
});

test("accepts display-name and category-index handedness variants", () => {
  assert.equal(
    normalizeMediaPipeHandedness({ displayName: "Right Hand" }),
    "right",
  );
  assert.equal(normalizeMediaPipeHandedness({ index: 0 }), "left");
  assert.equal(normalizeMediaPipeHandedness({ index: 1 }), "right");
  assert.equal(normalizeMediaPipeHandedness({ index: 2 }), null);
});

test("maps the deprecated handednesses result field", () => {
  const mapped = mapMediaPipeResult({
    landmarks: [landmarks()],
    handednesses: [[{ displayName: "Left hand", score: 0.72 }]],
  });

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].handedness, "left");
  assert.equal(mapped[0].handednessConfidence, 0.72);
});

test("translates only activation and separation transitions", () => {
  const base = {
    fingerId: "left_index",
    timestampMs: 42,
    frameId: 7,
    confidence: 0.9,
  };
  const translated = translateContactEvents(
    [
      { ...base, state: "activated" },
      { ...base, fingerId: "left_middle", state: "separated" },
      { ...base, fingerId: "left_ring", state: "approaching" },
    ],
    "vision-session",
  );

  assert.deepEqual(
    translated.map(({ type, fingerId, sessionId }) => ({
      type,
      fingerId,
      sessionId,
    })),
    [
      {
        type: "activation",
        fingerId: "left_index",
        sessionId: "vision-session",
      },
      {
        type: "separation",
        fingerId: "left_middle",
        sessionId: "vision-session",
      },
    ],
  );
});
