import assert from "node:assert/strict";
import test from "node:test";

import {
  FINGER_IDS,
  updateAssignment,
  updateVoicePreference,
  validateConfiguration,
  validateExpression,
} from "../../src/app-state/index.mjs";
import { makeConfiguration } from "./fixtures.mjs";

test("normalizes and counts one to five English words", () => {
  assert.deepEqual(validateExpression("  Très \t bien  "), {
    ok: true,
    value: {
      text: "Très bien",
      language: "en",
      unitCount: 2,
    },
  });

  assert.equal(
    validateExpression("one two three four five").value.unitCount,
    5,
  );
  assert.equal(
    validateExpression("one two three four five six").error.code,
    "english_too_many_words",
  );
});

test("counts Mandarin by Han code point and enforces the five-character limit", () => {
  assert.deepEqual(validateExpression("你好世界啊"), {
    ok: true,
    value: {
      text: "你好世界啊",
      language: "zh",
      unitCount: 5,
    },
  });
  assert.equal(
    validateExpression("你好世界啊呀").error.code,
    "mandarin_too_many_characters",
  );
});

test("accepts empty and rejects mixed or provisionally ambiguous expressions", () => {
  assert.deepEqual(validateExpression(" \t "), {
    ok: true,
    value: { text: "", language: "en", unitCount: 0 },
  });
  assert.equal(validateExpression("hello你好").error.code, "mixed_language");

  for (const expression of [
    "hello!",
    "version 2",
    "hello🙂",
    "привет",
    "你 好",
  ]) {
    assert.equal(
      validateExpression(expression).error.code,
      "ambiguous_characters",
      expression,
    );
  }
});

test("validates exactly eight assignments and matching language tags", () => {
  const valid = makeConfiguration();
  assert.equal(validateConfiguration(valid).ok, true);

  const missing = makeConfiguration();
  delete missing.assignments.left_index;
  assert.equal(validateConfiguration(missing).error.code, "invalid_configuration");

  const extra = makeConfiguration();
  extra.assignments.left_thumb = { text: "Never", language: "en" };
  assert.equal(validateConfiguration(extra).error.code, "invalid_configuration");

  const mismatch = makeConfiguration();
  mismatch.assignments.left_index.language = "zh";
  assert.equal(
    validateConfiguration(mismatch).error.code,
    "assignment_language_mismatch",
  );

  assert.deepEqual(Object.keys(valid.assignments), FINGER_IDS);
});

test("updates an assignment immutably and derives its language from text", () => {
  const original = makeConfiguration();
  const updated = updateAssignment(original, "left_index", "  我好  ");

  assert.equal(updated.ok, true);
  assert.deepEqual(updated.assignment, {
    text: "我好",
    language: "zh",
  });
  assert.deepEqual(updated.configuration.assignments.left_index, {
    text: "我好",
    language: "zh",
  });
  assert.deepEqual(original.assignments.left_index, {
    text: "Yes",
    language: "en",
  });

  const disabled = updateAssignment(original, "left_index", "  ");
  assert.deepEqual(disabled.assignment, {
    text: "",
    language: "en",
  });

  assert.equal(
    updateAssignment(original, "left_thumb", "No").error.code,
    "invalid_finger_id",
  );
  assert.equal(
    updateAssignment(original, "left_index", "yes!").error.code,
    "ambiguous_characters",
  );
});

test("stores one independent masculine/feminine preference per language", () => {
  const original = makeConfiguration();
  const updated = updateVoicePreference(original, "zh", "feminine");

  assert.equal(updated.ok, true);
  assert.deepEqual(updated.configuration.voicePreferences, {
    en: "feminine",
    zh: "feminine",
  });
  assert.equal(original.voicePreferences.zh, "masculine");

  assert.equal(
    updateVoicePreference(original, "fr", "feminine").error.code,
    "invalid_language",
  );
  assert.equal(
    updateVoicePreference(original, "en", "neutral").error.code,
    "invalid_voice_preference",
  );
});
