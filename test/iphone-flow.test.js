import assert from "node:assert/strict";
import test from "node:test";

import {
  IPhoneFlow,
  IPHONE_SCREENS,
} from "../src/ui/iphone-flow.js";

function setup({
  iphone = true,
  saveResult = true,
  startResult = true,
} = {}) {
  const calls = [];
  const view = {
    isIPhoneMode: () => iphone,
    setMobileScreen: (screen) => calls.push(["screen", screen]),
    setMobileLaunchBusy: (busy) => calls.push(["launch-busy", busy]),
    openMobileCameraChoice: () => calls.push(["open-choice"]),
    setMobileChoiceBusy: (busy) => calls.push(["choice-busy", busy]),
    closeMobileCameraChoice: () => calls.push(["close-choice"]),
    setSettingsStatus: (message, tone) =>
      calls.push(["settings", message, tone]),
    currentCameraMessage: () => "Camera permission was denied.",
  };
  let resolveStart;
  const deferredStart = new Promise((resolve) => {
    resolveStart = resolve;
  });
  let resolveSave;
  const deferredSave = new Promise((resolve) => {
    resolveSave = resolve;
  });
  let resolveStop;
  const deferredStop = new Promise((resolve) => {
    resolveStop = resolve;
  });
  let useDeferredSave = false;
  let useDeferredStart = false;
  let useDeferredStop = false;
  const flow = new IPhoneFlow({
    view,
    saveAssignments: async () => {
      calls.push(["save"]);
      return useDeferredSave ? deferredSave : saveResult;
    },
    startCamera: async (options) => {
      calls.push(["start", options]);
      return useDeferredStart ? deferredStart : startResult;
    },
    stopCamera: async (options) => {
      calls.push(["stop", options]);
      if (useDeferredStop) {
        await deferredStop;
      }
    },
  });
  return {
    calls,
    flow,
    resolveSave,
    resolveStart,
    resolveStop,
    useDeferredSave: () => {
      useDeferredSave = true;
    },
    useDeferredStart: () => {
      useDeferredStart = true;
    },
    useDeferredStop: () => {
      useDeferredStop = true;
    },
  };
}

test("iPhone first-visit state moves from tutorial to setup", () => {
  const { calls, flow } = setup();
  flow.handleGuideCompletion(false);
  flow.handleGuideCompletion(true);
  assert.deepEqual(calls, [
    ["screen", IPHONE_SCREENS.TUTORIAL],
    ["screen", IPHONE_SCREENS.SETUP],
  ]);
});

test("desktop ignores every iPhone-only guide transition", () => {
  const { calls, flow } = setup({ iphone: false });
  flow.handleGuideCompletion(false);
  flow.handleGuideCompletion(true);
  assert.deepEqual(calls, []);
});

test("continue saves and warms assignments before opening camera choice", async () => {
  const { calls, flow } = setup();
  assert.equal(await flow.continueToCamera(), true);
  assert.deepEqual(calls, [
    ["launch-busy", true],
    ["save"],
    ["open-choice"],
    ["launch-busy", false],
  ]);
});

test("invalid or unprepared assignments never open camera choice", async () => {
  const { calls, flow } = setup({ saveResult: false });
  assert.equal(await flow.continueToCamera(), false);
  assert.equal(calls.some(([name]) => name === "open-choice"), false);
});

test("a rapid second Continue tap cannot save or open another choice", async () => {
  const setupResult = setup();
  setupResult.useDeferredSave();
  const first = setupResult.flow.continueToCamera();
  const second = setupResult.flow.continueToCamera();

  assert.equal(await second, false);
  assert.equal(
    setupResult.calls.filter(([name]) => name === "save").length,
    1,
  );
  setupResult.resolveSave(true);
  assert.equal(await first, true);
  assert.equal(
    setupResult.calls.filter(([name]) => name === "open-choice").length,
    1,
  );
});

test("camera is requested only after an explicit choice", async () => {
  const { calls, flow } = setup();
  await flow.continueToCamera();
  assert.equal(calls.some(([name]) => name === "start"), false);

  await flow.chooseCamera({ record: false });
  assert.deepEqual(
    calls.filter(([name]) => name === "start"),
    [["start", { record: false }]],
  );
  assert.deepEqual(calls.at(-2), ["screen", IPHONE_SCREENS.LIVE]);
});

test("recording choice forwards record intent exactly once", async () => {
  const { calls, flow } = setup();
  await flow.chooseCamera({ record: true });
  assert.deepEqual(
    calls.filter(([name]) => name === "start"),
    [["start", { record: true }]],
  );
});

test("camera failure stays in setup and exposes its error", async () => {
  const { calls, flow } = setup({ startResult: false });
  assert.equal(await flow.chooseCamera({ record: false }), false);
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "settings" &&
        call[1] === "Camera permission was denied." &&
        call[2] === "error",
    ),
    true,
  );
  assert.equal(
    calls.some(
      ([name, screen]) =>
        name === "screen" && screen === IPHONE_SCREENS.LIVE,
    ),
    false,
  );
});

test("a rapid second camera choice cannot start another session", async () => {
  const setupResult = setup();
  setupResult.useDeferredStart();
  const first = setupResult.flow.chooseCamera({ record: false });
  const second = setupResult.flow.chooseCamera({ record: true });
  assert.equal(await second, false);
  assert.equal(
    setupResult.calls.filter(([name]) => name === "start").length,
    1,
  );
  setupResult.resolveStart(true);
  assert.equal(await first, true);
});

test("exit waits for shared camera cleanup and returns through its contract", async () => {
  const { calls, flow } = setup();
  assert.equal(await flow.exitCamera(), true);
  assert.deepEqual(
    calls.filter(([name]) => name === "stop"),
    [["stop", { returnToSetup: true }]],
  );
});

test("a rapid second Exit tap cannot run camera cleanup twice", async () => {
  const setupResult = setup();
  setupResult.useDeferredStop();
  const first = setupResult.flow.exitCamera();
  const second = setupResult.flow.exitCamera();

  assert.equal(await second, false);
  assert.equal(
    setupResult.calls.filter(([name]) => name === "stop").length,
    1,
  );
  setupResult.resolveStop();
  assert.equal(await first, true);
});
