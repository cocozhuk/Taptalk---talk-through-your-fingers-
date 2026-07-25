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

export const LANGUAGES = Object.freeze(["en", "zh"]);
export const VOICE_PREFERENCES = Object.freeze(["masculine", "feminine"]);

export const VOICE_IDENTITIES = Object.freeze({
  en: Object.freeze({
    masculine: "en_masculine",
    feminine: "en_feminine",
  }),
  zh: Object.freeze({
    masculine: "zh_masculine",
    feminine: "zh_feminine",
  }),
});

export const CONFIGURATION_STORAGE_KEY = "taptalk.configuration";
export const CURRENT_SCHEMA_VERSION = 2;

const FINGER_ID_SET = new Set(FINGER_IDS);
const LANGUAGE_SET = new Set(LANGUAGES);
const VOICE_PREFERENCE_SET = new Set(VOICE_PREFERENCES);

export function isFingerId(value) {
  return FINGER_ID_SET.has(value);
}

export function isLanguage(value) {
  return LANGUAGE_SET.has(value);
}

export function isVoicePreference(value) {
  return VOICE_PREFERENCE_SET.has(value);
}
