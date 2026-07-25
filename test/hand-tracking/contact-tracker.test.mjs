import assert from "node:assert/strict";
import test from "node:test";

import {
  ContactTracker,
  FINGER_IDS,
  TRACKING_STATES,
} from "../../src/hand-tracking/index.mjs";

const TIP_INDEX = {
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

function point(x, y, z = 0, confidence = 1) {
  return { x, y, z, visibility: confidence, presence: confidence };
}

function hand(
  handedness,
  {
    ratios = {},
    scale = 1,
    handednessConfidence = 1,
    trackingConfidence = 1,
    pointConfidence = 1,
  } = {},
) {
  const landmarks = Array.from({ length: 21 }, () =>
    point(0, 0, 0, pointConfidence),
  );
  const thumbX = scale;
  const thumbY = scale;

  landmarks[0] = point(0, 0, 0, pointConfidence);
  landmarks[4] = point(thumbX, thumbY, 0, pointConfidence);
  landmarks[9] = point(0, scale, 0, pointConfidence);

  for (const [fingerName, tipIndex] of Object.entries(TIP_INDEX)) {
    const ratio = ratios[fingerName] ?? 0.8;
    landmarks[tipIndex] = point(
      thumbX + ratio * scale,
      thumbY,
      0,
      pointConfidence,
    );
  }

  return {
    handedness,
    handednessConfidence,
    trackingConfidence,
    landmarks,
  };
}

function frame(timestampMs, hands, frameId = timestampMs) {
  return { timestampMs, frameId, hands };
}

function eventsFor(result, fingerId, state) {
  return result.events.filter(
    (event) => event.fingerId === fingerId && event.state === state,
  );
}

function snapshotFor(result, fingerId) {
  return result.fingers.find((finger) => finger.fingerId === fingerId);
}

test("one sustained contact activates once and separation rearms it", () => {
  const tracker = new ContactTracker();

  tracker.processFrame(frame(0, [hand("left")]));
  const ready = tracker.processFrame(frame(16, [hand("left")]));
  assert.equal(
    eventsFor(ready, "left_index", TRACKING_STATES.SEPARATED).length,
    1,
  );

  const candidate = tracker.processFrame(
    frame(32, [hand("left", { ratios: { index: 0.2 } })]),
  );
  assert.equal(
    snapshotFor(candidate, "left_index").state,
    TRACKING_STATES.CONTACT_CANDIDATE,
  );
  assert.equal(
    eventsFor(candidate, "left_index", TRACKING_STATES.ACTIVATED).length,
    0,
  );

  const activated = tracker.processFrame(
    frame(48, [hand("left", { ratios: { index: 0.2 } })]),
  );
  assert.equal(
    eventsFor(activated, "left_index", TRACKING_STATES.ACTIVATED).length,
    1,
  );

  for (const timestampMs of [64, 80, 96]) {
    const held = tracker.processFrame(
      frame(timestampMs, [hand("left", { ratios: { index: 0.2 } })]),
    );
    assert.equal(
      eventsFor(held, "left_index", TRACKING_STATES.ACTIVATED).length,
      0,
    );
    assert.equal(
      snapshotFor(held, "left_index").state,
      TRACKING_STATES.HELD,
    );
  }

  const separationCandidate = tracker.processFrame(frame(112, [hand("left")]));
  assert.equal(
    snapshotFor(separationCandidate, "left_index").state,
    TRACKING_STATES.HELD,
  );
  const separated = tracker.processFrame(frame(128, [hand("left")]));
  assert.equal(
    eventsFor(separated, "left_index", TRACKING_STATES.SEPARATED).length,
    1,
  );
  assert.equal(snapshotFor(separated, "left_index").armed, true);

  tracker.processFrame(
    frame(144, [hand("left", { ratios: { index: 0.2 } })]),
  );
  const reactivated = tracker.processFrame(
    frame(160, [hand("left", { ratios: { index: 0.2 } })]),
  );
  assert.equal(
    eventsFor(reactivated, "left_index", TRACKING_STATES.ACTIVATED).length,
    1,
  );
});

test("hysteresis rejects one-frame jitter and keeps held contact latched", () => {
  const tracker = new ContactTracker();
  tracker.processFrame(frame(0, [hand("left")]));
  tracker.processFrame(frame(1, [hand("left")]));

  tracker.processFrame(
    frame(2, [hand("left", { ratios: { index: 0.30 } })]),
  );
  const jitterAway = tracker.processFrame(
    frame(3, [hand("left", { ratios: { index: 0.40 } })]),
  );
  assert.equal(
    eventsFor(jitterAway, "left_index", TRACKING_STATES.ACTIVATED).length,
    0,
  );
  assert.equal(
    snapshotFor(jitterAway, "left_index").state,
    TRACKING_STATES.APPROACHING,
  );

  tracker.processFrame(
    frame(4, [hand("left", { ratios: { index: 0.30 } })]),
  );
  const activated = tracker.processFrame(
    frame(5, [hand("left", { ratios: { index: 0.30 } })]),
  );
  assert.equal(
    eventsFor(activated, "left_index", TRACKING_STATES.ACTIVATED).length,
    1,
  );

  for (const [timestampMs, ratio] of [
    [6, 0.45],
    [7, 0.5],
    [8, 0.45],
    [9, 0.5],
  ]) {
    const result = tracker.processFrame(
      frame(timestampMs, [hand("left", { ratios: { index: ratio } })]),
    );
    assert.equal(
      eventsFor(result, "left_index", TRACKING_STATES.SEPARATED).length,
      0,
    );
    assert.equal(snapshotFor(result, "left_index").armed, false);
  }
});

test("hand loss and touching reacquisition cannot synthesize activation", () => {
  const tracker = new ContactTracker();
  tracker.processFrame(frame(0, [hand("left")]));
  tracker.processFrame(frame(1, [hand("left")]));
  tracker.processFrame(
    frame(2, [hand("left", { ratios: { index: 0.2 } })]),
  );
  tracker.processFrame(
    frame(3, [hand("left", { ratios: { index: 0.2 } })]),
  );

  const lost = tracker.processFrame(frame(4, []));
  assert.equal(
    eventsFor(lost, "left_index", TRACKING_STATES.NOT_VISIBLE).length,
    1,
  );
  assert.equal(snapshotFor(lost, "left_index").visible, false);

  for (const timestampMs of [5, 6, 7]) {
    const touching = tracker.processFrame(
      frame(timestampMs, [hand("left", { ratios: { index: 0.2 } })]),
    );
    assert.equal(
      eventsFor(touching, "left_index", TRACKING_STATES.ACTIVATED).length,
      0,
    );
    assert.equal(snapshotFor(touching, "left_index").armed, false);
  }

  tracker.processFrame(frame(8, [hand("left")]));
  const rearmed = tracker.processFrame(frame(9, [hand("left")]));
  assert.equal(
    eventsFor(rearmed, "left_index", TRACKING_STATES.SEPARATED).length,
    1,
  );

  tracker.processFrame(
    frame(10, [hand("left", { ratios: { index: 0.2 } })]),
  );
  const activated = tracker.processFrame(
    frame(11, [hand("left", { ratios: { index: 0.2 } })]),
  );
  assert.equal(
    eventsFor(activated, "left_index", TRACKING_STATES.ACTIVATED).length,
    1,
  );
});

test("same-frame activations use the documented stable finger order", () => {
  const tracker = new ContactTracker();
  const separatedHands = [hand("right"), hand("left")];
  tracker.processFrame(frame(0, separatedHands));
  tracker.processFrame(frame(1, separatedHands));

  const allContact = [
    hand("right", {
      ratios: { index: 0.2, middle: 0.2, ring: 0.2, pinky: 0.2 },
    }),
    hand("left", {
      ratios: { index: 0.2, middle: 0.2, ring: 0.2, pinky: 0.2 },
    }),
  ];
  tracker.processFrame(frame(2, allContact));
  const activated = tracker.processFrame(frame(3, allContact, "both-touch"));

  assert.deepEqual(
    activated.events
      .filter((event) => event.state === TRACKING_STATES.ACTIVATED)
      .map((event) => event.fingerId),
    FINGER_IDS,
  );
  assert.ok(
    activated.events.every(
      (event) =>
        event.timestampMs === 3 &&
        event.frameId === "both-touch" &&
        event.confidence === 1,
    ),
  );
});

test("distance normalization gives equal behavior at different hand scales", () => {
  const small = new ContactTracker();
  const large = new ContactTracker();
  let smallResult;
  let largeResult;

  for (const [timestampMs, ratio] of [
    [0, 0.8],
    [1, 0.8],
    [2, 0.2],
    [3, 0.2],
  ]) {
    smallResult = small.processFrame(
      frame(timestampMs, [
        hand("left", { scale: 0.5, ratios: { index: ratio } }),
      ]),
    );
    largeResult = large.processFrame(
      frame(timestampMs, [
        hand("left", { scale: 2, ratios: { index: ratio } }),
      ]),
    );
  }

  const smallFinger = snapshotFor(smallResult, "left_index");
  const largeFinger = snapshotFor(largeResult, "left_index");
  assert.equal(smallFinger.state, TRACKING_STATES.ACTIVATED);
  assert.equal(largeFinger.state, TRACKING_STATES.ACTIVATED);
  assert.ok(
    Math.abs(smallFinger.distanceRatio - largeFinger.distanceRatio) < 1e-9,
  );
});

test("noisy landmark depth cannot hide a visible fingertip contact", () => {
  const tracker = new ContactTracker();
  tracker.processFrame(frame(0, [hand("left")]));
  tracker.processFrame(frame(1, [hand("left")]));

  const touching = hand("left", { ratios: { index: 0.2 } });
  touching.landmarks[4].z = -0.5;
  touching.landmarks[TIP_INDEX.index].z = 0.5;

  tracker.processFrame(frame(2, [touching]));
  const activated = tracker.processFrame(frame(3, [touching]));

  assert.equal(
    eventsFor(activated, "left_index", TRACKING_STATES.ACTIVATED).length,
    1,
  );
  assert.ok(
    Math.abs(
      snapshotFor(activated, "left_index").distanceRatio - 0.2,
    ) < 1e-9,
  );
});

test("low confidence behaves as hand loss and clears contact progress", () => {
  const tracker = new ContactTracker({ minConfidence: 0.75 });
  tracker.processFrame(frame(0, [hand("left")]));
  tracker.processFrame(frame(1, [hand("left")]));
  tracker.processFrame(
    frame(2, [hand("left", { ratios: { index: 0.2 } })]),
  );

  const uncertain = tracker.processFrame(
    frame(3, [
      hand("left", {
        ratios: { index: 0.2 },
        trackingConfidence: 0.5,
      }),
    ]),
  );
  assert.equal(snapshotFor(uncertain, "left_index").visible, false);
  assert.equal(
    eventsFor(uncertain, "left_index", TRACKING_STATES.NOT_VISIBLE).length,
    1,
  );

  const touchingAgain = tracker.processFrame(
    frame(4, [hand("left", { ratios: { index: 0.2 } })]),
  );
  assert.equal(
    eventsFor(touchingAgain, "left_index", TRACKING_STATES.ACTIVATED).length,
    0,
  );
  assert.equal(snapshotFor(touchingAgain, "left_index").armed, false);
});

test("duplicate handedness labels resolve by confidence and expose label landmarks", () => {
  const tracker = new ContactTracker({ separationConfirmFrames: 1 });
  const lowConfidenceContact = hand("left", {
    ratios: { index: 0.2 },
    handednessConfidence: 0.6,
  });
  const highConfidenceSeparated = hand("left", {
    ratios: { index: 0.9 },
    handednessConfidence: 0.95,
  });

  const result = tracker.processFrame(
    frame(10, [lowConfidenceContact, highConfidenceSeparated]),
  );
  const index = snapshotFor(result, "left_index");

  assert.equal(index.state, TRACKING_STATES.SEPARATED);
  assert.equal(index.confidence, 0.95);
  assert.deepEqual(index.thumbTip, highConfidenceSeparated.landmarks[4]);
  assert.deepEqual(index.fingertip, highConfidenceSeparated.landmarks[8]);
  assert.ok(Math.abs(index.distanceRatio - 0.9) < 1e-9);
});

test("timestamp regression is rejected while equal timestamps are allowed", () => {
  const tracker = new ContactTracker();
  tracker.processFrame(frame(100, []));
  assert.doesNotThrow(() => tracker.processFrame(frame(100, [])));
  assert.throws(
    () => tracker.processFrame(frame(99, [])),
    /must not move backwards/,
  );
});
