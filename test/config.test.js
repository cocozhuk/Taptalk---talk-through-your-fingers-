import assert from "node:assert/strict";
import test from "node:test";
import {
  ConfigRepository,
  STORAGE_KEY,
  createDefaultConfig,
  detectExpressionLanguage,
  validateConfig,
  validateExpression,
} from "../src/core/config.js";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("English validation accepts one to five letter-only words", () => {
  assert.equal(validateExpression("Thank you", "en").valid, true);
  assert.equal(validateExpression("one two three four five", "en").valid, true);
  assert.equal(
    validateExpression("one two three four five six", "en").valid,
    false,
  );
  assert.equal(validateExpression("hello!", "en").valid, false);
  assert.equal(validateExpression("hello 你好", "en").valid, false);
});

test("Mandarin validation counts Han characters and rejects ambiguity", () => {
  assert.equal(validateExpression("我需要帮助", "zh").valid, true);
  assert.equal(validateExpression("我需要你帮助", "zh").valid, false);
  assert.equal(validateExpression("你好 world", "zh").valid, false);
  assert.equal(validateExpression("你 好", "zh").valid, false);
  assert.equal(validateExpression("你好！", "zh").valid, false);
});

test("detects English or Mandarin directly from expression text", () => {
  assert.equal(detectExpressionLanguage("Thank you"), "en");
  assert.equal(detectExpressionLanguage("谢谢"), "zh");
  assert.equal(detectExpressionLanguage("hello 你好"), null);
  assert.equal(detectExpressionLanguage("hello!"), null);
  assert.equal(detectExpressionLanguage(""), null);
});

test("an empty expression disables its finger without a validation error", () => {
  assert.deepEqual(validateExpression("  ", ""), {
    valid: true,
    normalizedText: "",
    units: 0,
    disabled: true,
    error: "",
  });

  const config = createDefaultConfig();
  config.assignments.left_index = { text: "", language: "en" };
  assert.equal(validateConfig(config).valid, true);
});

test("configuration contains exactly eight valid assignments", () => {
  const config = createDefaultConfig();
  assert.equal(validateConfig(config).valid, true);

  delete config.assignments.left_index;
  assert.equal(validateConfig(config).valid, false);
});

test("repository persists valid local configuration and resets it", () => {
  const storage = new MemoryStorage();
  const repository = new ConfigRepository(storage);
  const config = createDefaultConfig();
  config.assignments.left_index.text = "Help me";

  repository.save(config);
  assert.equal(repository.load().assignments.left_index.text, "Help me");
  assert.ok(storage.getItem(STORAGE_KEY));

  config.assignments.left_middle.text = "";
  repository.save(config);
  assert.equal(repository.load().assignments.left_middle.text, "");

  const defaults = repository.reset();
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.deepEqual(defaults, createDefaultConfig());
});

test("legacy voice preferences are ignored without losing saved assignments", () => {
  const storage = new MemoryStorage();
  const repository = new ConfigRepository(storage);
  const legacy = createDefaultConfig();
  legacy.assignments.left_index.text = "Still here";
  legacy.voicePreferences = {
    en: "feminine",
    zh: "masculine",
  };
  storage.setItem(STORAGE_KEY, JSON.stringify(legacy));

  const loaded = repository.load();

  assert.equal(loaded.assignments.left_index.text, "Still here");
  assert.deepEqual(loaded.voicePreferences, {
    en: "masculine",
    zh: "feminine",
  });
});

test("repository recovers from malformed or invalid stored values", () => {
  const storage = new MemoryStorage();
  const repository = new ConfigRepository(storage);

  storage.setItem(STORAGE_KEY, "{");
  assert.deepEqual(repository.load(), createDefaultConfig());

  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
  assert.deepEqual(repository.load(), createDefaultConfig());
});
