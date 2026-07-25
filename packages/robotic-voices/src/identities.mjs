const LANGUAGE_CODES = Object.freeze(["en", "zh"]);
const GENDER_CODES = Object.freeze(["masculine", "feminine"]);

function profile(id, language, gender, processing) {
  return Object.freeze({
    id,
    language,
    gender,
    processing: Object.freeze(processing),
  });
}

/**
 * The only voice identities exposed by this package.
 *
 * The synthesis backend maps these stable IDs to licensed model speakers.
 * Audio processing is intentionally subtle: the backend speaker carries
 * intelligibility and expression while this layer adds a mechanical accent.
 */
export const VOICE_IDENTITIES = Object.freeze({
  "en-masculine": profile("en-masculine", "en", "masculine", {
    dryGain: 0.92,
    wetGain: 0.1,
    ringFrequencyHz: 34,
    bandpassFrequencyHz: 1050,
    bandpassQ: 0.8,
  }),
  "en-feminine": profile("en-feminine", "en", "feminine", {
    dryGain: 0.94,
    wetGain: 0.08,
    ringFrequencyHz: 47,
    bandpassFrequencyHz: 2050,
    bandpassQ: 0.72,
  }),
  "zh-masculine": profile("zh-masculine", "zh", "masculine", {
    dryGain: 0.93,
    wetGain: 0.09,
    ringFrequencyHz: 31,
    bandpassFrequencyHz: 920,
    bandpassQ: 0.82,
  }),
  "zh-feminine": profile("zh-feminine", "zh", "feminine", {
    dryGain: 0.95,
    wetGain: 0.07,
    ringFrequencyHz: 43,
    bandpassFrequencyHz: 2250,
    bandpassQ: 0.68,
  }),
});

export const VOICE_IDENTITY_IDS = Object.freeze(Object.keys(VOICE_IDENTITIES));

/**
 * Route one of the two product languages and two gender preferences to exactly
 * one fixed identity. This deliberately does not infer or validate language
 * from text; App State owns expression validation.
 */
export function routeVoiceIdentity(language, gender) {
  if (!LANGUAGE_CODES.includes(language)) {
    throw new RangeError(`Unsupported TapTalk language: ${String(language)}`);
  }

  if (!GENDER_CODES.includes(gender)) {
    throw new RangeError(`Unsupported TapTalk voice preference: ${String(gender)}`);
  }

  return VOICE_IDENTITIES[`${language}-${gender}`];
}
