const ONBOARDING_STORAGE_KEY = "taptalk.onboarding.v1";
const READY_DISPLAY_MS = 1400;

const SLIDES = Object.freeze([
  Object.freeze({
    alt: "Two furry kitten paws representing eight editable fingertip words.",
    src: "/assets/onboarding/slide-1.png",
  }),
  Object.freeze({
    alt: "A furry paw-shaped hand touching one fingertip to its side thumb.",
    src: "/assets/onboarding/slide-2.png",
  }),
  Object.freeze({
    alt: "A TapTalk recording becoming an MP4 saved in the Downloads folder.",
    src: "/assets/onboarding/slide-3.png",
  }),
]);

export function mapVoiceProgress(modelId, percent) {
  if (!Number.isFinite(percent)) {
    return null;
  }
  const bounded = Math.min(100, Math.max(0, percent));
  return modelId.startsWith("zh_")
    ? Math.round(50 + bounded / 2)
    : Math.round(bounded / 2);
}

export class FirstRunExperience {
  constructor({
    documentRef = document,
    storage = globalThis.localStorage,
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
    cancelSchedule = (timerId) => globalThis.clearTimeout(timerId),
    onCameraAvailabilityChange = () => {},
    onGuideCompletionChange = () => {},
  } = {}) {
    this.storage = storage;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.onCameraAvailabilityChange = onCameraAvailabilityChange;
    this.onGuideCompletionChange = onGuideCompletionChange;
    this.elements = {
      guide: documentRef.querySelector("#onboarding-guide"),
      guideBack: documentRef.querySelector("#onboarding-back"),
      guideImage: documentRef.querySelector("#onboarding-image"),
      guideNext: documentRef.querySelector("#onboarding-next"),
      guideStatus: documentRef.querySelector("#onboarding-status"),
      stage: documentRef.querySelector("#camera-stage"),
      voice: documentRef.querySelector("#voice-readiness"),
      voiceBar: documentRef.querySelector("#voice-progress-bar"),
      voiceDetail: documentRef.querySelector("#voice-readiness-detail"),
      voicePercent: documentRef.querySelector("#voice-readiness-percent"),
      voiceTitle: documentRef.querySelector("#voice-readiness-title"),
    };
    this.guideComplete = this.readGuideCompletion();
    this.slideIndex = 0;
    this.voiceReady = false;
    this.unlocked = false;
    this.readyTimer = null;
    this.bind();
  }

  start() {
    this.elements.stage?.classList.add("is-onboarding");
    this.onGuideCompletionChange(this.guideComplete);
    this.onCameraAvailabilityChange(
      false,
      this.guideComplete
        ? "Preparing local English and Mandarin voices…"
        : "Complete the three-slide guide before starting the camera.",
    );
    if (this.guideComplete) {
      this.showVoicePreparation();
      return;
    }
    this.elements.voice.hidden = true;
    this.elements.guide.hidden = false;
    this.renderSlide();
  }

  setVoiceProgress({ modelId, percent }) {
    if (this.unlocked) {
      return;
    }
    const overallPercent = mapVoiceProgress(modelId, percent);
    const language = modelId.startsWith("zh_") ? "Mandarin" : "English";
    this.voiceReady = false;
    this.elements.voice.dataset.state = "loading";
    this.elements.voiceTitle.textContent = "Preparing your voices…";
    this.elements.voiceDetail.textContent =
      overallPercent === null
        ? `Downloading ${language} locally`
        : `Downloading ${language} locally · ${overallPercent}%`;
    this.setProgress(overallPercent);
    if (this.guideComplete) {
      this.showVoicePreparation();
    }
  }

  setVoicePreparing() {
    if (this.unlocked) {
      return;
    }
    this.voiceReady = false;
    this.elements.voice.dataset.state = "loading";
    this.elements.voiceTitle.textContent = "Preparing your voices…";
    this.elements.voiceDetail.textContent =
      "English and Mandarin are loading locally";
    this.setProgress(null);
    if (this.guideComplete) {
      this.showVoicePreparation();
    }
  }

  setVoiceReady() {
    if (this.unlocked) {
      return;
    }
    this.voiceReady = true;
    if (this.guideComplete) {
      this.showReadyThenUnlock();
    }
  }

  setVoiceError(message) {
    if (this.unlocked) {
      return;
    }
    this.voiceReady = false;
    this.elements.voice.dataset.state = "error";
    this.elements.voiceTitle.textContent = "Voice preparation failed";
    this.elements.voiceDetail.textContent =
      `${message} Refresh the page to try again.`;
    this.setProgress(null);
    if (this.guideComplete) {
      this.showVoicePreparation();
    }
  }

  nextSlide() {
    if (this.slideIndex < SLIDES.length - 1) {
      this.slideIndex += 1;
      this.renderSlide();
      return;
    }
    this.completeGuide();
  }

  previousSlide() {
    if (this.slideIndex === 0) {
      return;
    }
    this.slideIndex -= 1;
    this.renderSlide();
  }

  destroy() {
    if (this.readyTimer !== null) {
      this.cancelSchedule(this.readyTimer);
      this.readyTimer = null;
    }
  }

  hideForLocalPreview() {
    this.unlocked = true;
    this.elements.guide.hidden = true;
    this.elements.voice.hidden = true;
    this.elements.stage?.classList.remove("is-onboarding");
  }

  bind() {
    this.elements.guideBack.addEventListener(
      "click",
      () => this.previousSlide(),
    );
    this.elements.guideNext.addEventListener(
      "click",
      () => this.nextSlide(),
    );
    this.elements.guide.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        this.previousSlide();
      }
      if (event.key === "ArrowRight") {
        this.nextSlide();
      }
    });
  }

  renderSlide() {
    const slide = SLIDES[this.slideIndex];
    this.elements.guide.dataset.slide = String(this.slideIndex + 1);
    this.elements.guideImage.src = slide.src;
    this.elements.guideImage.alt = slide.alt;
    this.elements.guideBack.hidden = this.slideIndex === 0;
    this.elements.guideNext.setAttribute(
      "aria-label",
      this.slideIndex === SLIDES.length - 1
        ? "Finish the TapTalk guide"
        : `Go to TapTalk guide slide ${this.slideIndex + 2}`,
    );
    this.elements.guideStatus.textContent =
      `TapTalk guide slide ${this.slideIndex + 1} of ${SLIDES.length}.`;
  }

  completeGuide() {
    this.guideComplete = true;
    try {
      this.storage?.setItem(ONBOARDING_STORAGE_KEY, "completed");
    } catch {
      // The guide can finish even when browser storage is unavailable.
    }
    this.onGuideCompletionChange(true);
    this.elements.guide.hidden = true;
    if (this.voiceReady) {
      this.showReadyThenUnlock();
      return;
    }
    this.onCameraAvailabilityChange(
      false,
      "Preparing local English and Mandarin voices…",
    );
    this.showVoicePreparation();
  }

  showVoicePreparation() {
    this.elements.guide.hidden = true;
    this.elements.voice.hidden = false;
  }

  showReadyThenUnlock() {
    this.showVoicePreparation();
    this.onCameraAvailabilityChange(
      false,
      "Voices ready. Camera controls are unlocking…",
    );
    this.elements.voice.dataset.state = "ready";
    this.elements.voiceTitle.textContent = "Voices ready ✓";
    this.elements.voiceDetail.textContent =
      "English and Mandarin are ready locally";
    this.setProgress(100);
    if (this.readyTimer !== null) {
      return;
    }
    this.readyTimer = this.schedule(() => {
      this.readyTimer = null;
      this.unlocked = true;
      this.elements.voice.hidden = true;
      this.elements.stage?.classList.remove("is-onboarding");
      this.onCameraAvailabilityChange(
        true,
        "Voices ready. Start the camera when you are ready.",
      );
    }, READY_DISPLAY_MS);
  }

  setProgress(percent) {
    const determinate = Number.isFinite(percent);
    this.elements.voiceBar.style.setProperty(
      "--voice-progress",
      `${determinate ? percent : 12}%`,
    );
    this.elements.voiceBar.dataset.indeterminate = String(!determinate);
    this.elements.voiceBar.setAttribute(
      "aria-valuenow",
      determinate ? String(percent) : "0",
    );
    this.elements.voicePercent.textContent =
      determinate ? `${percent}%` : "…";
  }

  readGuideCompletion() {
    try {
      return this.storage?.getItem(ONBOARDING_STORAGE_KEY) === "completed";
    } catch {
      return false;
    }
  }
}
