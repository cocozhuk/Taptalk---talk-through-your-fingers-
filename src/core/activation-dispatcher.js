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
    onSpeechBusy,
    onSpeechIdle,
    deduplicationLimit = 2048,
  }) {
    this.getConfig = getConfig;
    this.voicePort = voicePort;
    this.onActivation = onActivation ?? (() => {});
    this.onAudibleStart = onAudibleStart ?? (() => {});
    this.onSpeechError = onSpeechError ?? (() => {});
    this.onSpeechBusy = onSpeechBusy ?? (() => {});
    this.onSpeechIdle = onSpeechIdle ?? (() => {});
    this.deduplicationLimit = deduplicationLimit;
    this.seenActivationIds = new Set();
    this.seenActivationOrder = [];
    this.latestFrameBySession = new Map();
    this.activeActivation = null;
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

      if (this.activeActivation) {
        this.onSpeechBusy(event, this.activeActivation);
        continue;
      }

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
      this.activeActivation = activation;

      let speechErrorReported = false;
      const reportSpeechError = (error) => {
        if (speechErrorReported) {
          return;
        }
        speechErrorReported = true;
        this.onSpeechError(activation, error);
      };

      const request = {
        activationId,
        text: activation.expression,
        language: activation.language,
        voiceId: activation.voiceId,
        confirmedAtMs: activation.confirmedAtMs,
        onAudibleStart: (startedAtMs) =>
          this.onAudibleStart(activation, startedAtMs),
        onError: reportSpeechError,
      };

      try {
        Promise.resolve(this.voicePort.speak(request)).then(
          () => this.finishSpeech(activation, null),
          (error) => {
            reportSpeechError(error);
            this.finishSpeech(activation, error);
          },
        );
      } catch (error) {
        reportSpeechError(error);
        this.finishSpeech(activation, error);
      }
    }

    return accepted;
  }

  finishSpeech(activation, error) {
    if (
      this.activeActivation?.activationId !== activation.activationId
    ) {
      return;
    }
    this.activeActivation = null;
    this.onSpeechIdle(activation, error);
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
