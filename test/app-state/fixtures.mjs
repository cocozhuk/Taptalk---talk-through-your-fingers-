import { FINGER_IDS } from "../../src/app-state/index.mjs";

const EXPRESSIONS = Object.freeze({
  left_index: { text: "Yes", language: "en" },
  left_middle: { text: "No", language: "en" },
  left_ring: { text: "Help", language: "en" },
  left_pinky: { text: "Thank you", language: "en" },
  right_index: { text: "你好", language: "zh" },
  right_middle: { text: "可以", language: "zh" },
  right_ring: { text: "不要", language: "zh" },
  right_pinky: { text: "谢谢", language: "zh" },
});

export function makeConfiguration() {
  return {
    assignments: Object.fromEntries(
      FINGER_IDS.map((fingerId) => [
        fingerId,
        { ...EXPRESSIONS[fingerId] },
      ]),
    ),
    voicePreferences: {
      en: "feminine",
      zh: "masculine",
    },
  };
}

export function makeVersion1Configuration() {
  const configuration = makeConfiguration();

  return {
    schemaVersion: 1,
    assignments: Object.fromEntries(
      FINGER_IDS.map((fingerId) => {
        const assignment = configuration.assignments[fingerId];
        return [
          fingerId,
          {
            expression: assignment.text,
            language:
              assignment.language === "en" ? "english" : "mandarin",
          },
        ];
      }),
    ),
    voicePreferences: {
      english: configuration.voicePreferences.en,
      mandarin: configuration.voicePreferences.zh,
    },
  };
}

export class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}
