/**
 * Detector-agnostic thumb-to-fingertip contact tracking for TapTalk.
 *
 * Input landmarks use the MediaPipe hand landmark indices. Handedness must be
 * semantic/anatomical ("left" or "right"), independent of preview mirroring.
 */

export const FINGER_IDS = Object.freeze([
  "left_index",
  "left_middle",
  "left_ring",
  "left_pinky",
  "right_index",
  "right_middle",
  "right_ring",
  "right_pinky",
]);

export const TRACKING_STATES = Object.freeze({
  NOT_VISIBLE: "not_visible",
  SEPARATED: "separated",
  APPROACHING: "approaching",
  CONTACT_CANDIDATE: "contact_candidate",
  ACTIVATED: "activated",
  HELD: "held",
});

export const DEFAULT_TRACKER_OPTIONS = Object.freeze({
  contactThreshold: 0.32,
  separationThreshold: 0.48,
  contactConfirmFrames: 2,
  separationConfirmFrames: 2,
  minConfidence: 0.5,
});

const THUMB_TIP_INDEX = 4;
const WRIST_INDEX = 0;
const MIDDLE_MCP_INDEX = 9;

const FINGER_DEFINITIONS = Object.freeze([
  { fingerId: "left_index", handedness: "left", tipIndex: 8 },
  { fingerId: "left_middle", handedness: "left", tipIndex: 12 },
  { fingerId: "left_ring", handedness: "left", tipIndex: 16 },
  { fingerId: "left_pinky", handedness: "left", tipIndex: 20 },
  { fingerId: "right_index", handedness: "right", tipIndex: 8 },
  { fingerId: "right_middle", handedness: "right", tipIndex: 12 },
  { fingerId: "right_ring", handedness: "right", tipIndex: 16 },
  { fingerId: "right_pinky", handedness: "right", tipIndex: 20 },
]);

const FINGER_ORDER = new Map(FINGER_IDS.map((fingerId, index) => [fingerId, index]));

function assertFiniteNumber(value, name) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function optionalConfidence(value) {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function pointConfidence(point) {
  if (!point) {
    return 0;
  }

  return Math.min(
    optionalConfidence(point.visibility),
    optionalConfidence(point.presence),
  );
}

function isPoint(point) {
  return (
    point !== null &&
    typeof point === "object" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    (point.z === undefined || Number.isFinite(point.z))
  );
}

function copyPoint(point) {
  if (!point) {
    return null;
  }

  const copy = { x: point.x, y: point.y };
  if (point.z !== undefined) {
    copy.z = point.z;
  }
  if (point.visibility !== undefined) {
    copy.visibility = point.visibility;
  }
  if (point.presence !== undefined) {
    copy.presence = point.presence;
  }
  return copy;
}

// Contact is judged in the camera plane. MediaPipe's landmark depth is useful
// for pose estimation, but it is too noisy around occluded touching fingertips
// to decide whether the user deliberately closed a thumb-finger gap.
function planarDistance(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return Math.hypot(dx, dy);
}

function observationConfidence(hand) {
  return Math.min(
    optionalConfidence(hand?.handednessConfidence),
    optionalConfidence(hand?.trackingConfidence),
  );
}

/**
 * Select at most one observation for each semantic hand. Duplicate labels are
 * resolved by confidence and then stable input order.
 */
function selectHands(hands) {
  const selected = new Map();

  hands.forEach((hand, inputIndex) => {
    if (
      !hand ||
      (hand.handedness !== "left" && hand.handedness !== "right") ||
      !Array.isArray(hand.landmarks) ||
      hand.landmarks.length < 21
    ) {
      return;
    }

    const candidate = {
      hand,
      inputIndex,
      confidence: observationConfidence(hand),
    };
    const current = selected.get(hand.handedness);

    if (
      !current ||
      candidate.confidence > current.confidence ||
      (candidate.confidence === current.confidence &&
        candidate.inputIndex < current.inputIndex)
    ) {
      selected.set(hand.handedness, candidate);
    }
  });

  return new Map(
    [...selected.entries()].map(([handedness, candidate]) => [
      handedness,
      candidate.hand,
    ]),
  );
}

function createRuntimeState() {
  return {
    state: TRACKING_STATES.NOT_VISIBLE,
    armed: false,
    contactFrames: 0,
    separationFrames: 0,
  };
}

function invisibleMeasurement() {
  return {
    visible: false,
    confidence: 0,
    fingertip: null,
    thumbTip: null,
    palmScale: null,
    distanceRatio: null,
  };
}

/**
 * @typedef {object} Landmark
 * @property {number} x
 * @property {number} y
 * @property {number} [z]
 * @property {number} [visibility]
 * @property {number} [presence]
 *
 * @typedef {object} HandObservation
 * @property {"left"|"right"} handedness
 * @property {number} [handednessConfidence]
 * @property {number} [trackingConfidence]
 * @property {Landmark[]} landmarks
 *
 * @typedef {object} LandmarkFrame
 * @property {number} timestampMs Monotonic capture/media timestamp.
 * @property {string|number} frameId Stable caller-provided correlation ID.
 * @property {HandObservation[]} hands
 */

export class ContactTracker {
  constructor(options = {}) {
    this.options = { ...DEFAULT_TRACKER_OPTIONS, ...options };
    this.#validateOptions();
    this.reset();
  }

  #validateOptions() {
    const {
      contactThreshold,
      separationThreshold,
      contactConfirmFrames,
      separationConfirmFrames,
      minConfidence,
    } = this.options;

    assertFiniteNumber(contactThreshold, "contactThreshold");
    assertFiniteNumber(separationThreshold, "separationThreshold");
    assertPositiveInteger(contactConfirmFrames, "contactConfirmFrames");
    assertPositiveInteger(separationConfirmFrames, "separationConfirmFrames");
    assertFiniteNumber(minConfidence, "minConfidence");

    if (contactThreshold <= 0) {
      throw new RangeError("contactThreshold must be greater than zero");
    }
    if (separationThreshold <= contactThreshold) {
      throw new RangeError(
        "separationThreshold must be greater than contactThreshold",
      );
    }
    if (minConfidence < 0 || minConfidence > 1) {
      throw new RangeError("minConfidence must be between zero and one");
    }
  }

  reset() {
    this.lastTimestampMs = null;
    this.runtime = new Map(
      FINGER_IDS.map((fingerId) => [fingerId, createRuntimeState()]),
    );
  }

  /**
   * Process one landmark frame.
   *
   * @param {LandmarkFrame} frame
   * @returns {{
   *   frameId: string|number,
   *   timestampMs: number,
   *   fingers: Array<object>,
   *   events: Array<object>
   * }}
   */
  processFrame(frame) {
    this.#validateFrame(frame);
    const selectedHands = selectHands(frame.hands);
    const events = [];
    const fingers = [];

    for (const definition of FINGER_DEFINITIONS) {
      const hand = selectedHands.get(definition.handedness);
      const measurement = this.#measureFinger(hand, definition.tipIndex);
      const runtime = this.runtime.get(definition.fingerId);
      const transition = measurement.visible
        ? this.#advanceVisible(runtime, measurement.distanceRatio)
        : this.#advanceInvisible(runtime);

      if (transition) {
        events.push({
          type: "finger_state",
          fingerId: definition.fingerId,
          timestampMs: frame.timestampMs,
          frameId: frame.frameId,
          state: transition,
          confidence: measurement.confidence,
        });
      }

      fingers.push({
        fingerId: definition.fingerId,
        handedness: definition.handedness,
        state: runtime.state,
        armed: runtime.armed,
        ...measurement,
      });
    }

    events.sort(
      (first, second) =>
        first.timestampMs - second.timestampMs ||
        FINGER_ORDER.get(first.fingerId) - FINGER_ORDER.get(second.fingerId),
    );
    this.lastTimestampMs = frame.timestampMs;

    return {
      frameId: frame.frameId,
      timestampMs: frame.timestampMs,
      fingers,
      events,
    };
  }

  #validateFrame(frame) {
    if (!frame || typeof frame !== "object") {
      throw new TypeError("frame must be an object");
    }
    assertFiniteNumber(frame.timestampMs, "frame.timestampMs");
    if (
      this.lastTimestampMs !== null &&
      frame.timestampMs < this.lastTimestampMs
    ) {
      throw new RangeError("frame.timestampMs must not move backwards");
    }
    if (
      (typeof frame.frameId !== "string" &&
        typeof frame.frameId !== "number") ||
      (typeof frame.frameId === "number" && !Number.isFinite(frame.frameId))
    ) {
      throw new TypeError("frame.frameId must be a string or finite number");
    }
    if (!Array.isArray(frame.hands)) {
      throw new TypeError("frame.hands must be an array");
    }
    if (frame.hands.length > 2) {
      throw new RangeError("frame.hands must contain at most two observations");
    }
  }

  #measureFinger(hand, tipIndex) {
    if (!hand) {
      return invisibleMeasurement();
    }

    const wrist = hand.landmarks[WRIST_INDEX];
    const thumbTip = hand.landmarks[THUMB_TIP_INDEX];
    const middleMcp = hand.landmarks[MIDDLE_MCP_INDEX];
    const fingertip = hand.landmarks[tipIndex];

    if (
      !isPoint(wrist) ||
      !isPoint(thumbTip) ||
      !isPoint(middleMcp) ||
      !isPoint(fingertip)
    ) {
      return invisibleMeasurement();
    }

    const confidence = Math.min(
      observationConfidence(hand),
      pointConfidence(wrist),
      pointConfidence(thumbTip),
      pointConfidence(middleMcp),
      pointConfidence(fingertip),
    );
    const palmScale = planarDistance(wrist, middleMcp);

    if (
      confidence < this.options.minConfidence ||
      !Number.isFinite(palmScale) ||
      palmScale <= Number.EPSILON
    ) {
      return invisibleMeasurement();
    }

    return {
      visible: true,
      confidence,
      fingertip: copyPoint(fingertip),
      thumbTip: copyPoint(thumbTip),
      palmScale,
      distanceRatio: planarDistance(thumbTip, fingertip) / palmScale,
    };
  }

  #advanceInvisible(runtime) {
    const wasVisible = runtime.state !== TRACKING_STATES.NOT_VISIBLE;
    runtime.state = TRACKING_STATES.NOT_VISIBLE;
    runtime.armed = false;
    runtime.contactFrames = 0;
    runtime.separationFrames = 0;
    return wasVisible ? TRACKING_STATES.NOT_VISIBLE : null;
  }

  #advanceVisible(runtime, distanceRatio) {
    if (runtime.state === TRACKING_STATES.NOT_VISIBLE) {
      runtime.contactFrames = 0;
      if (distanceRatio >= this.options.separationThreshold) {
        runtime.separationFrames += 1;
        if (
          runtime.separationFrames >= this.options.separationConfirmFrames
        ) {
          runtime.state = TRACKING_STATES.SEPARATED;
          runtime.armed = true;
          runtime.separationFrames = 0;
          return TRACKING_STATES.SEPARATED;
        }
      } else {
        runtime.separationFrames = 0;
      }
      return null;
    }

    if (!runtime.armed) {
      runtime.contactFrames = 0;
      if (distanceRatio >= this.options.separationThreshold) {
        runtime.separationFrames += 1;
        if (
          runtime.separationFrames >= this.options.separationConfirmFrames
        ) {
          runtime.state = TRACKING_STATES.SEPARATED;
          runtime.armed = true;
          runtime.separationFrames = 0;
          return TRACKING_STATES.SEPARATED;
        }
      } else {
        runtime.separationFrames = 0;
        runtime.state = TRACKING_STATES.HELD;
      }
      return null;
    }

    runtime.separationFrames = 0;

    if (distanceRatio <= this.options.contactThreshold) {
      runtime.contactFrames += 1;
      runtime.state = TRACKING_STATES.CONTACT_CANDIDATE;

      if (runtime.contactFrames >= this.options.contactConfirmFrames) {
        runtime.state = TRACKING_STATES.ACTIVATED;
        runtime.armed = false;
        runtime.contactFrames = 0;
        return TRACKING_STATES.ACTIVATED;
      }
      return null;
    }

    runtime.contactFrames = 0;
    runtime.state =
      distanceRatio >= this.options.separationThreshold
        ? TRACKING_STATES.SEPARATED
        : TRACKING_STATES.APPROACHING;
    return null;
  }
}
