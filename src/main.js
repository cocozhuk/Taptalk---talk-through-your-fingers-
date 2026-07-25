import { BrowserCamera } from "./adapters/browser-camera.js";
import { ManualContactTracker } from "./adapters/manual-contact-tracker.js";
import { WebSpeechVoicePort } from "./adapters/web-speech-voice.js";
import { ActivationDispatcher } from "./core/activation-dispatcher.js";
import {
  ConfigRepository,
  normalizeConfig,
  validateConfig,
} from "./core/config.js";
import { LatencyMonitor } from "./core/latency-monitor.js";
import { AppView } from "./ui/app-view.js";

const view = new AppView();
const repository = new ConfigRepository(window.localStorage);
const camera = new BrowserCamera();
const voicePort = new WebSpeechVoicePort();
const latency = new LatencyMonitor();

let config = repository.load();
let cameraActive = false;
view.renderConfig(config);

const renderLatency = () => {
  view.showLatency(latency.summary("visual"), latency.summary("audio"));
};

const dispatcher = new ActivationDispatcher({
  getConfig: () => config,
  voicePort,
  onActivation: (activation) => {
    view.showActivation(activation);
    requestAnimationFrame(() => {
      latency.record("visual", performance.now() - activation.confirmedAtMs);
      renderLatency();
    });
  },
  onAudibleStart: (activation, startedAtMs) => {
    latency.record("audio", startedAtMs - activation.confirmedAtMs);
    renderLatency();
  },
  onSpeechError: (_activation, error) => {
    view.setSettingsStatus(error.message, "error");
  },
});

const tracker = new ManualContactTracker({
  onEvents: (events) => {
    for (const event of events) {
      view.applyTrackingEvent(event);
    }
    dispatcher.dispatch(events);
  },
});
tracker.bind(view.elements.fingerOverlay);

view.bind({
  onCameraToggle: async () => {
    if (cameraActive) {
      camera.stop(view.elements.cameraPreview);
      cameraActive = false;
      view.setCameraState(
        "off",
        "Camera stopped. No frames were stored.",
      );
      return;
    }

    view.setCameraState(
      "starting",
      "Your browser may ask for camera permission.",
    );
    try {
      await camera.start(view.elements.cameraPreview);
      cameraActive = true;
      view.setCameraState(
        "active",
        "Camera is active locally. Contact tracking is still simulated.",
      );
    } catch (error) {
      cameraActive = false;
      view.setCameraState(
        "error",
        `Camera could not start: ${error.message}`,
      );
    }
  },
  onSave: (event) => {
    event.preventDefault();
    const draft = view.readConfigDraft();
    const validation = validateConfig(draft);
    view.showValidationErrors(validation.errors);
    if (!validation.valid) {
      view.setSettingsStatus(
        "Fix the highlighted assignments before saving.",
        "error",
      );
      return;
    }
    config = repository.save(normalizeConfig(draft));
    view.renderConfig(config);
    view.setSettingsStatus(
      "Saved on this device. Nothing was uploaded.",
      "success",
    );
  },
  onReset: () => {
    const confirmed = window.confirm(
      "Remove all TapTalk assignments and voice preferences stored on this device?",
    );
    if (!confirmed) {
      return;
    }
    config = repository.reset();
    view.renderConfig(config);
    view.setSettingsStatus(
      "Local data removed and defaults restored.",
      "success",
    );
  },
});

window.addEventListener("pagehide", () => {
  tracker.destroy();
  camera.stop(view.elements.cameraPreview);
});

