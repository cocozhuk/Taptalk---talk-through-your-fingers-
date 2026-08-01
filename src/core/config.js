import {
  FINGER_IDS,
  LANGUAGES,
  isFingerId,
} from "../domain/contracts.js";

export const STORAGE_KEY = "taptalk.config.v1";
export const CONFIG_VERSION = 1;

const DEFAULT_ASSIGNMENTS = Object.freeze({
  left_index: Object.freeze({ text: "Yes", language: "en" }),
  left_middle: Object.freeze({ text: "No", language: "en" }),
  left_ring: Object.freeze({ text: "Please", language: "en" }),
  left_pinky: Object.freeze({ text: "Thank you", language: "en" }),
  right_index: Object.freeze({ text: "你好", language: "zh" }),
  right_middle: Object.freeze({ text: "好的", language: "zh" }),
  right_ring: Object.freeze({ text: "请", language: "zh" }),
  right_pinky: Object.freeze({ text: "谢谢", language: "zh" }),
});

export function createDefaultConfig() {
  return {
    version: CONFIG_VERSION,
    assignments: Object.fromEntries(
      FINGER_IDS.map((fingerId) => [
        fingerId,
        { ...DEFAULT_ASSIGNMENTS[fingerId] },
      ]),
    ),
    voicePreferences: {
      en: "masculine",
      zh: "feminine",
    },
  };
}

export function detectExpressionLanguage(text) {
  const normalizedText = typeof text === "string" ? text.trim() : "";
  if (!normalizedText) {
    return null;
  }
  if (/^[A-Za-z]+(?:\s+[A-Za-z]+)*$/u.test(normalizedText)) {
    return "en";
  }
  if (Array.from(normalizedText).every((character) => /^\p{Script=Han}$/u.test(character))) {
    return "zh";
  }
  return null;
}

export function validateExpression(text, language) {
  const normalizedText = typeof text === "string" ? text.trim() : "";

  if (!normalizedText) {
    return {
      valid: true,
      normalizedText: "",
      units: 0,
      disabled: true,
      error: "",
    };
  }

  if (!Object.hasOwn(LANGUAGES, language)) {
    return {
      valid: false,
      normalizedText,
      units: 0,
      disabled: false,
      error: "Use only English words or Chinese characters.",
    };
  }

  if (language === "en") {
    const words = normalizedText.split(/\s+/u);
    if (!words.every((word) => /^[A-Za-z]+$/u.test(word))) {
      return {
        valid: false,
        normalizedText,
        units: words.length,
        error: "Use English letters only; ambiguous punctuation is not accepted.",
      };
    }
    if (words.length > 5) {
      return {
        valid: false,
        normalizedText,
        units: words.length,
        error: "Use one to five English words.",
      };
    }
    return {
      valid: true,
      normalizedText: words.join(" "),
      units: words.length,
      error: "",
    };
  }

  const characters = Array.from(normalizedText);
  if (!characters.every((character) => /^\p{Script=Han}$/u.test(character))) {
    return {
      valid: false,
      normalizedText,
      units: characters.length,
      error: "Use Chinese characters only, with no spaces or Latin words.",
    };
  }
  if (characters.length > 5) {
    return {
      valid: false,
      normalizedText,
      units: characters.length,
      error: "Use one to five Chinese characters.",
    };
  }
  return {
    valid: true,
    normalizedText,
    units: characters.length,
    error: "",
  };
}

export function validateConfig(config) {
  const errors = {};
  if (!config || config.version !== CONFIG_VERSION) {
    return { valid: false, errors: { config: "Unsupported configuration." } };
  }

  const assignmentKeys = Object.keys(config.assignments ?? {});
  const hasExactFingerSet =
    assignmentKeys.length === FINGER_IDS.length &&
    assignmentKeys.every(isFingerId);

  if (!hasExactFingerSet) {
    errors.config = "Configuration must contain exactly eight finger assignments.";
  } else {
    for (const fingerId of FINGER_IDS) {
      const assignment = config.assignments[fingerId];
      const result = validateExpression(
        assignment?.text,
        assignment?.language,
      );
      if (!result.valid) {
        errors[fingerId] = result.error;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function normalizeConfig(config) {
  const normalized = createDefaultConfig();
  for (const fingerId of FINGER_IDS) {
    const assignment = config.assignments[fingerId];
    normalized.assignments[fingerId] = {
      text: validateExpression(assignment.text, assignment.language)
        .normalizedText,
      language: Object.hasOwn(LANGUAGES, assignment.language)
        ? assignment.language
        : "en",
    };
  }
  normalized.voicePreferences = {
    en: "masculine",
    zh: "feminine",
  };
  return normalized;
}

export class ConfigRepository {
  constructor(storage, storageKey = STORAGE_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  load() {
    try {
      const serialized = this.storage.getItem(this.storageKey);
      if (!serialized) {
        return createDefaultConfig();
      }
      const candidate = JSON.parse(serialized);
      if (!validateConfig(candidate).valid) {
        return createDefaultConfig();
      }
      return normalizeConfig(candidate);
    } catch {
      return createDefaultConfig();
    }
  }

  save(config) {
    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new TypeError("Cannot persist an invalid TapTalk configuration.");
    }
    const normalized = normalizeConfig(config);
    this.storage.setItem(this.storageKey, JSON.stringify(normalized));
    return normalized;
  }

  reset() {
    this.storage.removeItem(this.storageKey);
    return createDefaultConfig();
  }
}
