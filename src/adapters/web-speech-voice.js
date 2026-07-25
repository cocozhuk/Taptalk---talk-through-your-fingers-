import { VOICE_IDENTITIES } from "../domain/contracts.js";

const PROFILES = Object.freeze({
  en_masculine: Object.freeze({ languageTag: "en-US", pitch: 0.72, rate: 0.9 }),
  en_feminine: Object.freeze({ languageTag: "en-US", pitch: 1.32, rate: 1.04 }),
  zh_masculine: Object.freeze({ languageTag: "zh-CN", pitch: 0.76, rate: 0.88 }),
  zh_feminine: Object.freeze({ languageTag: "zh-CN", pitch: 1.28, rate: 1.02 }),
});

export class WebSpeechVoicePort {
  constructor({
    speechSynthesis = globalThis.speechSynthesis,
    Utterance = globalThis.SpeechSynthesisUtterance,
    clock = () => performance.now(),
  } = {}) {
    this.speechSynthesis = speechSynthesis;
    this.Utterance = Utterance;
    this.clock = clock;
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
    utterance.voice = this.pickInternalVoice(profile.languageTag);

    return new Promise((resolve, reject) => {
      utterance.addEventListener("start", () => {
        request.onAudibleStart?.(this.clock());
      });
      utterance.addEventListener("end", resolve, { once: true });
      utterance.addEventListener(
        "error",
        (event) => {
          const error = new Error(
            `Speech synthesis failed: ${event.error ?? "unknown error"}`,
          );
          request.onError?.(error);
          reject(error);
        },
        { once: true },
      );

      // Requests are submitted immediately and independently. Some browser
      // speech engines still serialize them; the production voice adapter must
      // replace this fallback to guarantee overlapping playback.
      this.speechSynthesis.speak(utterance);
    });
  }

  pickInternalVoice(languageTag) {
    const prefix = languageTag.toLowerCase().split("-")[0];
    return (
      this.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ?? null
    );
  }
}

