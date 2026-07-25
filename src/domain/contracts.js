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
  en_masculine: Object.freeze({
    id: "en_masculine",
    language: "en",
    preference: "masculine",
    name: "Bolt",
  }),
  en_feminine: Object.freeze({
    id: "en_feminine",
    language: "en",
    preference: "feminine",
    name: "Lumen",
  }),
  zh_masculine: Object.freeze({
    id: "zh_masculine",
    language: "zh",
    preference: "masculine",
    name: "Relay",
  }),
  zh_feminine: Object.freeze({
    id: "zh_feminine",
    language: "zh",
    preference: "feminine",
    name: "Pixel",
  }),
});

export function isFingerId(value) {
  return FINGER_IDS.includes(value);
}

export function voiceIdFor(language, preference) {
  const voiceId = `${language}_${preference}`;
  if (!Object.hasOwn(VOICE_IDENTITIES, voiceId)) {
    throw new TypeError(`Unsupported TapTalk voice identity: ${voiceId}`);
  }
  return voiceId;
}

export function activationIdFor(event) {
  return `${event.sessionId}:${event.frameId}:${event.fingerId}`;
}

