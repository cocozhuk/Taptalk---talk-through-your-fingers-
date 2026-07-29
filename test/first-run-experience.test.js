import assert from "node:assert/strict";
import test from "node:test";

import {
  FirstRunExperience,
  mapVoiceProgress,
} from "../src/ui/first-run-experience.js";

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.listeners = new Map();
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value),
    };
    this.textContent = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  click() {
    this.listeners.get("click")?.({});
  }
}

function setup({ completed = false } = {}) {
  const selectors = [
    "#onboarding-guide",
    "#onboarding-back",
    "#onboarding-image",
    "#onboarding-next",
    "#onboarding-status",
    "#voice-readiness",
    "#voice-progress-bar",
    "#voice-readiness-detail",
    "#voice-readiness-percent",
    "#voice-readiness-title",
  ];
  const elements = new Map(
    selectors.map((selector) => [selector, new FakeElement()]),
  );
  const stored = new Map(
    completed ? [["taptalk.onboarding.v1", "completed"]] : [],
  );
  const availability = [];
  const scheduled = [];
  const experience = new FirstRunExperience({
    documentRef: {
      querySelector: (selector) => elements.get(selector),
    },
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    },
    schedule: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
    cancelSchedule() {},
    onCameraAvailabilityChange: (available, message) =>
      availability.push({ available, message }),
  });
  return {
    availability,
    elements,
    experience,
    scheduled,
    stored,
  };
}

test("maps English and Mandarin preparation into one visible percentage", () => {
  assert.equal(mapVoiceProgress("en_US-hfc_female-medium", 0), 0);
  assert.equal(mapVoiceProgress("en_US-hfc_female-medium", 100), 50);
  assert.equal(mapVoiceProgress("zh_matcha-baker-local", 0), 50);
  assert.equal(mapVoiceProgress("zh_matcha-baker-local", 100), 100);
  assert.equal(mapVoiceProgress("zh_matcha-baker-local", null), null);
});

test("a new browser must finish all three slides before voice readiness", () => {
  const setupResult = setup();
  setupResult.experience.start();

  assert.equal(
    setupResult.elements.get("#onboarding-guide").hidden,
    false,
  );
  assert.equal(setupResult.availability[0].available, false);

  setupResult.elements.get("#onboarding-next").click();
  setupResult.elements.get("#onboarding-next").click();
  setupResult.experience.setVoiceReady();
  assert.equal(setupResult.scheduled.length, 0);

  setupResult.elements.get("#onboarding-next").click();
  assert.equal(
    setupResult.stored.get("taptalk.onboarding.v1"),
    "completed",
  );
  assert.equal(setupResult.scheduled.length, 1);

  setupResult.scheduled[0]();
  assert.equal(setupResult.availability.at(-1).available, true);
  assert.equal(
    setupResult.elements.get("#voice-readiness").hidden,
    true,
  );
});

test("a returning browser skips slides and sees live voice progress", () => {
  const setupResult = setup({ completed: true });
  setupResult.experience.start();
  setupResult.experience.setVoiceProgress({
    modelId: "zh_matcha-baker-local",
    percent: 40,
  });

  assert.equal(
    setupResult.elements.get("#onboarding-guide").hidden,
    true,
  );
  assert.equal(
    setupResult.elements.get("#voice-readiness").hidden,
    false,
  );
  assert.equal(
    setupResult.elements.get("#voice-readiness-percent").textContent,
    "70%",
  );
  assert.equal(setupResult.availability[0].available, false);
});
