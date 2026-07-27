import { VOICE_IDENTITIES } from "../domain/contracts.js";

const PROFILES = Object.freeze({
  en_shelley: Object.freeze({
    languageTag: "en-US",
    pitch: 1,
    rate: 1,
    preferredVoiceNames: Object.freeze(["Shelley"]),
  }),
  zh_tingting: Object.freeze({
    languageTag: "zh-CN",
    pitch: 1,
    rate: 1,
    preferredVoiceNames: Object.freeze(["Tingting"]),
  }),
});

function normalizedLanguageTag(languageTag) {
  return languageTag.toLowerCase().replaceAll("_", "-");
}

function voiceScore(voice, languageTag, preferredVoiceNames) {
  const wantedLanguage = normalizedLanguageTag(languageTag);
  const voiceLanguage = normalizedLanguageTag(voice.lang ?? "");
  const normalizedVoiceName = voice.name?.trim().toLowerCase() ?? "";
  const wantedNameIndex = preferredVoiceNames.findIndex(
    (name) => normalizedVoiceName.includes(name.toLowerCase()),
  );
  return (
    (wantedNameIndex >= 0
      ? (preferredVoiceNames.length - wantedNameIndex) * 2000
      : 0) +
    (voice.localService === true ? 1000 : 0) +
    (voiceLanguage === wantedLanguage ? 200 : 0) +
    (voice.default === true ? 1 : 0)
  );
}

export class WebSpeechVoicePort {
  constructor({
    speechSynthesis = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    clock = () => performance.now(),
    restartDelayMs = 32,
    schedule = (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
    cancelSchedule = (timerId) => globalThis.clearTimeout(timerId),
  } = {}) {
    if (!Number.isFinite(restartDelayMs) || restartDelayMs < 0) {
      throw new RangeError("restartDelayMs must be a non-negative number");
    }
    this.speechSynthesis = speechSynthesis;
    this.Utterance = Utterance;
    this.clock = clock;
    this.restartDelayMs = restartDelayMs;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.pendingByActivationId = new Map();
    this.restartRequired = false;
  }

  speak(request) {
    if (!Object.hasOwn(VOICE_IDENTITIES, request.voiceId)) {
      throw new TypeError(`Unknown TapTalk voice: ${request.voiceId}`);
    }
    if (!this.speechSynthesis || !this.Utterance) {
      throw new Error("Speech synthesis is unavailable in this browser.");
    }

    const profile = PROFILES[request.voiceId];
    const utterance = new this.Utterance(request.text);
    utterance.lang = profile.languageTag;
    utterance.pitch = profile.pitch;
    utterance.rate = profile.rate;
    utterance.volume = 1;
    utterance.voice = this.pickInternalVoice(
      profile.languageTag,
      profile.preferredVoiceNames,
    );

    return new Promise((resolve, reject) => {
      let settled = false;
      let interruptionRequested = false;
      let timerId = null;
      const settle = (status, error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timerId !== null) {
          this.cancelSchedule(timerId);
          timerId = null;
        }
        this.pendingByActivationId.delete(request.activationId);
        if (error) {
          reject(error);
        } else {
          resolve({ status });
        }
      };
      const pending = {
        activationId: request.activationId,
        fingerId: request.fingerId,
        requestInterruption() {
          interruptionRequested = true;
        },
        settleInterrupted() {
          settle("interrupted");
        },
      };
      this.pendingByActivationId.set(request.activationId, pending);

      utterance.addEventListener("start", () => {
        if (!interruptionRequested) {
          request.onAudibleStart?.(this.clock());
        }
      });
      utterance.addEventListener("end", () => settle("ended"), { once: true });
      utterance.addEventListener(
        "error",
        (event) => {
          if (interruptionRequested) {
            settle("interrupted");
            return;
          }
          const error = new Error(
            `Speech synthesis failed: ${event.error ?? "unknown error"}`,
          );
          request.onError?.(error);
          settle("failed", error);
        },
        { once: true },
      );

      const start = () => {
        timerId = null;
        if (interruptionRequested || settled) {
          return;
        }
        try {
          this.speechSynthesis.resume?.();
          this.speechSynthesis.speak(utterance);
        } catch (error) {
          request.onError?.(error);
          settle("failed", error);
        }
      };

      // Several browser speech engines apply cancel() asynchronously. Starting
      // the replacement in the same task can leave it queued behind the old
      // phrase or silently discard it. Give cancellation one short flush
      // window; a still-faster tap cancels this timer and schedules only the
      // newest utterance.
      if (this.restartRequired) {
        this.restartRequired = false;
        timerId = this.schedule(start, this.restartDelayMs);
      } else {
        start();
      }
    });
  }

  interrupt({ activationId }) {
    const target = this.pendingByActivationId.get(activationId);
    if (!target) {
      return false;
    }

    // TapTalk uses one global newest-wins speech lane. Mark and settle every
    // pending request so browser cancellation cannot leave stale promises.
    const pending = [...this.pendingByActivationId.values()];
    for (const entry of pending) {
      entry.requestInterruption();
    }
    this.speechSynthesis.cancel();
    this.restartRequired = true;
    for (const entry of pending) {
      entry.settleInterrupted();
    }
    return true;
  }

  pickInternalVoice(languageTag, preferredVoiceNames = []) {
    const prefix = normalizedLanguageTag(languageTag).split("-")[0];
    const compatibleVoices = this.speechSynthesis
      .getVoices()
      .filter((voice) =>
        normalizedLanguageTag(voice.lang ?? "").startsWith(prefix),
      );
    if (preferredVoiceNames.length === 0) {
      return compatibleVoices[0] ?? null;
    }
    compatibleVoices.sort(
      (first, second) =>
        voiceScore(second, languageTag, preferredVoiceNames) -
        voiceScore(first, languageTag, preferredVoiceNames),
    );
    return compatibleVoices[0] ?? null;
  }
}
