import {
  FINGER_IDS,
  activationIdFor,
  fixedVoiceIdFor,
  isFingerId,
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
    onSpeechInterrupted,
    deduplicationLimit = 2048,
  }) {
    this.getConfig = getConfig;
    this.voicePort = voicePort;
    this.onActivation = onActivation ?? (() => {});
    this.onAudibleStart = onAudibleStart ?? (() => {});
    this.onSpeechError = onSpeechError ?? (() => {});
    this.onSpeechInterrupted = onSpeechInterrupted ?? (() => {});
    this.deduplicationLimit = deduplicationLimit;
    this.seenActivationIds = new Set();
    this.seenActivationOrder = [];
    this.latestFrameBySession = new Map();
    this.activeSpeech = null;
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
      const voiceId = fixedVoiceIdFor(assignment.language);
      const activation = {
        activationId,
        fingerId: event.fingerId,
        confirmedAtMs: event.timestampMs,
        expression: assignment.text,
        language: assignment.language,
        voiceId,
      };

      const previousSpeech = this.activeSpeech;
      if (previousSpeech) {
        previousSpeech.interrupted = true;
        try {
          this.voicePort.interrupt?.({
            fingerId: previousSpeech.activation.fingerId,
            activationId: previousSpeech.activation.activationId,
            replacedByActivationId: activation.activationId,
            replacementFingerId: activation.fingerId,
          });
        } catch (error) {
          this.onSpeechError(previousSpeech.activation, error);
        }
      }

      this.onActivation(activation);
      if (previousSpeech) {
        this.onSpeechInterrupted(previousSpeech.activation, activation);
      }
      accepted.push(activation);

      const activeSpeech = {
        activation,
        interrupted: false,
        speechErrorReported: false,
      };
      this.activeSpeech = activeSpeech;

      const reportSpeechError = (error) => {
        if (activeSpeech.interrupted || activeSpeech.speechErrorReported) {
          return;
        }
        activeSpeech.speechErrorReported = true;
        this.onSpeechError(activation, error);
      };

      const request = {
        activationId,
        fingerId: activation.fingerId,
        text: activation.expression,
        language: activation.language,
        voiceId: activation.voiceId,
        confirmedAtMs: activation.confirmedAtMs,
        onAudibleStart: (startedAtMs) => {
          if (
            !activeSpeech.interrupted &&
            this.activeSpeech === activeSpeech
          ) {
            this.onAudibleStart(activation, startedAtMs);
          }
        },
        onError: reportSpeechError,
      };

      try {
        Promise.resolve(this.voicePort.speak(request)).then(
          () => this.finishSpeech(activeSpeech),
          (error) => {
            reportSpeechError(error);
            this.finishSpeech(activeSpeech);
          },
        );
      } catch (error) {
        reportSpeechError(error);
        this.finishSpeech(activeSpeech);
      }
    }

    return accepted;
  }

  finishSpeech(activeSpeech) {
    if (this.activeSpeech === activeSpeech) {
      this.activeSpeech = null;
    }
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
