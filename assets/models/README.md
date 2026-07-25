# Hand-landmarker model provenance

`hand_landmarker.task` is the MediaPipe Hand Landmarker (full, float16) model
used by the first TapTalk prototype.

- Source:
  `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`
- Retrieved: 2026-07-25
- Size: 7,819,105 bytes
- SHA-256:
  `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`
- Runtime: `@mediapipe/tasks-vision` 0.10.35

The model is stored with the project so browser inference does not require a
runtime request to a third-party host. Camera frames are processed in the
browser and are not sent to the model source.

Review the current
[MediaPipe model documentation](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker#models)
and its linked model card before production distribution.
