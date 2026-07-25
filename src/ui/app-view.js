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
    };

    this.renderFingerMarkers();
    this.renderAssignmentFields();
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

  bind({ onCameraToggle, onSave, onReset }) {
    this.elements.cameraToggle.addEventListener("click", onCameraToggle);
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
      const visible = Boolean(snapshot?.visible && snapshot.fingertip);
      marker.classList.toggle("is-tracked", visible);
      marker.classList.toggle(
        "is-active",
        snapshot?.state === "activated" || snapshot?.state === "held",
      );
      marker.dataset.trackingState = snapshot?.state ?? "not_visible";
      if (visible) {
        marker.style.setProperty(
          "--marker-x",
          `${(1 - snapshot.fingertip.x) * 100}%`,
        );
        marker.style.setProperty(
          "--marker-y",
          `${snapshot.fingertip.y * 100}%`,
        );
      }
    }
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
    }
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
