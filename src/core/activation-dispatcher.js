import {
  FINGER_IDS,
  activationIdFor,
  isFingerId,
  voiceIdFor,
} from "../domain/contracts.js";

const FINGER_RANK = new Map(
  FINGER_IDS.map((fingerId, index) => [fingerId, index]),
);

export function compareActivationEvents(first, second) {
  return (
    first.timestampMs - second.timestampMs ||
    FINGER_RANK.get(first.fingerId) - FINGER_RANK.get(second.fingerId)
  );
}

function isActivationEvent(event) {
  return (
    event?.type === "activation" &&
    isFingerId(event.fingerId) &&
    typeof event.sessionId === "string" &&
    event.sessionId.length > 0 &&
    Number.isFinite(event.timestampMs) &&
    Number.isSafeInteger(event.frameId) &&
    event.frameId >= 0
  );
}

export class ActivationDispatcher {
  constructor({
    getConfig,
    voicePort,
    onActivation,
    onAudibleStart,
    onSpeechError,
    deduplicationLimit = 2048,
  }) {
    this.getConfig = getConfig;
    this.voicePort = voicePort;
    this.onActivation = onActivation ?? (() => {});
    this.onAudibleStart = onAudibleStart ?? (() => {});
    this.onSpeechError = onSpeechError ?? (() => {});
    this.deduplicationLimit = deduplicationLimit;
    this.seenActivationIds = new Set();
    this.seenActivationOrder = [];
    this.latestFrameBySession = new Map();
  }

  dispatch(events) {
    const accepted = [];
    const orderedEvents = events
      .filter(isActivationEvent)
      .sort(compareActivationEvents);

    for (const event of orderedEvents) {
      const latestFrame = this.latestFrameBySession.get(event.sessionId) ?? -1;
      if (event.frameId < latestFrame) {
        continue;
      }

      const activationId = activationIdFor(event);
      if (this.seenActivationIds.has(activationId)) {
        continue;
      }

      this.latestFrameBySession.set(
        event.sessionId,
        Math.max(latestFrame, event.frameId),
      );
      this.remember(activationId);

      const config = this.getConfig();
      const assignment = config.assignments[event.fingerId];
      const voiceId = voiceIdFor(
        assignment.language,
        config.voicePreferences[assignment.language],
      );
      const activation = {
        activationId,
        fingerId: event.fingerId,
        confirmedAtMs: event.timestampMs,
        expression: assignment.text,
        language: assignment.language,
        voiceId,
      };

      this.onActivation(activation);
      accepted.push(activation);

      const request = {
        activationId,
        text: activation.expression,
        language: activation.language,
        voiceId: activation.voiceId,
        confirmedAtMs: activation.confirmedAtMs,
        onAudibleStart: (startedAtMs) =>
          this.onAudibleStart(activation, startedAtMs),
        onError: (error) => this.onSpeechError(activation, error),
      };

      try {
        Promise.resolve(this.voicePort.speak(request)).catch((error) => {
          request.onError(error);
        });
      } catch (error) {
        request.onError(error);
      }
    }

    return accepted;
  }

  remember(activationId) {
    this.seenActivationIds.add(activationId);
    this.seenActivationOrder.push(activationId);
    if (this.seenActivationOrder.length > this.deduplicationLimit) {
      const expiredId = this.seenActivationOrder.shift();
      this.seenActivationIds.delete(expiredId);
    }
  }
}

