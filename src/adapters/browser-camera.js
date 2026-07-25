export class BrowserCamera {
  constructor(mediaDevices = globalThis.navigator?.mediaDevices) {
    this.mediaDevices = mediaDevices;
    this.stream = null;
  }

  async start(videoElement) {
    if (!this.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is unavailable in this browser.");
    }

    this.stop(videoElement);
    this.stream = await this.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    videoElement.srcObject = this.stream;
    await videoElement.play();
  }

  stop(videoElement) {
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }
}

