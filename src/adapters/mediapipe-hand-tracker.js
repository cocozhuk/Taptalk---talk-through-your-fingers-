import {
  ContactTracker,
  TRACKING_STATES,
} from "../hand-tracking/contact-tracker.mjs";

const DEFAULT_MODULE_URL = "/vendor/mediapipe/vision_bundle.mjs";
const DEFAULT_WASM_ROOT = "/vendor/mediapipe/wasm";
const DEFAULT_MODEL_URL = "/assets/models/hand_landmarker.task";

export class MediaPipeHandTracker {
  constructor({
    onEvents,
    onSnapshots,
    onError,
    contactTracker = new ContactTracker(),
    createLandmarker = createDefaultLandmarker,
    clock = () => performance.now(),
    requestFrame = (callback) => requestAnimationFrame(callback),
    cancelFrame = (requestId) => cancelAnimationFrame(requestId),
    sessionId = `vision-${Date.now()}`,
  }) {
    this.onEvents = onEvents ?? (() => {});
    this.onSnapshots = onSnapshots ?? (() => {});
    this.onError = onError ?? (() => {});
    this.contactTracker = contactTracker;
    this.createLandmarker = createLandmarker;
    this.clock = clock;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.sessionId = sessionId;
    this.frameLoop = () => this.processNextFrame();
    this.frameId = 0;
    this.lastTimestampMs = -1;
    this.lastVideoTime = -1;
    this.landmarker = null;
    this.videoElement = null;
    this.running = false;
    this.animationRequest = null;
  }

  async start(videoElement) {
    if (!videoElement) {
      throw new TypeError("A video element is required for hand tracking.");
    }
    this.stop();
    this.landmarker ??= await this.createLandmarker();
    this.contactTracker.reset();
    this.frameId = 0;
    this.lastTimestampMs = -1;
    this.lastVideoTime = -1;
    this.videoElement = videoElement;
    this.running = true;
    this.animationRequest = this.requestFrame(this.frameLoop);
  }

  stop() {
    this.running = false;
    if (this.animationRequest !== null) {
      this.cancelFrame(this.animationRequest);
      this.animationRequest = null;
    }
    this.videoElement = null;
    this.contactTracker.reset();
    this.onSnapshots([]);
  }

  destroy() {
    this.stop();
    this.landmarker?.close?.();
    this.landmarker = null;
  }

  processNextFrame() {
    if (!this.running || !this.videoElement) {
      return;
    }

    try {
      if (
        this.videoElement.readyState >= 2 &&
        this.videoElement.currentTime !== this.lastVideoTime
      ) {
        const timestampMs = Math.max(
          Math.round(this.clock()),
          this.lastTimestampMs + 1,
        );
        const result = this.landmarker.detectForVideo(
          this.videoElement,
          timestampMs,
        );
        this.frameId += 1;
        const tracked = this.contactTracker.processFrame({
          timestampMs,
          frameId: this.frameId,
          hands: mapMediaPipeResult(result),
        });
        this.onSnapshots(tracked.fingers);
        const events = translateContactEvents(
          tracked.events,
          this.sessionId,
        );
        if (events.length > 0) {
          this.onEvents(events);
        }
        this.lastTimestampMs = timestampMs;
        this.lastVideoTime = this.videoElement.currentTime;
      }
    } catch (error) {
      this.running = false;
      this.animationRequest = null;
      this.onError(
        error instanceof Error ? error : new Error(String(error)),
      );
      return;
    }

    this.animationRequest = this.requestFrame(this.frameLoop);
  }
}

export function mapMediaPipeResult(result) {
  const landmarks = Array.isArray(result?.landmarks)
    ? result.landmarks
    : [];
  const handedness = Array.isArray(result?.handedness)
    ? result.handedness
    : Array.isArray(result?.handednesses)
      ? result.handednesses
      : [];

  return landmarks.flatMap((points, index) => {
    const category = handedness[index]?.[0];
    const semanticHand = category?.categoryName?.toLowerCase();
    if (semanticHand !== "left" && semanticHand !== "right") {
      return [];
    }
    const confidence = Number.isFinite(category?.score)
      ? category.score
      : 1;
    return [
      {
        handedness: semanticHand,
        handednessConfidence: confidence,
        trackingConfidence: confidence,
        landmarks: points,
      },
    ];
  });
}

export function translateContactEvents(events, sessionId) {
  return events.flatMap((event) => {
    if (event.state === TRACKING_STATES.ACTIVATED) {
      return [
        {
          type: "activation",
          fingerId: event.fingerId,
          sessionId,
          timestampMs: event.timestampMs,
          frameId: event.frameId,
          confidence: event.confidence,
        },
      ];
    }
    if (event.state === TRACKING_STATES.SEPARATED) {
      return [
        {
          type: "separation",
          fingerId: event.fingerId,
          sessionId,
          timestampMs: event.timestampMs,
          frameId: event.frameId,
          confidence: event.confidence,
        },
      ];
    }
    return [];
  });
}

async function createDefaultLandmarker() {
  const { FilesetResolver, HandLandmarker } = await import(
    DEFAULT_MODULE_URL
  );
  const vision = await FilesetResolver.forVisionTasks(DEFAULT_WASM_ROOT);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: DEFAULT_MODEL_URL,
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  });
}
