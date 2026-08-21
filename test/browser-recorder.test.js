import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserRecorder,
  projectSourcePointToRecording,
} from "../src/adapters/browser-recorder.js";

class FakeMediaStream {
  constructor(tracks) {
    this.tracks = tracks;
  }

  getTracks() {
    return this.tracks;
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

test("remaps source landmarks into the fixed 16:9 recording crop", () => {
  assert.deepEqual(
    projectSourcePointToRecording(
      { x: 0.5, y: 0.5 },
      640,
      480,
      1280,
      720,
    ),
    { x: 640, y: 360 },
  );
  assert.deepEqual(
    projectSourcePointToRecording(
      { x: 0.25, y: 0.25 },
      1920,
      1080,
      1280,
      720,
    ),
    { x: 320, y: 180 },
  );
  assert.equal(
    projectSourcePointToRecording(
      { x: Number.NaN, y: 0.5 },
      640,
      480,
      1280,
      720,
    ),
    null,
  );
});

test("maps the visible 16:9 band of a portrait camera into the recording", () => {
  const sourceWidth = 720;
  const sourceHeight = 1280;
  const visibleCropHeight = sourceWidth / (16 / 9);
  const topOfVisibleCrop = (sourceHeight - visibleCropHeight) / 2;
  const topY = topOfVisibleCrop / sourceHeight;
  const bottomY = (topOfVisibleCrop + visibleCropHeight) / sourceHeight;

  assert.deepEqual(
    projectSourcePointToRecording(
      { x: 0.5, y: 0.5 },
      sourceWidth,
      sourceHeight,
      1280,
      720,
    ),
    { x: 640, y: 360 },
  );
  assert.deepEqual(
    projectSourcePointToRecording(
      { x: 0, y: topY },
      sourceWidth,
      sourceHeight,
      1280,
      720,
    ),
    { x: 0, y: 0 },
  );
  const bottom = projectSourcePointToRecording(
    { x: 1, y: bottomY },
    sourceWidth,
    sourceHeight,
    1280,
    720,
  );
  assert.equal(bottom.x, 1280);
  assert.ok(Math.abs(bottom.y - 720) < Number.EPSILON * 720);
});

test("rejects invalid recording dimensions without producing marker positions", () => {
  assert.equal(
    projectSourcePointToRecording({ x: 0.5, y: 0.5 }, 0, 1280, 1280, 720),
    null,
  );
  assert.equal(
    projectSourcePointToRecording({ x: 0.5, y: 0.5 }, 720, 1280, 0, 720),
    null,
  );
});

test("recorded labels use portrait source coordinates and omit hidden fingers", () => {
  const arcs = [];
  const labels = [];
  const visible = marker();
  visible.dataset.sourceX = "0.5";
  visible.dataset.sourceY = "0.5";
  const hidden = marker();
  hidden.hidden = true;
  hidden.dataset.sourceX = "0.25";
  hidden.dataset.sourceY = "0.25";
  const recorder = new BrowserRecorder({
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      getPropertyValue: () => "#ff91c8",
    }),
  });
  recorder.videoElement = { videoWidth: 720, videoHeight: 1280 };
  recorder.overlayElement = {
    querySelectorAll: () => [visible, hidden],
  };
  recorder.drawMarkers(
    {
      beginPath() {},
      arc(x, y) {
        arcs.push([x, y]);
      },
      fill() {},
      stroke() {},
      fillText(label, x, y) {
        labels.push([label, x, y]);
      },
    },
    1280,
    720,
  );

  assert.deepEqual(arcs, [[640, 360]]);
  assert.deepEqual(labels, [["slay", 640, 349]]);
});

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported(type) {
    return [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/webm;codecs=vp8,opus",
    ].includes(type);
  }

  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.mimeType = options.mimeType ?? "";
    this.state = "inactive";
  }

  start(timeslice) {
    this.timeslice = timeslice;
    this.state = "recording";
  }

  stop() {
    const dataEvent = new Event("dataavailable");
    Object.defineProperty(dataEvent, "data", {
      value: new Blob(["composed-video"], { type: this.mimeType }),
    });
    this.dispatchEvent(dataEvent);
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }
}

class HangingStopMediaRecorder extends FakeMediaRecorder {
  stop() {
    const dataEvent = new Event("dataavailable");
    Object.defineProperty(dataEvent, "data", {
      value: new Blob(["recoverable-video"], { type: this.mimeType }),
    });
    this.dispatchEvent(dataEvent);
    this.state = "inactive";
  }
}

function track(kind) {
  return {
    kind,
    readyState: "live",
    stopped: false,
    stop() {
      this.stopped = true;
      this.readyState = "ended";
    },
  };
}

function marker() {
  return {
    hidden: false,
    dataset: {
      fingerId: "left_index",
      trackingState: "separated",
    },
    style: {
      getPropertyValue(name) {
        return name === "--marker-x" ? "25%" : "35%";
      },
    },
    classList: {
      contains: () => false,
    },
    querySelector: () => ({ textContent: "slay" }),
  };
}

function drawingSetup({ withAudio = true } = {}) {
  const operations = [];
  const canvasTrack = track("video");
  const speechAudioTrack = track("audio");
  const cameraTrack = track("video");
  const canvasStream = new FakeMediaStream([canvasTrack]);
  const audioStream = new FakeMediaStream(
    withAudio ? [speechAudioTrack] : [],
  );
  const context = {
    beginPath: () => operations.push("beginPath"),
    arc: () => operations.push("arc"),
    fill: () => operations.push("fill"),
    fillRect: () => operations.push("fillRect"),
    fillText: (text) => operations.push(`fillText:${text}`),
    stroke: () => operations.push("stroke"),
    strokeText: (text) => operations.push(`strokeText:${text}`),
    save: () => operations.push("save"),
    restore: () => operations.push("restore"),
    translate: () => operations.push("translate"),
    scale: () => operations.push("scale"),
    drawImage: () => operations.push("drawImage"),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    captureStream(frameRate) {
      operations.push(`captureStream:${frameRate}`);
      return canvasStream;
    },
  };
  const documentRef = {
    fonts: { ready: Promise.resolve() },
    createElement: (name) => {
      assert.equal(name, "canvas");
      return canvas;
    },
  };
  const cancelledFrames = [];
  let styleReceiver = null;
  const recorder = new BrowserRecorder({
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeMediaStream,
    documentRef,
    getComputedStyle: function getComputedStyleForTest() {
      styleReceiver = this;
      return {
        display: "block",
        visibility: "visible",
        opacity: "1",
        getPropertyValue: (name) =>
          name === "--label-color" ? "#ff91c8" : "",
      };
    },
    requestFrame: () => 42,
    cancelFrame: (frameId) => cancelledFrames.push(frameId),
  });

  return {
    cameraStream: new FakeMediaStream([cameraTrack]),
    audioStream,
    cameraTrack,
    canvasTrack,
    speechAudioTrack,
    operations,
    overlayElement: {
      querySelectorAll: () => [marker()],
    },
    recorder,
    get styleReceiver() {
      return styleReceiver;
    },
    cancelledFrames,
    videoElement: {
      videoWidth: 1280,
      videoHeight: 720,
    },
  };
}

test("records mirrored camera, fingertip labels, and TapTalk speech audio as MP4", async () => {
  const setup = drawingSetup();

  const result = await setup.recorder.start({
    cameraStream: setup.cameraStream,
    audioStream: setup.audioStream,
    videoElement: setup.videoElement,
    overlayElement: setup.overlayElement,
  });

  assert.equal(setup.recorder.isRecording, true);
  assert.equal(
    setup.recorder.recorder.mimeType,
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  );
  assert.equal(setup.recorder.recorder.timeslice, 250);
  assert.deepEqual(
    setup.recorder.recorder.stream.getTracks(),
    [setup.canvasTrack, setup.speechAudioTrack],
  );
  assert.equal(result.audioIncluded, true);
  assert.equal(
    result.mimeType,
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  );
  assert.equal(setup.operations.includes("drawImage"), true);
  assert.equal(setup.operations.includes("fillText:slay"), true);
  assert.equal(setup.operations.includes("fillText:TAPTALK • RECORDING"), true);
  assert.equal(setup.styleReceiver, globalThis);

  const blob = await setup.recorder.stop();

  assert.equal(
    blob.type,
    "video/mp4;codecs=avc1.42e01e,mp4a.40.2",
  );
  assert.equal(blob.size > 0, true);
  assert.equal(setup.canvasTrack.stopped, true);
  assert.equal(setup.speechAudioTrack.stopped, false);
  assert.equal(setup.cameraTrack.stopped, false);
  assert.deepEqual(setup.cancelledFrames, [42]);
});

test("refuses to create a silent recording", async () => {
  const setup = drawingSetup({ withAudio: false });

  await assert.rejects(
    setup.recorder.start({
      cameraStream: setup.cameraStream,
      audioStream: setup.audioStream,
      videoElement: setup.videoElement,
      overlayElement: setup.overlayElement,
    }),
    /speech audio is not ready/,
  );
});

test("requires a live camera before recording", async () => {
  const setup = drawingSetup();

  await assert.rejects(
    setup.recorder.start({
      cameraStream: new FakeMediaStream([]),
      audioStream: setup.audioStream,
      videoElement: setup.videoElement,
      overlayElement: setup.overlayElement,
    }),
    /Start the camera before recording/,
  );
});

test("finalizes existing video chunks when the browser omits the stop event", async () => {
  const setup = drawingSetup();
  const scheduled = [];
  setup.recorder = new BrowserRecorder({
    MediaRecorder: HangingStopMediaRecorder,
    MediaStream: FakeMediaStream,
    documentRef: {
      fonts: { ready: Promise.resolve() },
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          beginPath() {},
          arc() {},
          fill() {},
          fillRect() {},
          fillText() {},
          stroke() {},
          strokeText() {},
          save() {},
          restore() {},
          translate() {},
          scale() {},
          drawImage() {},
        }),
        captureStream: () => new FakeMediaStream([track("video")]),
      }),
    },
    getComputedStyle: () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      getPropertyValue: () => "",
    }),
    requestFrame: () => 7,
    cancelFrame() {},
    scheduleStopTimeout: (callback) => {
      scheduled.push(callback);
      return scheduled.length;
    },
    cancelStopTimeout() {},
  });

  await setup.recorder.start({
    cameraStream: setup.cameraStream,
    audioStream: setup.audioStream,
    videoElement: setup.videoElement,
    overlayElement: { querySelectorAll: () => [] },
  });
  const stopping = setup.recorder.stop();
  assert.equal(scheduled.length, 1);
  scheduled[0]();

  const blob = await stopping;
  assert.equal(blob.size > 0, true);
  assert.match(blob.type, /video\/mp4/);
});

test("downloads the completed recording locally and revokes its URL", () => {
  const clicks = [];
  const removals = [];
  const appended = [];
  const revoked = [];
  const link = {
    click: () => clicks.push(true),
    remove: () => removals.push(true),
  };
  const recorder = new BrowserRecorder({
    MediaRecorder: FakeMediaRecorder,
    MediaStream: FakeMediaStream,
    URL: {
      createObjectURL: () => "blob:taptalk-recording",
      revokeObjectURL: (url) => revoked.push(url),
    },
    documentRef: {
      createElement: () => link,
      body: {
        append: (element) => appended.push(element),
      },
    },
    schedule: (callback) => callback(),
  });

  const filename = recorder.download(
    new Blob(["video"], { type: "video/mp4" }),
    new Date("2026-07-25T21:30:00.000Z"),
  );

  assert.equal(filename, "TapTalk-2026-07-25T21-30-00-000Z.mp4");
  assert.equal(link.download, filename);
  assert.equal(link.href, "blob:taptalk-recording");
  assert.deepEqual(appended, [link]);
  assert.equal(clicks.length, 1);
  assert.equal(removals.length, 1);
  assert.deepEqual(revoked, ["blob:taptalk-recording"]);
});
