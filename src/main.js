import { BrowserCamera } from "./adapters/browser-camera.js";
import { ManualContactTracker } from "./adapters/manual-contact-tracker.js";
import { MediaPipeHandTracker } from "./adapters/mediapipe-hand-tracker.js";
import { WebSpeechVoicePort } from "./adapters/web-speech-voice.js";
import { ActivationDispatcher } from "./core/activation-dispatcher.js";
import {
  ConfigRepository,
  normalizeConfig,
  validateConfig,
} from "./core/config.js";
import { voiceIdFor } from "./domain/contracts.js";
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
view.setTrackingMode("manual");

const renderLatency = () => {
  view.showLatency(latency.summary("visual"), latency.summary("audio"));
};

const dispatcher = new ActivationDispatcher({
  getConfig: () => config,
  voicePort,
  onActivation: (activation) => {
    view.showActivation(activation);
    view.showSpeechPending(activation);
    requestAnimationFrame(() => {
      latency.record("visual", performance.now() - activation.confirmedAtMs);
      renderLatency();
    });
  },
  onAudibleStart: (activation, startedAtMs) => {
    view.showSpeechStarted(activation);
    latency.record("audio", startedAtMs - activation.confirmedAtMs);
    renderLatency();
  },
  onSpeechError: (activation, error) => {
    view.showSpeechError(activation, error);
    view.setSettingsStatus(error.message, "error");
  },
  onSpeechBusy: (event, activeActivation) => {
    view.showSpeechBusy(
      activeActivation,
      config.assignments[event.fingerId],
    );
  },
  onSpeechIdle: (activation, error) => {
    if (!error) {
      view.showSpeechReady(activation);
    }
  },
});

const processTrackingEvents = (events) => {
  for (const event of events) {
    view.applyTrackingEvent(event);
  }
  dispatcher.dispatch(events);
};

const manualTracker = new ManualContactTracker({
  onEvents: processTrackingEvents,
});
manualTracker.bind(view.elements.fingerOverlay);

const visionTracker = new MediaPipeHandTracker({
  onEvents: (events) => {
    processTrackingEvents(events);
  },
  onLandmarks: (hands) => view.applyHandLandmarks(hands),
  onSnapshots: (snapshots) => view.applyFingerSnapshots(snapshots),
  onStatus: (status) => view.showTrackingStatus(status),
  onError: (error) => {
    visionTracker.stop();
    camera.stop(view.elements.cameraPreview);
    cameraActive = false;
    manualTracker.setEnabled(true);
    view.setTrackingMode("manual");
    view.setCameraState(
      "error",
      `Hand tracking stopped: ${error.message}. Manual controls remain available.`,
    );
  },
});

view.bind({
  onVoiceTest: () => {
    const assignment = config.assignments.left_index;
    const voiceId = voiceIdFor(
      assignment.language,
      config.voicePreferences[assignment.language],
    );
    let started = false;
    let finished = false;
    view.setVoiceTestState(
      "testing",
      `Testing the browser voice with “${assignment.text}”…`,
    );

    const timeoutId = window.setTimeout(() => {
      if (finished || started) {
        return;
      }
      view.setVoiceTestState(
        "idle",
        "The browser did not start speech within three seconds. Check site audio permission, mute settings, and the selected output device.",
      );
    }, 3000);

    try {
      Promise.resolve(
        voicePort.speak({
          activationId: `voice-test-${Date.now()}`,
          text: assignment.text,
          language: assignment.language,
          voiceId,
          onAudibleStart: () => {
            started = true;
            view.setVoiceTestState(
              "playing",
              `Browser speech started for “${assignment.text}”.`,
            );
          },
          onError: (error) => {
            finished = true;
            window.clearTimeout(timeoutId);
            view.setVoiceTestState(
              "idle",
              `Voice test failed: ${error.message}`,
            );
          },
        }),
      )
        .then(() => {
          finished = true;
          window.clearTimeout(timeoutId);
          view.setVoiceTestState(
            "idle",
            started
              ? "Voice test finished. Audio is working; try a fingertip contact next."
              : "Speech ended without an audible-start signal from this browser.",
          );
        })
        .catch((error) => {
          finished = true;
          window.clearTimeout(timeoutId);
          view.setVoiceTestState(
            "idle",
            `Voice test failed: ${error.message}`,
          );
        });
    } catch (error) {
      finished = true;
      window.clearTimeout(timeoutId);
      view.setVoiceTestState(
        "idle",
        `Voice test failed: ${error.message}`,
      );
    }
  },
  onCameraToggle: async () => {
    if (cameraActive) {
      visionTracker.stop();
      camera.stop(view.elements.cameraPreview);
      cameraActive = false;
      manualTracker.setEnabled(true);
      view.setTrackingMode("manual");
      view.setCameraState(
        "off",
        "Camera stopped. No frames were stored. Manual controls are available.",
      );
      return;
    }

    view.setCameraState(
      "starting",
      "Your browser may ask for camera permission.",
    );
    try {
      await camera.start(view.elements.cameraPreview);
      view.setCameraState(
        "starting",
        "Loading the local hand-landmark model…",
      );
      await visionTracker.start(view.elements.cameraPreview);
      cameraActive = true;
      manualTracker.setEnabled(false);
      view.setTrackingMode("live");
      view.setCameraState(
        "active",
        "Camera and on-device hand tracking are active. Frames remain local.",
      );
    } catch (error) {
      visionTracker.stop();
      camera.stop(view.elements.cameraPreview);
      cameraActive = false;
      manualTracker.setEnabled(true);
      view.setTrackingMode("manual");
      view.setCameraState(
        "error",
        `Camera or hand tracking could not start: ${error.message}`,
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
  manualTracker.destroy();
  visionTracker.destroy();
  camera.stop(view.elements.cameraPreview);
});
