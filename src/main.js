import { BrowserCamera } from "./adapters/browser-camera.js";
import { BrowserRecorder } from "./adapters/browser-recorder.js";
import { ManualContactTracker } from "./adapters/manual-contact-tracker.js";
import { MediaPipeHandTracker } from "./adapters/mediapipe-hand-tracker.js";
import { PiperVoicePort } from "./adapters/piper-voice.js";
import { ActivationDispatcher } from "./core/activation-dispatcher.js";
import {
  ConfigRepository,
  normalizeConfig,
  validateConfig,
} from "./core/config.js";
import { AppView } from "./ui/app-view.js";
import { FirstRunExperience } from "./ui/first-run-experience.js";
import {
  remove as removePiperVoice,
  TtsSession,
} from "/vendor/piper/piper-tts-web.js";

const view = new AppView();
const repository = new ConfigRepository(window.localStorage);
const camera = new BrowserCamera();
const recorder = new BrowserRecorder();
const firstRunExperience = new FirstRunExperience({
  storage: window.localStorage,
  onCameraAvailabilityChange: (available, message) => {
    view.setCameraAvailability(available, message);
  },
});
const supportNotice = document.querySelector("#support-notice");
const supportNoticeDismiss = document.querySelector(
  "#support-notice-dismiss",
);
const supportNoticeStorageKey = "taptalk.support-notice.v1";
const voicePort = new PiperVoicePort({
  TtsSession,
  removeVoice: removePiperVoice,
  onProgress: ({ modelId, percent }) => {
    const language = modelId.startsWith("zh_") ? "Mandarin" : "English";
    firstRunExperience.setVoiceProgress({ modelId, percent });
    view.setSettingsStatus(
      percent === null
        ? `Downloading the approved ${language} voice…`
        : `Downloading the approved ${language} voice… ${percent}%`,
      "success",
    );
  },
});

let config = repository.load();
let cameraActive = false;
let recordingActive = false;
view.renderConfig(config);
view.setTrackingMode("manual");
view.setRecordingState("idle");
firstRunExperience.start();

const showFirstVisitSupportNotice = () => {
  if (!supportNotice || !supportNoticeDismiss) {
    return;
  }

  let noticeDismissed = false;
  try {
    noticeDismissed =
      window.localStorage.getItem(supportNoticeStorageKey) === "dismissed";
  } catch {
    // The notice can still be shown when browser storage is unavailable.
  }

  if (noticeDismissed) {
    return;
  }

  supportNotice.showModal();
  supportNoticeDismiss.addEventListener(
    "click",
    () => {
      try {
        window.localStorage.setItem(
          supportNoticeStorageKey,
          "dismissed",
        );
      } catch {
        // Closing the notice should never depend on browser storage.
      }
      supportNotice.close();
    },
    { once: true },
  );
};

showFirstVisitSupportNotice();

const warmVoiceAssignments = () => {
  firstRunExperience.setVoicePreparing();
  view.setSettingsStatus(
    "Preparing the two approved Piper voices locally…",
    "success",
  );
  void voicePort
    .warmAssignments(config.assignments)
    .then(() => {
      firstRunExperience.setVoiceReady();
      view.setSettingsStatus(
        "Piper English and Mandarin voices are ready.",
        "success",
      );
    })
    .catch((error) => {
      firstRunExperience.setVoiceError(error.message);
      view.setSettingsStatus(
        `Local Piper speech preparation failed: ${error.message}`,
        "error",
      );
    });
};

const dispatcher = new ActivationDispatcher({
  getConfig: () => config,
  voicePort,
  onActivation: (activation) => {
    view.showSpeechPending(activation);
  },
  onAudibleStart: (activation) => {
    view.showSpeechStarted(activation);
  },
  onSpeechError: (activation, error) => {
    view.showSpeechError(activation, error);
    view.setSettingsStatus(error.message, "error");
  },
  onSpeechInterrupted: (_interruptedActivation, replacementActivation) => {
    view.showSpeechRestarted(replacementActivation);
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

const stopRecordingAndSave = async () => {
  if (!recordingActive) {
    return null;
  }
  view.setRecordingState(
    "saving",
    "Finishing the local recording…",
  );
  try {
    const blob = await recorder.stop();
    const filename = recorder.download(blob);
    recordingActive = false;
    view.setRecordingState(
      "idle",
      `Saved ${filename} to your browser downloads. Nothing was uploaded.`,
    );
    return filename;
  } catch (error) {
    recordingActive = false;
    view.setRecordingState("error", error.message);
    return null;
  } finally {
    voicePort.finishRecording();
  }
};

const visionTracker = new MediaPipeHandTracker({
  onEvents: (events) => {
    processTrackingEvents(events);
  },
  onLandmarks: (hands) => view.applyHandLandmarks(hands),
  onSnapshots: (snapshots) => view.applyFingerSnapshots(snapshots),
  onStatus: (status) => view.showTrackingStatus(status),
  onError: async (error) => {
    const filename = await stopRecordingAndSave();
    visionTracker.stop();
    camera.stop(view.elements.cameraPreview);
    cameraActive = false;
    manualTracker.setEnabled(true);
    view.setTrackingMode("manual");
    view.setCameraState(
      "error",
      `Hand tracking stopped: ${error.message}.${filename ? ` ${filename} was saved locally.` : ""} Manual controls remain available.`,
    );
  },
});

view.bind({
  onRecordingToggle: async () => {
    if (recordingActive) {
      await stopRecordingAndSave();
      return;
    }
    view.setRecordingState(
      "starting",
      "Starting local MP4 recording with TapTalk speech audio.",
    );
    try {
      await voicePort.prepareRecording();
      const recording = await recorder.start({
        cameraStream: camera.stream,
        audioStream: voicePort.recordingStream,
        videoElement: view.elements.cameraPreview,
        overlayElement: view.elements.fingerOverlay,
      });
      recordingActive = true;
      view.setRecordingState(
        "recording",
        `Recording the mirrored camera, fingertip labels, and TapTalk speech locally as ${
          recording.mimeType.includes("mp4") ? "MP4" : "WebM"
        }.`,
      );
    } catch (error) {
      voicePort.finishRecording();
      view.setRecordingState("error", error.message);
    }
  },
  onCameraToggle: async () => {
    if (cameraActive) {
      const filename = await stopRecordingAndSave();
      visionTracker.stop();
      camera.stop(view.elements.cameraPreview);
      cameraActive = false;
      manualTracker.setEnabled(true);
      view.setTrackingMode("manual");
      view.setCameraState(
        "off",
        `Camera stopped.${filename ? ` ${filename} was saved locally.` : " No recording was saved."}`,
      );
      return;
    }

    view.setRecordingState("idle");
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
        "Camera and on-device hand tracking are active. Recording is off.",
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
    warmVoiceAssignments();
    view.setSettingsStatus(
      "Saved on this device. Nothing was uploaded.",
      "success",
    );
  },
  onReset: () => {
    const confirmed = window.confirm(
      "Remove all TapTalk assignments stored on this device?",
    );
    if (!confirmed) {
      return;
    }
    config = repository.reset();
    view.renderConfig(config);
    warmVoiceAssignments();
    view.setSettingsStatus(
      "Local data removed and defaults restored.",
      "success",
    );
  },
});

warmVoiceAssignments();

window.addEventListener("pagehide", () => {
  firstRunExperience.destroy();
  manualTracker.destroy();
  visionTracker.destroy();
  if (recordingActive) {
    void recorder.stop();
  }
  voicePort.destroy();
  camera.stop(view.elements.cameraPreview);
});
