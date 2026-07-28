import assert from "node:assert/strict";
import test from "node:test";

import { TabAudioCapture } from "../src/adapters/tab-audio-capture.js";

function track({
  kind,
  displaySurface,
  readyState = "live",
} = {}) {
  return {
    kind,
    readyState,
    stopped: false,
    getSettings: () => ({ displaySurface }),
    stop() {
      this.stopped = true;
    },
  };
}

function stream({
  displaySurface = "browser",
  withAudio = true,
} = {}) {
  const videoTrack = track({ kind: "video", displaySurface });
  const audioTrack = withAudio ? track({ kind: "audio" }) : null;
  const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
  return {
    videoTrack,
    audioTrack,
    getTracks: () => tracks,
    getVideoTracks: () => [videoTrack],
    getAudioTracks: () => (audioTrack ? [audioTrack] : []),
  };
}

test("requests the current browser tab with its own audio included", async () => {
  const capturedStream = stream();
  let constraints;
  const capture = new TabAudioCapture({
    mediaDevices: {
      getDisplayMedia: async (nextConstraints) => {
        constraints = nextConstraints;
        return capturedStream;
      },
    },
  });

  assert.equal(await capture.start(), capturedStream);
  assert.equal(constraints.preferCurrentTab, true);
  assert.equal(constraints.selfBrowserSurface, "include");
  assert.equal(constraints.systemAudio, "exclude");
  assert.equal(constraints.audio.restrictOwnAudio, false);
  assert.equal(constraints.audio.suppressLocalAudioPlayback, false);
});

test("rejects and releases a capture with no shared audio", async () => {
  const capturedStream = stream({ withAudio: false });
  const capture = new TabAudioCapture({
    mediaDevices: {
      getDisplayMedia: async () => capturedStream,
    },
  });

  await assert.rejects(
    capture.start(),
    /No tab audio was shared.*Choose This Tab.*Share tab audio/,
  );
  assert.equal(capturedStream.videoTrack.stopped, true);
});

test("rejects and releases a selected window or screen", async () => {
  const capturedStream = stream({ displaySurface: "window" });
  const capture = new TabAudioCapture({
    mediaDevices: {
      getDisplayMedia: async () => capturedStream,
    },
  });

  await assert.rejects(
    capture.start(),
    /screen or window was selected.*Choose This Tab/,
  );
  assert.equal(capturedStream.videoTrack.stopped, true);
  assert.equal(capturedStream.audioTrack.stopped, true);
});

test("turns a cancelled picker into actionable guidance", async () => {
  const error = new Error("Permission denied");
  error.name = "NotAllowedError";
  const capture = new TabAudioCapture({
    mediaDevices: {
      getDisplayMedia: async () => {
        throw error;
      },
    },
  });

  await assert.rejects(
    capture.start(),
    /Recording was cancelled.*Choose This Tab.*Share tab audio/,
  );
});

test("stop releases every display capture track", async () => {
  const capturedStream = stream();
  const capture = new TabAudioCapture({
    mediaDevices: {
      getDisplayMedia: async () => capturedStream,
    },
  });

  await capture.start();
  capture.stop();

  assert.equal(capturedStream.videoTrack.stopped, true);
  assert.equal(capturedStream.audioTrack.stopped, true);
  assert.equal(capture.stream, null);
});
