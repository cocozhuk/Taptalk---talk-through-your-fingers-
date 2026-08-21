import assert from "node:assert/strict";
import test from "node:test";

import { FINGER_IDS } from "../src/domain/contracts.js";
import {
  AppView,
  projectToOuterTip,
  setLiveMarkerVisibility,
} from "../src/ui/app-view.js";

function marker() {
  const classes = new Set(["finger-marker"]);
  const styles = new Map();
  return {
    hidden: false,
    classes,
    positions: [],
    dataset: {},
    style: {
      setProperty(name, value) {
        styles.set(name, value);
      },
      removeProperty(name) {
        styles.delete(name);
      },
      getPropertyValue(name) {
        return styles.get(name) ?? "";
      },
    },
    classList: {
      toggle(name, enabled) {
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      remove(...names) {
        for (const name of names) {
          classes.delete(name);
        }
      },
    },
  };
}

test("live markers fail closed when their current hand point disappears", () => {
  const fingertip = marker();

  setLiveMarkerVisibility(fingertip, true);
  assert.equal(fingertip.hidden, false);
  assert.equal(fingertip.classes.has("is-tracked"), true);

  setLiveMarkerVisibility(fingertip, false);
  assert.equal(fingertip.hidden, true);
  assert.equal(fingertip.classes.has("is-tracked"), false);
  assert.equal(fingertip.style.getPropertyValue("display"), "none");
});

test("fingertip dots extend outward from the tracked joint", () => {
  const projected = projectToOuterTip(
    { x: 0.4, y: 0.2, z: -0.01 },
    { x: 0.4, y: 0.3, z: 0 },
  );
  assert.equal(projected.x, 0.4);
  assert.ok(Math.abs(projected.y - 0.18) < Number.EPSILON);
  assert.equal(projected.z, -0.01);
});

test("landmark loss removes all fingertip and thumb markers for that hand", () => {
  const fingerMarkers = new Map(
    FINGER_IDS.map((fingerId) => [fingerId, marker()]),
  );
  const thumbMarkers = new Map([
    ["left", marker()],
    ["right", marker()],
  ]);
  const view = Object.create(AppView.prototype);
  view.elements = {
    fingerOverlay: { dataset: {} },
  };
  view.marker = (fingerId) => fingerMarkers.get(fingerId);
  view.thumbMarker = (hand) => thumbMarkers.get(hand);
  view.positionMarker = (target, point) => target.positions.push(point);

  const leftLandmarks = Array.from({ length: 21 }, (_, index) => ({
    x: 0.2 + index / 100,
    y: 0.3 + index / 100,
  }));
  view.applyHandLandmarks([
    { handedness: "left", landmarks: leftLandmarks },
  ]);

  for (const [fingerId, target] of fingerMarkers) {
    assert.equal(target.hidden, fingerId.startsWith("right_"));
  }
  assert.equal(thumbMarkers.get("left").hidden, false);
  assert.equal(thumbMarkers.get("right").hidden, true);

  view.applyHandLandmarks([]);

  for (const target of fingerMarkers.values()) {
    assert.equal(target.hidden, true);
    assert.equal(target.classes.has("is-tracked"), false);
  }
  assert.equal(thumbMarkers.get("left").hidden, true);
  assert.equal(thumbMarkers.get("right").hidden, true);
});

test("empty assignments keep their fingertip marker hidden", () => {
  const fingerMarkers = new Map(
    FINGER_IDS.map((fingerId) => [fingerId, marker()]),
  );
  const thumbMarkers = new Map([
    ["left", marker()],
    ["right", marker()],
  ]);
  const view = Object.create(AppView.prototype);
  view.enabledFingerIds = new Set(
    FINGER_IDS.filter((fingerId) => fingerId !== "left_index"),
  );
  view.elements = {
    fingerOverlay: { dataset: {} },
  };
  view.marker = (fingerId) => fingerMarkers.get(fingerId);
  view.thumbMarker = (hand) => thumbMarkers.get(hand);
  view.positionMarker = (target, point) => target.positions.push(point);

  view.applyHandLandmarks([
    {
      handedness: "left",
      landmarks: Array.from({ length: 21 }, (_, index) => ({
        x: 0.2 + index / 100,
        y: 0.3 + index / 100,
      })),
    },
  ]);

  assert.equal(fingerMarkers.get("left_index").hidden, true);
  assert.equal(fingerMarkers.get("left_middle").hidden, false);
});

test("a zero-hand tracking status force-hides every live marker", () => {
  const fingerMarkers = new Map(
    FINGER_IDS.map((fingerId) => [fingerId, marker()]),
  );
  const thumbMarkers = new Map([
    ["left", marker()],
    ["right", marker()],
  ]);
  const overlayClasses = new Set(["is-live-tracking"]);
  const view = Object.create(AppView.prototype);
  view.elements = {
    cameraMessage: { textContent: "" },
    fingerOverlay: {
      dataset: { trackedHands: "2" },
      classList: {
        contains(name) {
          return overlayClasses.has(name);
        },
      },
    },
  };
  view.marker = (fingerId) => fingerMarkers.get(fingerId);
  view.thumbMarker = (hand) => thumbMarkers.get(hand);

  for (const target of [
    ...fingerMarkers.values(),
    ...thumbMarkers.values(),
  ]) {
    setLiveMarkerVisibility(target, true);
  }

  view.showTrackingStatus({
    phase: "tracking",
    detectedHands: 0,
    trackedHands: 0,
  });

  assert.equal(view.elements.fingerOverlay.dataset.trackedHands, "0");
  assert.match(view.elements.cameraMessage.textContent, /0 hands detected/);
  for (const target of [
    ...fingerMarkers.values(),
    ...thumbMarkers.values(),
  ]) {
    assert.equal(target.hidden, true);
    assert.equal(target.style.getPropertyValue("display"), "none");
    assert.equal(target.classes.has("is-tracked"), false);
  }
});

test("recording errors stay visible instead of being overwritten by tracking", () => {
  const view = Object.create(AppView.prototype);
  view.recordingState = "error";
  view.elements = {
    cameraMessage: {
      textContent:
        "No tab audio was shared. Choose This Tab and enable Share tab audio.",
    },
  };

  view.showTrackingStatus({
    phase: "tracking",
    detectedHands: 1,
    trackedHands: 1,
  });
  view.showSpeechPending({ expression: "slay" });

  assert.match(view.elements.cameraMessage.textContent, /No tab audio/);
});

test("iPhone screen changes never mutate the desktop presentation", () => {
  const desktop = Object.create(AppView.prototype);
  desktop.interfaceMode = "desktop";
  desktop.document = { body: { dataset: { mobileScreen: "desktop" } } };
  desktop.setMobileScreen("live");
  assert.equal(desktop.document.body.dataset.mobileScreen, "desktop");

  const iphone = Object.create(AppView.prototype);
  iphone.interfaceMode = "iphone";
  iphone.document = { body: { dataset: {} } };
  iphone.setMobileScreen("setup");
  assert.equal(iphone.mobileScreen, "setup");
  assert.equal(iphone.document.body.dataset.mobileScreen, "setup");
  assert.throws(() => iphone.setMobileScreen("unknown"), /Unknown/);
});

test("mobile recording control mirrors the shared recording state", () => {
  const classes = new Set();
  const attributes = new Map();
  const mobileRecord = {
    dataset: {},
    disabled: true,
    textContent: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };
  const desktopRecord = {
    dataset: {},
    disabled: false,
    textContent: "",
    classList: mobileRecord.classList,
    setAttribute: mobileRecord.setAttribute,
  };
  const view = Object.create(AppView.prototype);
  view.cameraState = "active";
  view.elements = {
    cameraMessage: { textContent: "" },
    mobileLiveRecord: mobileRecord,
    recordToggle: desktopRecord,
    recordingCaption: { textContent: "" },
    recordingIndicator: { hidden: true },
  };

  view.setRecordingState("recording", "Recording locally.");

  assert.equal(mobileRecord.textContent, "Stop recording");
  assert.equal(mobileRecord.disabled, false);
  assert.equal(attributes.get("aria-pressed"), "true");
  assert.equal(classes.has("is-recording"), true);
  assert.equal(view.elements.recordingIndicator.hidden, false);
});

test("rotation immediately remaps live labels from source coordinates", () => {
  const trackedMarker = {
    dataset: { sourceX: "0.25", sourceY: "0.4" },
  };
  const calls = [];
  const view = Object.create(AppView.prototype);
  view.elements = {
    fingerOverlay: {
      querySelectorAll: () => [trackedMarker],
    },
  };
  view.positionMarker = (target, point) => calls.push([target, point]);

  view.reflowLiveMarkers();

  assert.deepEqual(calls, [
    [trackedMarker, { x: 0.75, y: 0.4 }],
  ]);
});

test("orientation changes update iPhone state and reflow after layout settles", () => {
  const frames = [];
  const reflows = [];
  const view = Object.create(AppView.prototype);
  view.interfaceMode = "iphone";
  view.document = { body: { dataset: {} } };
  view.landscapeMedia = { matches: true };
  view.window = {
    requestAnimationFrame(callback) {
      frames.push(callback);
    },
  };
  view.reflowLiveMarkers = () => reflows.push(true);

  view.syncMobileOrientation();
  assert.equal(view.document.body.dataset.mobileOrientation, "landscape");
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(frames.length, 1);
  assert.equal(reflows.length, 0);
  frames.shift()();
  assert.equal(reflows.length, 1);

  view.landscapeMedia.matches = false;
  view.syncMobileOrientation();
  assert.equal(view.document.body.dataset.mobileOrientation, "portrait");
});

test("voice preparation keeps mobile Continue tappable and marked waiting", () => {
  const attributes = new Map();
  const mobileContinue = {
    dataset: {},
    disabled: true,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };
  const view = Object.create(AppView.prototype);
  view.cameraState = "off";
  view.elements = {
    cameraMessage: { textContent: "" },
    cameraToggle: { disabled: false },
    mobileContinue,
  };

  view.setCameraAvailability(false, "Preparing voices…");

  assert.equal(mobileContinue.disabled, false);
  assert.equal(mobileContinue.dataset.waiting, "true");
  assert.equal(attributes.get("aria-disabled"), "true");
  assert.equal(view.elements.cameraMessage.textContent, "Preparing voices…");
});

test("waiting voice explanation opens as an iPhone dialog", () => {
  let opened = false;
  const view = Object.create(AppView.prototype);
  view.interfaceMode = "iphone";
  view.elements = {
    mobileVoiceWaiting: {
      showModal() {
        opened = true;
      },
    },
  };

  view.openMobileVoiceWaiting();

  assert.equal(opened, true);
});

test("voice readiness restores Continue and closes its waiting dialog", () => {
  const attributes = new Map();
  let closed = false;
  const mobileContinue = {
    dataset: { waiting: "true" },
    disabled: false,
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };
  const view = Object.create(AppView.prototype);
  view.cameraState = "off";
  view.elements = {
    cameraMessage: { textContent: "Preparing voices…" },
    cameraToggle: { disabled: true },
    mobileContinue,
    mobileVoiceWaiting: {
      open: true,
      close() {
        closed = true;
        this.open = false;
      },
      removeAttribute() {},
    },
  };

  view.setCameraAvailability(true, "Voices ready.");

  assert.equal(view.cameraAvailable, true);
  assert.equal(view.elements.cameraToggle.disabled, false);
  assert.equal(mobileContinue.disabled, false);
  assert.equal(mobileContinue.dataset.waiting, "false");
  assert.equal(attributes.get("aria-disabled"), "false");
  assert.equal(closed, true);
  assert.equal(view.elements.cameraMessage.textContent, "Voices ready.");
});
