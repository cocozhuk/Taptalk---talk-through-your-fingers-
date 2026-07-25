import { VOICE_IDENTITIES } from "./identities.mjs";

const FUNDAMENTALS = Object.freeze({
  "en-masculine": 146.83,
  "en-feminine": 220,
  "zh-masculine": 164.81,
  "zh-feminine": 246.94,
});

/**
 * Non-speech engineering backend for tests and wiring demos only.
 *
 * It proves routing, caching, processing, overlap and onset instrumentation.
 * It is not intelligible TTS and must never be presented as a TapTalk voice.
 */
export function createDiagnosticToneBackend({
  sampleRate = 24_000,
  durationSeconds = 0.18,
} = {}) {
  return Object.freeze({
    revision: "diagnostic-tone-v1",
    async warmUp() {},
    async synthesize({ identity }) {
      if (VOICE_IDENTITIES[identity] === undefined) {
        throw new RangeError(`Unknown diagnostic identity: ${identity}`);
      }

      const frameCount = Math.ceil(sampleRate * durationSeconds);
      const samples = new Float32Array(frameCount);
      const fundamental = FUNDAMENTALS[identity];
      for (let frame = 0; frame < frameCount; frame += 1) {
        const time = frame / sampleRate;
        const envelope = Math.sin((Math.PI * frame) / frameCount) ** 2;
        samples[frame] =
          envelope *
          (0.16 * Math.sin(2 * Math.PI * fundamental * time) +
            0.05 * Math.sin(2 * Math.PI * fundamental * 2.01 * time));
      }

      return { sampleRate, channels: [samples] };
    },
  });
}
