const MIME_TYPES = Object.freeze([
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
]);

const RECORDING_COLORS = Object.freeze({
  cream: "#fff8e8",
  ink: "#22233a",
  red: "#ff1018",
  redDark: "#bc0008",
  white: "#ffffff",
});

function preferredMimeType(MediaRecorder) {
  if (typeof MediaRecorder?.isTypeSupported !== "function") {
    return "";
  }
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function recordingFilename(mimeType, recordedAt) {
  const extension = mimeType.includes("mp4") ? "mp4" : "webm";
  const timestamp = recordedAt
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  return `TapTalk-${timestamp}.${extension}`;
}

function isVisibleMarker(marker, computedStyle) {
  return (
    marker.hidden !== true &&
    computedStyle.display !== "none" &&
    computedStyle.visibility !== "hidden" &&
    computedStyle.opacity !== "0"
  );
}

export function projectSourcePointToRecording(
  point,
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
) {
  if (
    !Number.isFinite(point?.x) ||
    !Number.isFinite(point?.y) ||
    !(sourceWidth > 0) ||
    !(sourceHeight > 0) ||
    !(targetWidth > 0) ||
    !(targetHeight > 0)
  ) {
    return null;
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  let cropX = 0;
  let cropY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  return {
    x: ((point.x * sourceWidth - cropX) / cropWidth) * targetWidth,
    y: ((point.y * sourceHeight - cropY) / cropHeight) * targetHeight,
  };
}

export class BrowserRecorder {
  constructor({
    MediaRecorder = globalThis.MediaRecorder,
    MediaStream = globalThis.MediaStream,
    URL = globalThis.URL,
    documentRef = globalThis.document,
    getComputedStyle = globalThis.getComputedStyle,
    requestFrame = (callback) => globalThis.requestAnimationFrame(callback),
    cancelFrame = (frameId) => globalThis.cancelAnimationFrame(frameId),
    schedule = (callback) => globalThis.setTimeout(callback, 0),
    scheduleStopTimeout = (callback, delayMs) =>
      globalThis.setTimeout(callback, delayMs),
    cancelStopTimeout = (timerId) => globalThis.clearTimeout(timerId),
    stopTimeoutMs = 5000,
  } = {}) {
    this.MediaRecorder = MediaRecorder;
    this.MediaStream = MediaStream;
    this.URL = URL;
    this.document = documentRef;
    this.getComputedStyle = (element) =>
      getComputedStyle.call(globalThis, element);
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.schedule = schedule;
    this.scheduleStopTimeout = scheduleStopTimeout;
    this.cancelStopTimeout = cancelStopTimeout;
    this.stopTimeoutMs = stopTimeoutMs;
    this.recorder = null;
    this.chunks = [];
    this.animationFrameId = null;
    this.canvas = null;
    this.canvasStream = null;
    this.videoElement = null;
    this.overlayElement = null;
  }

  get isRecording() {
    return this.recorder?.state === "recording";
  }

  async start({
    cameraStream,
    audioStream,
    videoElement,
    overlayElement,
  }) {
    if (!this.MediaRecorder || !this.MediaStream) {
      throw new Error("Composed video recording is unavailable in this browser.");
    }
    if (this.isRecording) {
      throw new Error("A TapTalk recording is already in progress.");
    }
    if (
      !cameraStream
        ?.getVideoTracks?.()
        .some((track) => track.readyState !== "ended")
    ) {
      throw new Error("Start the camera before recording.");
    }
    if (!videoElement || !overlayElement) {
      throw new Error("The TapTalk camera stage is unavailable for recording.");
    }
    const audioTracks =
      audioStream
        ?.getAudioTracks?.()
        .filter((track) => track.readyState !== "ended") ?? [];
    if (audioTracks.length === 0) {
      throw new Error(
        "TapTalk speech audio is not ready for recording.",
      );
    }

    try {
      await this.document.fonts?.ready;
      this.canvas = this.document.createElement("canvas");
      this.canvas.width = 1280;
      this.canvas.height = 720;
      const context = this.canvas.getContext("2d");
      if (!context || typeof this.canvas.captureStream !== "function") {
        throw new Error("Canvas video capture is unavailable in this browser.");
      }

      this.videoElement = videoElement;
      this.overlayElement = overlayElement;
      this.drawFrame(context);
      this.canvasStream = this.canvas.captureStream(30);
      const composedStream = new this.MediaStream([
        ...this.canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);
      const mimeType = preferredMimeType(this.MediaRecorder);
      this.chunks = [];
      this.recorder = mimeType
        ? new this.MediaRecorder(composedStream, { mimeType })
        : new this.MediaRecorder(composedStream);
      this.recorder.addEventListener("dataavailable", (event) => {
        if (event.data?.size > 0) {
          this.chunks.push(event.data);
        }
      });
      this.recorder.start(250);
      return {
        audioIncluded: true,
        mimeType: this.recorder.mimeType || mimeType,
      };
    } catch (error) {
      this.releaseComposition();
      throw error;
    }
  }

  drawFrame(context) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    context.fillStyle = RECORDING_COLORS.ink;
    context.fillRect(0, 0, width, height);
    this.drawMirroredCamera(context, width, height);
    this.drawMarkers(context, width, height);
    this.drawCaptions(context, width, height);
    this.animationFrameId = this.requestFrame(() => this.drawFrame(context));
  }

  drawMirroredCamera(context, width, height) {
    const sourceWidth = this.videoElement.videoWidth;
    const sourceHeight = this.videoElement.videoHeight;
    if (!(sourceWidth > 0 && sourceHeight > 0)) {
      return;
    }

    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = width / height;
    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio;
      cropX = (sourceWidth - cropWidth) / 2;
    } else if (sourceRatio < targetRatio) {
      cropHeight = sourceWidth / targetRatio;
      cropY = (sourceHeight - cropHeight) / 2;
    }

    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(
      this.videoElement,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height,
    );
    context.restore();
  }

  drawMarkers(context, width, height) {
    const scale = width / 1280;
    const markers = this.overlayElement.querySelectorAll(
      "[data-finger-id], [data-thumb-hand]",
    );
    for (const marker of markers) {
      const computedStyle = this.getComputedStyle(marker);
      if (!isVisibleMarker(marker, computedStyle)) {
        continue;
      }
      const sourcePoint = projectSourcePointToRecording(
        {
          x: Number.parseFloat(marker.dataset.sourceX),
          y: Number.parseFloat(marker.dataset.sourceY),
        },
        this.videoElement.videoWidth,
        this.videoElement.videoHeight,
        width,
        height,
      );
      const xPercent = Number.parseFloat(
        marker.style.getPropertyValue("--marker-x"),
      );
      const yPercent = Number.parseFloat(
        marker.style.getPropertyValue("--marker-y"),
      );
      if (
        !sourcePoint &&
        (!Number.isFinite(xPercent) || !Number.isFinite(yPercent))
      ) {
        continue;
      }

      const x = sourcePoint?.x ?? (xPercent / 100) * width;
      const y = sourcePoint?.y ?? (yPercent / 100) * height;
      const active = marker.classList.contains("is-active");
      const approaching =
        marker.dataset.trackingState === "approaching" ||
        marker.dataset.trackingState === "contact_candidate";
      context.beginPath();
      context.arc(x, y, 9 * scale, 0, Math.PI * 2);
      context.fillStyle = RECORDING_COLORS.red;
      context.fill();
      context.lineWidth = 1.25 * scale;
      context.strokeStyle = RECORDING_COLORS.redDark;
      context.stroke();
      if (active || approaching) {
        context.beginPath();
        context.arc(x, y, (active ? 16 : 13) * scale, 0, Math.PI * 2);
        context.lineWidth = (active ? 5 : 3) * scale;
        context.strokeStyle = RECORDING_COLORS.white;
        context.globalAlpha = active ? 0.55 : 0.35;
        context.stroke();
        context.globalAlpha = 1;
      }

      if (!marker.dataset.fingerId) {
        continue;
      }
      const label = marker.querySelector(".marker-label")?.textContent?.trim();
      if (!label) {
        continue;
      }
      const labelColor =
        computedStyle.getPropertyValue("--label-color").trim() ||
        RECORDING_COLORS.cream;
      context.font = `italic 400 ${32 * scale}px Arial, "Helvetica Neue", "PingFang SC", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.shadowColor = "rgb(34 35 58 / 32%)";
      context.shadowBlur = 2 * scale;
      context.shadowOffsetY = 1 * scale;
      context.fillStyle = labelColor;
      context.fillText(label, x, y - 11 * scale);
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.shadowOffsetY = 0;
    }
  }

  drawCaptions(context, width, height) {
    const scale = width / 1280;
    context.fillStyle = RECORDING_COLORS.cream;
    context.font = `800 ${13 * scale}px "Gabarito", sans-serif`;
    context.textBaseline = "alphabetic";
    context.textAlign = "left";
    context.fillText("MIRRORED PREVIEW", 18 * scale, height - 16 * scale);
    context.textAlign = "right";
    context.fillText(
      "TAPTALK • RECORDING",
      width - 18 * scale,
      height - 16 * scale,
    );
  }

  stop() {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId !== null) {
          this.cancelStopTimeout(timeoutId);
        }
        const blob = new Blob(this.chunks, {
          type: recorder.mimeType || "video/webm",
        });
        this.recorder = null;
        this.chunks = [];
        this.releaseComposition();
        resolve(blob);
      };
      const fail = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId !== null) {
          this.cancelStopTimeout(timeoutId);
        }
        this.recorder = null;
        this.chunks = [];
        this.releaseComposition();
        reject(error);
      };

      recorder.addEventListener(
        "stop",
        finish,
        { once: true },
      );
      recorder.addEventListener(
        "error",
        (event) => {
          fail(
            new Error(
              `Local recording failed: ${event.error?.message ?? event.error ?? "unknown error"}`,
            ),
          );
        },
        { once: true },
      );
      timeoutId = this.scheduleStopTimeout(() => {
        if (this.chunks.length > 0) {
          finish();
          return;
        }
        fail(
          new Error(
            "The browser could not finish this recording. Try a shorter recording.",
          ),
        );
      }, this.stopTimeoutMs);
      try {
        recorder.requestData?.();
        recorder.stop();
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
      }
    });
  }

  releaseComposition() {
    if (this.animationFrameId !== null) {
      this.cancelFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    for (const stream of [this.canvasStream]) {
      for (const track of stream?.getTracks?.() ?? []) {
        track.stop();
      }
    }
    this.canvas = null;
    this.canvasStream = null;
    this.videoElement = null;
    this.overlayElement = null;
  }

  download(blob, recordedAt = new Date()) {
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error("The recording was empty and could not be saved.");
    }
    if (!this.URL?.createObjectURL || !this.document?.createElement) {
      throw new Error("This browser cannot save the local recording.");
    }

    const filename = recordingFilename(blob.type, recordedAt);
    const url = this.URL.createObjectURL(blob);
    const link = this.document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    this.document.body.append(link);
    link.click();
    link.remove();
    this.schedule(() => this.URL.revokeObjectURL(url));
    return filename;
  }
}
