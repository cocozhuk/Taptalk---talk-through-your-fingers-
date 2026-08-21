export const IPHONE_SCREENS = Object.freeze({
  LIVE: "live",
  SETUP: "setup",
  TUTORIAL: "tutorial",
});

export class IPhoneFlow {
  constructor({
    view,
    saveAssignments,
    startCamera,
    stopCamera,
  }) {
    this.view = view;
    this.saveAssignments = saveAssignments;
    this.startCamera = startCamera;
    this.stopCamera = stopCamera;
    this.preparingChoice = false;
    this.launchingCamera = false;
    this.exitingCamera = false;
  }

  handleGuideCompletion(complete) {
    if (!this.view.isIPhoneMode()) {
      return;
    }
    this.view.setMobileScreen(
      complete ? IPHONE_SCREENS.SETUP : IPHONE_SCREENS.TUTORIAL,
    );
  }

  async continueToCamera() {
    if (!this.view.isIPhoneMode() || this.preparingChoice) {
      return false;
    }
    this.preparingChoice = true;
    this.view.setMobileLaunchBusy(true);
    try {
      const ready = await this.saveAssignments();
      if (ready) {
        this.view.openMobileCameraChoice();
      }
      return ready;
    } finally {
      this.view.setMobileLaunchBusy(false);
      this.preparingChoice = false;
    }
  }

  async chooseCamera({ record }) {
    if (!this.view.isIPhoneMode() || this.launchingCamera) {
      return false;
    }
    this.launchingCamera = true;
    this.view.setMobileChoiceBusy(true);
    this.view.closeMobileCameraChoice();
    this.view.setMobileLaunchBusy(true);
    this.view.setSettingsStatus(
      record
        ? "Starting the camera and local recording…"
        : "Starting the camera…",
      "success",
    );
    try {
      const started = await this.startCamera({ record: Boolean(record) });
      if (started) {
        this.view.setMobileScreen(IPHONE_SCREENS.LIVE);
      } else {
        this.view.setSettingsStatus(
          this.view.currentCameraMessage(),
          "error",
        );
      }
      return started;
    } finally {
      this.view.setMobileLaunchBusy(false);
      this.launchingCamera = false;
    }
  }

  async exitCamera() {
    if (!this.view.isIPhoneMode() || this.exitingCamera) {
      return false;
    }
    this.exitingCamera = true;
    try {
      await this.stopCamera({ returnToSetup: true });
      return true;
    } finally {
      this.exitingCamera = false;
    }
  }
}
