import {
  FINGER_IDS,
  FINGER_LABELS,
} from "../domain/contracts.js";
import { detectExpressionLanguage } from "../core/config.js";

const DEMO_POSITIONS = Object.freeze({
  left_index: [34, 26],
  left_middle: [27, 18],
  left_ring: [19, 23],
  left_pinky: [12, 32],
  right_index: [66, 26],
  right_middle: [73, 18],
  right_ring: [81, 23],
  right_pinky: [88, 32],
});

const FINGER_LABEL_COLORS = Object.freeze([
  "#1637ff",
  "#4be000",
  "#a514ff",
  "#1637ff",
  "#4be000",
  "#a514ff",
  "#1637ff",
  "#4be000",
]);

const FINGERTIP_LANDMARK_INDEX = Object.freeze({
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
});

const FINGERTIP_PREVIOUS_LANDMARK_INDEX = Object.freeze({
  index: 7,
  middle: 11,
  ring: 15,
  pinky: 19,
});

export function projectToOuterTip(point, previousPoint, extension = 0.2) {
  if (!isVisualPoint(point) || !isVisualPoint(previousPoint)) {
    return point;
  }
  return {
    ...point,
    x: point.x + (point.x - previousPoint.x) * extension,
    y: point.y + (point.y - previousPoint.y) * extension,
  };
}

export function setLiveMarkerVisibility(marker, visible) {
  const isVisible = Boolean(visible);
  marker.hidden = !isVisible;
  marker.classList.toggle("is-tracked", isVisible);
  marker.style?.setProperty?.("display", isVisible ? "" : "none");
}

export class AppView {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.elements = {
      assignmentList: documentRef.querySelector("#assignment-list"),
      cameraIndicator: documentRef.querySelector("#camera-indicator"),
      cameraMessage: documentRef.querySelector("#camera-message"),
      cameraPlaceholder: documentRef.querySelector("#camera-placeholder"),
      cameraPreview: documentRef.querySelector("#camera-preview"),
      cameraToggle: documentRef.querySelector("#camera-toggle"),
      fingerOverlay: documentRef.querySelector("#finger-overlay"),
      form: documentRef.querySelector("#settings-form"),
      prototypeBadge: documentRef.querySelector("#prototype-badge"),
      recordingCaption: documentRef.querySelector("#recording-caption"),
      recordingIndicator: documentRef.querySelector("#recording-indicator"),
      recordToggle: documentRef.querySelector("#record-toggle"),
      reset: documentRef.querySelector("#reset-settings"),
      settingsStatus: documentRef.querySelector("#settings-status"),
    };

    this.renderFingerMarkers();
    this.renderThumbMarkers();
    this.renderAssignmentFields();
    this.cameraAvailable = true;
    this.cameraState = "off";
    this.recordingState = "idle";
  }

  renderFingerMarkers() {
    for (const [index, fingerId] of FINGER_IDS.entries()) {
      const [x, y] = DEMO_POSITIONS[fingerId];
      const marker = this.document.createElement("button");
      marker.type = "button";
      marker.className = "finger-marker";
      marker.dataset.fingerId = fingerId;
      marker.style.setProperty("--marker-x", `${x}%`);
      marker.style.setProperty("--marker-y", `${y}%`);
      marker.style.setProperty(
        "--label-color",
        FINGER_LABEL_COLORS[index],
      );
      marker.setAttribute(
        "aria-label",
        `${FINGER_LABELS[fingerId]} manual contact, keyboard ${index + 1}`,
      );
      marker.innerHTML = `
        <span class="marker-key" aria-hidden="true">${index + 1}</span>
        <span class="marker-label">${FINGER_LABELS[fingerId].replace("Left ", "L · ").replace("Right ", "R · ")}</span>
      `;
      this.elements.fingerOverlay.append(marker);
    }
  }

  renderThumbMarkers() {
    for (const hand of ["left", "right"]) {
      const marker = this.document.createElement("span");
      marker.className = "thumb-marker";
      marker.dataset.thumbHand = hand;
      marker.setAttribute("aria-hidden", "true");
      this.elements.fingerOverlay.append(marker);
    }
  }

  renderAssignmentFields() {
    for (const [index, fingerId] of FINGER_IDS.entries()) {
      const row = this.document.createElement("div");
      row.className = "assignment-row";
      row.dataset.assignment = fingerId;
      const handFingerNumber = (index % 4) + 1;
      const handLabel =
        index === 0 ? "Left hand" : index === 4 ? "Right hand" : "";
      row.innerHTML = `
        <div class="finger-number" aria-hidden="true">
          ${handLabel ? `<span class="hand-number-label">${handLabel}</span>` : ""}
          ${handFingerNumber}
        </div>
        <label class="expression-field">
          <span>${FINGER_LABELS[fingerId]}</span>
          <input
            name="${fingerId}_text"
            data-expression="${fingerId}"
            autocomplete="off"
            aria-describedby="${fingerId}-error"
          />
          <small id="${fingerId}-error" data-error="${fingerId}"></small>
        </label>
      `;
      this.elements.assignmentList.append(row);
    }
  }

  renderConfig(config) {
    for (const fingerId of FINGER_IDS) {
      this.expressionInput(fingerId).value =
        config.assignments[fingerId].text;
      const marker = this.marker(fingerId);
      marker.querySelector(".marker-label").textContent =
        config.assignments[fingerId].text;
      const markerIndex = FINGER_IDS.indexOf(fingerId) + 1;
      marker.setAttribute(
        "aria-label",
        `${FINGER_LABELS[fingerId]}, ${config.assignments[fingerId].text}, manual contact keyboard ${markerIndex}`,
      );
      this.setFieldError(fingerId, "");
    }
  }

  readConfigDraft() {
    return {
      version: 1,
      assignments: Object.fromEntries(
        FINGER_IDS.map((fingerId) => [
          fingerId,
          {
            text: this.expressionInput(fingerId).value,
            language:
              detectExpressionLanguage(
                this.expressionInput(fingerId).value,
              ) ?? "",
          },
        ]),
      ),
      voicePreferences: {
        en: "masculine",
        zh: "feminine",
      },
    };
  }

  bind({ onCameraToggle, onRecordingToggle, onSave, onReset }) {
    this.elements.cameraToggle.addEventListener("click", onCameraToggle);
    this.elements.recordToggle.addEventListener("click", onRecordingToggle);
    this.elements.form.addEventListener("submit", onSave);
    this.elements.reset.addEventListener("click", onReset);
  }

  setCameraState(state, message) {
    const isActive = state === "active";
    this.cameraState = state;
    this.elements.cameraIndicator.classList.toggle("is-on", isActive);
    this.elements.cameraIndicator.classList.toggle("is-off", !isActive);
    this.elements.cameraIndicator.lastElementChild.textContent = isActive
      ? "Camera active"
      : state === "starting"
        ? "Requesting camera"
        : "Camera off";
    this.elements.cameraToggle.textContent = isActive
      ? "Stop camera"
      : "Start camera";
    this.elements.cameraToggle.disabled =
      state === "starting" || (!isActive && !this.cameraAvailable);
    this.elements.cameraPlaceholder.hidden = isActive;
    this.elements.recordToggle.disabled =
      this.recordingState === "saving" ||
      (this.recordingState !== "recording" && !isActive);
    this.elements.cameraMessage.textContent = message;
  }

  setCameraAvailability(available, message = "") {
    this.cameraAvailable = Boolean(available);
    this.elements.cameraToggle.disabled =
      !this.cameraAvailable && this.cameraState !== "active";
    if (message) {
      this.elements.cameraMessage.textContent = message;
    }
  }

  setRecordingState(state, message = "") {
    const isRecording = state === "recording";
    this.recordingState = state;
    this.elements.recordToggle.dataset.state = state;
    this.elements.recordToggle.classList.toggle("is-recording", isRecording);
    this.elements.recordToggle.setAttribute(
      "aria-pressed",
      String(isRecording),
    );
    this.elements.recordToggle.textContent =
      state === "starting"
        ? "Starting…"
        : state === "saving"
          ? "Saving…"
          : isRecording
            ? "Stop recording"
            : "Start recording";
    this.elements.recordToggle.disabled =
      state === "starting" ||
      state === "saving" ||
      (!isRecording && this.cameraState !== "active");
    this.elements.recordingIndicator.hidden = !isRecording;
    this.elements.recordingCaption.textContent = isRecording
      ? "Recording locally"
      : "Not recording";
    if (message) {
      this.elements.cameraMessage.textContent = message;
    }
  }

  applyTrackingEvent(event) {
    const marker = this.marker(event.fingerId);
    if (!marker) {
      return;
    }
    marker.classList.toggle("is-active", event.type === "activation");
    if (event.position) {
      marker.style.setProperty("--marker-x", `${(1 - event.position.x) * 100}%`);
      marker.style.setProperty("--marker-y", `${event.position.y * 100}%`);
    }
  }

  applyFingerSnapshots(snapshots) {
    const byFinger = new Map(
      snapshots.map((snapshot) => [snapshot.fingerId, snapshot]),
    );
    for (const fingerId of FINGER_IDS) {
      const marker = this.marker(fingerId);
      const snapshot = byFinger.get(fingerId);
      marker.classList.toggle(
        "is-active",
        snapshot?.state === "activated" || snapshot?.state === "held",
      );
      marker.dataset.trackingState = snapshot?.state ?? "not_visible";
      if (
        this.elements.fingerOverlay.classList.contains("is-live-tracking") &&
        snapshot?.visible !== true
      ) {
        setLiveMarkerVisibility(marker, false);
      }
    }
    if (
      this.elements.fingerOverlay.classList.contains("is-live-tracking") &&
      !snapshots.some((snapshot) => snapshot?.visible === true)
    ) {
      this.hideLiveMarkers();
    }
  }

  applyHandLandmarks(hands) {
    const byHand = new Map(
      hands
        .filter(
          (hand) =>
            (hand.handedness === "left" ||
              hand.handedness === "right") &&
            Array.isArray(hand.landmarks),
        )
        .map((hand) => [hand.handedness, hand]),
    );
    this.elements.fingerOverlay.dataset.trackedHands = String(byHand.size);

    for (const fingerId of FINGER_IDS) {
      const [handedness, fingerName] = fingerId.split("_");
      const hand = byHand.get(handedness);
      const point =
        hand?.landmarks?.[FINGERTIP_LANDMARK_INDEX[fingerName]];
      const previousPoint =
        hand?.landmarks?.[
          FINGERTIP_PREVIOUS_LANDMARK_INDEX[fingerName]
        ];
      const marker = this.marker(fingerId);
      const visible = isVisualPoint(point);
      setLiveMarkerVisibility(marker, visible);
      if (visible) {
        this.positionMarker(
          marker,
          projectToOuterTip(point, previousPoint),
        );
      }
    }

    for (const hand of ["left", "right"]) {
      const point = byHand.get(hand)?.landmarks?.[4];
      const previousPoint = byHand.get(hand)?.landmarks?.[3];
      const marker = this.thumbMarker(hand);
      const visible = isVisualPoint(point);
      setLiveMarkerVisibility(marker, visible);
      if (visible) {
        this.positionMarker(
          marker,
          projectToOuterTip(point, previousPoint),
        );
      }
    }
  }

  hideLiveMarkers() {
    if (!this.elements.fingerOverlay.classList.contains("is-live-tracking")) {
      return;
    }
    this.elements.fingerOverlay.dataset.trackedHands = "0";
    for (const fingerId of FINGER_IDS) {
      const marker = this.marker(fingerId);
      setLiveMarkerVisibility(marker, false);
      marker.classList.remove("is-active");
      marker.dataset.trackingState = "not_visible";
    }
    for (const hand of ["left", "right"]) {
      const marker = this.thumbMarker(hand);
      setLiveMarkerVisibility(marker, false);
      marker.classList.remove("is-active");
    }
  }

  positionMarker(marker, point) {
    const overlayWidth = this.elements.fingerOverlay.clientWidth;
    const overlayHeight = this.elements.fingerOverlay.clientHeight;
    const videoWidth = this.elements.cameraPreview?.videoWidth;
    const videoHeight = this.elements.cameraPreview?.videoHeight;
    let x = 1 - point.x;
    let y = point.y;

    // The camera uses object-fit: cover. Map MediaPipe's source-video
    // coordinates through the same crop so dots stay on the visible tips.
    if (
      overlayWidth > 0 &&
      overlayHeight > 0 &&
      videoWidth > 0 &&
      videoHeight > 0
    ) {
      const scale = Math.max(
        overlayWidth / videoWidth,
        overlayHeight / videoHeight,
      );
      const renderedWidth = videoWidth * scale;
      const renderedHeight = videoHeight * scale;
      const cropX = (renderedWidth - overlayWidth) / 2;
      const cropY = (renderedHeight - overlayHeight) / 2;
      x = ((1 - point.x) * renderedWidth - cropX) / overlayWidth;
      y = (point.y * renderedHeight - cropY) / overlayHeight;
    }

    marker.style.setProperty(
      "--marker-x",
      `${x * 100}%`,
    );
    marker.style.setProperty("--marker-y", `${y * 100}%`);
  }

  setTrackingMode(mode) {
    const live = mode === "live";
    this.elements.fingerOverlay.classList.toggle(
      "is-live-tracking",
      live,
    );
    this.elements.prototypeBadge.lastChild.textContent = live
      ? " Live hand tracking"
      : " Manual fallback ready";

    if (live) {
      this.hideLiveMarkers();
      return;
    }

    delete this.elements.fingerOverlay.dataset.trackedHands;
    for (const [fingerId, [x, y]] of Object.entries(DEMO_POSITIONS)) {
      const marker = this.marker(fingerId);
      marker.hidden = false;
      marker.style.removeProperty("display");
      marker.classList.remove("is-tracked", "is-active");
      marker.dataset.trackingState = "not_visible";
      marker.style.setProperty("--marker-x", `${x}%`);
      marker.style.setProperty("--marker-y", `${y}%`);
    }
    for (const hand of ["left", "right"]) {
      const marker = this.thumbMarker(hand);
      marker.hidden = true;
      marker.classList.remove(
        "is-tracked",
        "is-active",
      );
    }
  }

  showTrackingStatus({ phase, detectedHands, trackedHands }) {
    if (this.recordingState && this.recordingState !== "idle") {
      return;
    }
    if (phase === "ready") {
      this.elements.cameraMessage.textContent =
        "Hand model ready. Hold one full hand inside the frame.";
      return;
    }
    if (phase !== "tracking") {
      return;
    }
    if (trackedHands > 0) {
      this.elements.fingerOverlay.dataset.trackedHands =
        String(trackedHands);
      const noun = trackedHands === 1 ? "hand" : "hands";
      this.elements.cameraMessage.textContent =
        `${trackedHands} ${noun} tracked locally. Touch a fingertip to its thumb to speak.`;
      return;
    }
    this.hideLiveMarkers();
    if (detectedHands > 0) {
      this.elements.cameraMessage.textContent =
        "Hand landmarks were found, but their left/right label was unavailable. Keep the palm fully visible and try again.";
      return;
    }
    this.elements.cameraMessage.textContent =
      "0 hands detected. Show the full palm and wrist, face the palm toward the camera, and use even lighting.";
  }

  showSpeechPending(activation) {
    if (this.recordingState === "error") {
      return;
    }
    this.elements.cameraMessage.textContent =
      `Contact detected: “${activation.expression}”. Starting voice…`;
  }

  showSpeechRestarted(activation) {
    if (this.recordingState === "error") {
      return;
    }
    this.elements.cameraMessage.textContent =
      `New tap detected. Cutting off the previous phrase and starting “${activation.expression}”…`;
  }

  showSpeechStarted(activation) {
    if (this.recordingState === "error") {
      return;
    }
    this.elements.cameraMessage.textContent =
      `Voice started: “${activation.expression}”. Separate the finger to rearm it.`;
  }

  showSpeechError(activation, error) {
    if (this.recordingState === "error") {
      return;
    }
    this.elements.cameraMessage.textContent =
      `Contact detected for “${activation.expression}”, but audio failed: ${error.message}`;
  }

  showValidationErrors(errors) {
    for (const fingerId of FINGER_IDS) {
      this.setFieldError(fingerId, errors[fingerId] ?? "");
    }
  }

  setSettingsStatus(message, tone = "neutral") {
    this.elements.settingsStatus.textContent = message;
    this.elements.settingsStatus.dataset.tone = tone;
  }

  expressionInput(fingerId) {
    return this.elements.assignmentList.querySelector(
      `[data-expression="${fingerId}"]`,
    );
  }

  marker(fingerId) {
    return this.elements.fingerOverlay.querySelector(
      `[data-finger-id="${fingerId}"]`,
    );
  }

  thumbMarker(hand) {
    return this.elements.fingerOverlay.querySelector(
      `[data-thumb-hand="${hand}"]`,
    );
  }

  setFieldError(fingerId, message) {
    const input = this.expressionInput(fingerId);
    const error = this.elements.assignmentList.querySelector(
      `[data-error="${fingerId}"]`,
    );
    input.setAttribute("aria-invalid", String(Boolean(message)));
    error.textContent = message;
  }
}

function isVisualPoint(point) {
  return (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}
