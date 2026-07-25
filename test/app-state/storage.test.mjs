import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIGURATION_STORAGE_KEY,
  CURRENT_SCHEMA_VERSION,
  FINGER_IDS,
  createConfigurationStore,
} from "../../src/app-state/index.mjs";
import {
  MemoryStorage,
  makeConfiguration,
  makeVersion1Configuration,
} from "./fixtures.mjs";

test("saves and loads only the current local configuration schema", () => {
  const storage = new MemoryStorage();
  const fallback = makeConfiguration();
  const store = createConfigurationStore(storage, fallback);

  const saveResult = store.save(fallback);
  assert.equal(saveResult.ok, true);

  const persisted = JSON.parse(storage.getItem(CONFIGURATION_STORAGE_KEY));
  assert.equal(persisted.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(persisted).sort(), [
    "assignments",
    "schemaVersion",
    "voicePreferences",
  ]);
  assert.deepEqual(Object.keys(persisted.assignments), FINGER_IDS);
  assert.equal(JSON.stringify(persisted).includes("frame"), false);
  assert.equal(JSON.stringify(persisted).includes("eventId"), false);

  const loaded = store.load();
  assert.equal(loaded.source, "stored");
  assert.deepEqual(loaded.configuration, fallback);
  assert.deepEqual(loaded.warnings, []);
});

test("returns an isolated fallback when no stored value exists", () => {
  const fallback = makeConfiguration();
  const store = createConfigurationStore(new MemoryStorage(), fallback);

  const first = store.load();
  first.configuration.assignments.left_index.text = "Mutated";
  const second = store.load();

  assert.equal(first.source, "fallback");
  assert.equal(second.configuration.assignments.left_index.text, "Yes");
  assert.equal(fallback.assignments.left_index.text, "Yes");
});

test("migrates a valid version-1 configuration and writes version 2 back", () => {
  const legacy = makeVersion1Configuration();
  const storage = new MemoryStorage([
    [CONFIGURATION_STORAGE_KEY, JSON.stringify(legacy)],
  ]);
  const store = createConfigurationStore(storage, makeConfiguration());

  const loaded = store.load();
  assert.equal(loaded.source, "migrated");
  assert.deepEqual(loaded.warnings, []);
  assert.deepEqual(loaded.configuration, makeConfiguration());

  const rewritten = JSON.parse(storage.getItem(CONFIGURATION_STORAGE_KEY));
  assert.equal(rewritten.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(rewritten.assignments.left_index.text, "Yes");
  assert.equal(rewritten.assignments.left_index.language, "en");
});

test("falls back without overwriting malformed or future configuration", () => {
  for (const storedValue of [
    "{not json",
    JSON.stringify({
      schemaVersion: 99,
      assignments: {},
      voicePreferences: {},
    }),
  ]) {
    const storage = new MemoryStorage([
      [CONFIGURATION_STORAGE_KEY, storedValue],
    ]);
    const loaded = createConfigurationStore(
      storage,
      makeConfiguration(),
    ).load();

    assert.equal(loaded.source, "fallback");
    assert.equal(loaded.warnings.length, 1);
    assert.equal(storage.getItem(CONFIGURATION_STORAGE_KEY), storedValue);
  }
});

test("reset removes only TapTalk configuration and returns fallback", () => {
  const storage = new MemoryStorage([
    [CONFIGURATION_STORAGE_KEY, "stored"],
    ["another.application", "keep"],
  ]);
  const store = createConfigurationStore(storage, makeConfiguration());
  const reset = store.reset();

  assert.equal(reset.ok, true);
  assert.deepEqual(reset.configuration, makeConfiguration());
  assert.equal(storage.getItem(CONFIGURATION_STORAGE_KEY), null);
  assert.equal(storage.getItem("another.application"), "keep");
});

test("reports storage API failures without crashing", () => {
  const fallback = makeConfiguration();
  const readFailure = createConfigurationStore(
    {
      getItem() {
        throw new Error("denied");
      },
      setItem() {},
      removeItem() {},
    },
    fallback,
  ).load();
  assert.equal(readFailure.source, "fallback");
  assert.equal(readFailure.warnings[0].code, "storage_read_failed");

  const writeStore = createConfigurationStore(
    {
      getItem() {
        return null;
      },
      setItem() {
        throw new Error("quota");
      },
      removeItem() {
        throw new Error("denied");
      },
    },
    fallback,
  );
  assert.equal(writeStore.save(fallback).error.code, "storage_write_failed");
  assert.equal(writeStore.reset().error.code, "storage_remove_failed");
});

test("rejects an invalid fallback configuration at construction", () => {
  const invalid = makeConfiguration();
  delete invalid.assignments.right_pinky;

  assert.throws(
    () => createConfigurationStore(new MemoryStorage(), invalid),
    /fallbackConfiguration is invalid/,
  );
});
