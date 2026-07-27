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

export const FINGER_LABELS = Object.freeze({
  left_index: "Left index",
  left_middle: "Left middle",
  left_ring: "Left ring",
  left_pinky: "Left pinky",
  right_index: "Right index",
  right_middle: "Right middle",
  right_ring: "Right ring",
  right_pinky: "Right pinky",
});

export const LANGUAGES = Object.freeze({
  en: "English",
  zh: "Mandarin Chinese",
});

export const VOICE_IDENTITIES = Object.freeze({
  en_shelley: Object.freeze({
    id: "en_shelley",
    language: "en",
    gender: "feminine",
    name: "Shelley",
  }),
  zh_tingting: Object.freeze({
    id: "zh_tingting",
    language: "zh",
    gender: "feminine",
    name: "Tingting",
  }),
});

export const DEFAULT_VOICE_IDS = Object.freeze({
  en: "en_shelley",
  zh: "zh_tingting",
});

export const FIXED_VOICE_IDS = DEFAULT_VOICE_IDS;

export function isFingerId(value) {
  return FINGER_IDS.includes(value);
}

export function fixedVoiceIdFor(language) {
  const voiceId = DEFAULT_VOICE_IDS[language];
  if (!voiceId) {
    throw new TypeError(`Unsupported TapTalk language: ${language}`);
  }
  return voiceId;
}

export function voiceIdFor(language, preference) {
  const voiceId = DEFAULT_VOICE_IDS[language];
  if (!voiceId) {
    throw new TypeError(`Unsupported TapTalk voice identity: ${voiceId}`);
  }
  return voiceId;
}

export function activationIdFor(event) {
  return `${event.sessionId}:${event.frameId}:${event.fingerId}`;
}
