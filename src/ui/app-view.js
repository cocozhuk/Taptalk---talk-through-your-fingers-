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
      reset: documentRef.querySelector("#reset-settings"),
      settingsStatus: documentRef.querySelector("#settings-status"),
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

