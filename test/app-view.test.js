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
