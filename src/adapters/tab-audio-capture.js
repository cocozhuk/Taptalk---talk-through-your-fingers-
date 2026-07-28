const TAB_AUDIO_GUIDANCE =
  "Choose This Tab and enable Share tab audio in the recording window.";

function stopStream(stream) {
  for (const track of stream?.getTracks?.() ?? []) {
    track.stop();
  }
}

export class TabAudioCapture {
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
  } = {}) {
    this.mediaDevices = mediaDevices;
    this.captureStream = null;
  }

  get stream() {
    return this.captureStream;
  }

  async start() {
    if (typeof this.mediaDevices?.getDisplayMedia !== "function") {
      throw new Error(
        "Recording TapTalk speech on the hosted prototype requires Chrome or Edge. Safari cannot share tab audio reliably.",
      );
    }

    this.stop();
    let stream;
    try {
      stream = await this.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: {
          suppressLocalAudioPlayback: false,
          restrictOwnAudio: false,
        },
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude",
        monitorTypeSurfaces: "exclude",
        systemAudio: "exclude",
      });
    } catch (error) {
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
        throw new Error(`Recording was cancelled. ${TAB_AUDIO_GUIDANCE}`);
      }
      throw new Error(
        `Tab audio could not start: ${error?.message || "unknown browser error"}. ${TAB_AUDIO_GUIDANCE}`,
      );
    }

    const audioTracks =
      stream
        ?.getAudioTracks?.()
        .filter((track) => track.readyState !== "ended") ?? [];
    const displaySurface = stream
      ?.getVideoTracks?.()[0]
      ?.getSettings?.()
      ?.displaySurface;

    if (displaySurface && displaySurface !== "browser") {
      stopStream(stream);
      throw new Error(
        `A screen or window was selected. ${TAB_AUDIO_GUIDANCE}`,
      );
    }
    if (audioTracks.length === 0) {
      stopStream(stream);
      throw new Error(
        `No tab audio was shared. ${TAB_AUDIO_GUIDANCE}`,
      );
    }

    this.captureStream = stream;
    return stream;
  }

  stop() {
    stopStream(this.captureStream);
    this.captureStream = null;
  }
}
