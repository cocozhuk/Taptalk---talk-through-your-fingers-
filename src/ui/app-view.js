import {
  FINGER_IDS,
  FINGER_LABELS,
  LANGUAGES,
  VOICE_IDENTITIES,
} from "../domain/contracts.js";

const DEMO_POSITIONS = Object.freeze({
  left_index: [66, 26],
  left_middle: [73, 18],
  left_ring: [81, 23],
  left_pinky: [88, 32],
  right_index: [34, 26],
  right_middle: [27, 18],
  right_ring: [19, 23],
  right_pinky: [12, 32],
});

const CONTACT_STATE_LABELS = Object.freeze({
  separated: "ready",
  approaching: "getting closer",
  contact_candidate: "contact — hold briefly",
  activated: "activated",
  held: "held — separate to rearm",
});

const FINGER_LABEL_COLORS = Object.freeze([
  "#ff4ad8",
  "#78ff38",
  "#3467ff",
  "#ffb21d",
  "#44ddff",
  "#bb72ff",
  "#52ff9b",
  "#ff6a45",
]);

const FINGERTIP_LANDMARK_INDEX = Object.freeze({
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
});

export class AppView {
  constructor(documentRef = document) {
    this.document = documentRef;
    this.elements = {
      assignmentList: documentRef.querySelector("#assignment-list"),
      audioLatency: documentRef.querySelector("#audio-latency"),
      cameraIndicator: documentRef.querySelector("#camera-indicator"),
      cameraMessage: documentRef.querySelector("#camera-message"),
      cameraPlaceholder: documentRef.querySelector("#camera-placeholder"),
      cameraPreview: documentRef.querySelector("#camera-preview"),
      cameraToggle: documentRef.querySelector("#camera-toggle"),
      englishVoice: documentRef.querySelector("#english-voice"),
      expression: documentRef.querySelector("#activation-expression"),
      expressionDetail: documentRef.querySelector("#activation-detail"),
      fingerOverlay: documentRef.querySelector("#finger-overlay"),
      form: documentRef.querySelector("#settings-form"),
      latencySamples: documentRef.querySelector("#latency-samples"),
      mandarinVoice: documentRef.querySelector("#mandarin-voice"),
      prototypeBadge: documentRef.querySelector("#prototype-badge"),
      reset: documentRef.querySelector("#reset-settings"),
      settingsStatus: documentRef.querySelector("#settings-status"),
      trackingNote: documentRef.querySelector("#tracking-note"),
      visualLatency: documentRef.querySelector("#visual-latency"),
      voiceTest: documentRef.querySelector("#voice-test"),
    };

    this.renderFingerMarkers();
    this.renderThumbMarkers();
    this.renderAssignmentFields();
    this.contactMeterKey = "";
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
      row.innerHTML = `
        <div class="finger-number" aria-hidden="true">${index + 1}</div>
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
        <label class="language-field">
          <span class="sr-only">Language for ${FINGER_LABELS[fingerId]}</span>
          <select name="${fingerId}_language" data-language="${fingerId}">
            <option value="en">${LANGUAGES.en}</option>
            <option value="zh">${LANGUAGES.zh}</option>
          </select>
        </label>
      `;
      this.elements.assignmentList.append(row);
    }
  }

  renderConfig(config) {
    for (const fingerId of FINGER_IDS) {
      this.expressionInput(fingerId).value =
        config.assignments[fingerId].text;
      this.languageInput(fingerId).value =
        config.assignments[fingerId].language;
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
    this.elements.englishVoice.value = config.voicePreferences.en;
    this.elements.mandarinVoice.value = config.voicePreferences.zh;
  }

  readConfigDraft() {
    return {
      version: 1,
      assignments: Object.fromEntries(
        FINGER_IDS.map((fingerId) => [
          fingerId,
          {
            text: this.expressionInput(fingerId).value,
            language: this.languageInput(fingerId).value,
          },
        ]),
      ),
      voicePreferences: {
        en: this.elements.englishVoice.value,
        zh: this.elements.mandarinVoice.value,
      },
    };
  }

  bind({ onCameraToggle, onVoiceTest, onSave, onReset }) {
    this.elements.cameraToggle.addEventListener("click", onCameraToggle);
    this.elements.voiceTest.addEventListener("click", onVoiceTest);
    this.elements.form.addEventListener("submit", onSave);
    this.elements.reset.addEventListener("click", onReset);
  }

  setCameraState(state, message) {
    const isActive = state === "active";
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
    this.elements.cameraToggle.disabled = state === "starting";
    this.elements.cameraPlaceholder.hidden = isActive;
    this.elements.cameraMessage.textContent = message;
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
    }
    this.showContactMeter(snapshots);
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

    for (const fingerId of FINGER_IDS) {
      const [handedness, fingerName] = fingerId.split("_");
      const hand = byHand.get(handedness);
      const point =
        hand?.landmarks?.[FINGERTIP_LANDMARK_INDEX[fingerName]];
      const marker = this.marker(fingerId);
      const visible = isVisualPoint(point);
      marker.classList.toggle("is-tracked", visible);
      if (visible) {
        this.positionMarker(marker, point);
      }
    }

    for (const hand of ["left", "right"]) {
      const point = byHand.get(hand)?.landmarks?.[4];
      const marker = this.thumbMarker(hand);
      const visible = isVisualPoint(point);
      marker.classList.toggle("is-tracked", visible);
      if (visible) {
        this.positionMarker(marker, point);
      }
    }
  }

  positionMarker(marker, point) {
    marker.style.setProperty(
      "--marker-x",
      `${(1 - point.x) * 100}%`,
    );
    marker.style.setProperty("--marker-y", `${point.y * 100}%`);
  }

  showContactMeter(snapshots) {
    const closest = snapshots
      .filter(
        (snapshot) =>
          snapshot.visible && Number.isFinite(snapshot.distanceRatio),
      )
      .sort(
        (first, second) =>
          first.distanceRatio - second.distanceRatio,
      )[0];
    if (!closest) {
      return;
    }

    const roundedGap = Math.round(closest.distanceRatio * 20) / 20;
    const stateLabel =
      CONTACT_STATE_LABELS[closest.state] ?? "waiting for separation";
    const key = `${closest.fingerId}:${roundedGap}:${stateLabel}`;
    if (key === this.contactMeterKey) {
      return;
    }
    this.contactMeterKey = key;

    const heading = this.document.createElement("strong");
    heading.textContent = "Contact meter: ";
    this.elements.trackingNote.replaceChildren(
      heading,
      this.document.createTextNode(
        `${FINGER_LABELS[closest.fingerId]} · ${stateLabel} · gap ${roundedGap.toFixed(2)}.`,
      ),
    );
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
    this.elements.trackingNote.innerHTML = live
      ? "<strong>Live tracking:</strong> touch a fingertip to the thumb on the same hand. Separate them before using that finger again."
      : "<strong>Manual fallback:</strong> start the camera for local hand landmarks, or press and hold a marker or keys 1–8; release to rearm.";

    if (!live) {
      for (const [fingerId, [x, y]] of Object.entries(DEMO_POSITIONS)) {
        const marker = this.marker(fingerId);
        marker.classList.remove("is-tracked", "is-active");
        marker.dataset.trackingState = "not_visible";
        marker.style.setProperty("--marker-x", `${x}%`);
        marker.style.setProperty("--marker-y", `${y}%`);
      }
      for (const hand of ["left", "right"]) {
        this.thumbMarker(hand).classList.remove(
          "is-tracked",
          "is-active",
        );
      }
    }
  }

  setVoiceTestState(state, message) {
    const busy = state === "testing" || state === "playing";
    this.elements.voiceTest.disabled = busy;
    this.elements.voiceTest.textContent =
      state === "testing"
        ? "Starting voice…"
        : state === "playing"
          ? "Voice playing…"
          : "Test voice";
    this.elements.cameraMessage.textContent = message;
  }

  showTrackingStatus({ phase, detectedHands, trackedHands }) {
    if (phase === "ready") {
      this.elements.cameraMessage.textContent =
        "Hand model ready. Hold one full hand inside the frame.";
      return;
    }
    if (phase !== "tracking") {
      return;
    }
    if (trackedHands > 0) {
      const noun = trackedHands === 1 ? "hand" : "hands";
      this.elements.cameraMessage.textContent =
        `${trackedHands} ${noun} tracked locally. Touch a fingertip to its thumb to speak.`;
      return;
    }
    if (detectedHands > 0) {
      this.elements.cameraMessage.textContent =
        "Hand landmarks were found, but their left/right label was unavailable. Keep the palm fully visible and try again.";
      return;
    }
    this.elements.cameraMessage.textContent =
      "0 hands detected. Show the full palm and wrist, face the palm toward the camera, and use even lighting.";
  }

  showActivation(activation) {
    const identity = VOICE_IDENTITIES[activation.voiceId];
    this.elements.expression.textContent = activation.expression;
    this.elements.expressionDetail.textContent =
      `${FINGER_LABELS[activation.fingerId]} · ${identity.name} · ${LANGUAGES[activation.language]}`;
  }

  showSpeechPending(activation) {
    this.elements.cameraMessage.textContent =
      `Contact detected: “${activation.expression}”. Starting voice…`;
  }

  showSpeechStarted(activation) {
    this.elements.cameraMessage.textContent =
      `Voice started: “${activation.expression}”. Separate the finger to rearm it.`;
  }

  showSpeechError(activation, error) {
    this.elements.cameraMessage.textContent =
      `Contact detected for “${activation.expression}”, but audio failed: ${error.message}`;
  }

  showLatency(visual, audio) {
    this.elements.visualLatency.textContent = formatLatency(visual.p50Ms);
    this.elements.audioLatency.textContent = formatLatency(audio.p50Ms);
    this.elements.latencySamples.textContent =
      `${visual.count} visual / ${audio.count} audible samples · p95 ${formatLatency(audio.p95Ms)}`;
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

  languageInput(fingerId) {
    return this.elements.assignmentList.querySelector(
      `[data-language="${fingerId}"]`,
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

function formatLatency(value) {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function isVisualPoint(point) {
  return (
    point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}
