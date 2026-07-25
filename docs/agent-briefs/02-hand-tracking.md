# Hand Tracking Brief

## Mission

Turn local webcam frames into reliable, timestamped activation and separation
events for eight fingers.

## Responsibilities

- Track two hands and stable left/right handedness.
- Track thumb tips and all non-thumb fingertips.
- Normalize contact thresholds for hand scale and camera distance.
- Implement or specify contact confirmation, held state, and separation rearm.
- Handle jitter, occlusion, crossing hands, hand loss, and reacquisition.
- Expose landmarks and confidence for fingertip-adjacent UI labels.
- Measure detection latency and false activation behavior.

## Owned interface

Produce stable events containing at least finger ID, timestamp, state,
confidence, and any frame correlation required by downstream systems.

## Boundaries

- Do not assign phrases.
- Do not speak audio.
- Do not interpret sign language or arbitrary gestures.
- Do not change the product contract without a written request.

## First assignment

Design the tracking subsystem and then implement the smallest testable contact
pipeline that supports the narrow proof of concept.

