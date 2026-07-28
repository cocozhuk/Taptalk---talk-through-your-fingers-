import {
  VOICE_IDENTITIES,
  fixedVoiceIdFor,
} from "../domain/contracts.js";

export const PIPER_VOICE_MODELS = Object.freeze({
  en: "en_US-hfc_female-medium",
  zh: "zh_CN-huayan-medium",
});

const PIPER_MODEL_BY_VOICE_ID = Object.freeze({
  // These legacy TapTalk IDs remain only for saved-configuration
  // compatibility. Their audio always comes from the approved Piper models.
  en_shelley: PIPER_VOICE_MODELS.en,
  zh_tingting: PIPER_VOICE_MODELS.zh,
});

const CACHE_REVISION = "piper-approved-pair-v1";
const DEFAULT_WASM_PATHS = Object.freeze({
  onnxWasm: "/vendor/onnxruntime/",
  piperData: "/vendor/piper-wasm/piper_phonemize.data",
  piperWasm: "/vendor/piper-wasm/piper_phonemize.wasm",
});

function cacheKey(voiceId, text) {
  return `${CACHE_REVISION}\u0000${voiceId}\u0000${text}`;
}

export class PiperVoicePort {
  constructor({
    TtsSession,
    removeVoice = async () => {},
    AudioContext =
      globalThis.AudioContext ?? globalThis.webkitAudioContext,
    clock = () => performance.now(),
    onProgress = () => {},
    wasmPaths = DEFAULT_WASM_PATHS,
  } = {}) {
    if (!TtsSession?.create) {
      throw new Error("The local Piper speech engine is unavailable.");
    }
    if (!AudioContext) {
      throw new Error("Web Audio is unavailable in this browser.");
    }

    this.TtsSession = TtsSession;
    this.removeVoice = removeVoice;
    this.audioContext = new AudioContext({ latencyHint: "interactive" });
    this.recordingDestination =
      this.audioContext.createMediaStreamDestination();
    this.clock = clock;
    this.onProgress = onProgress;
    this.wasmPaths = wasmPaths;
    this.cache = new Map();
    this.pendingByActivationId = new Map();
    this.synthesisTail = Promise.resolve();
    this.sessionModelId = null;
    this.sessionPromise = null;
    this.recordingClockSource = null;
  }

  get recordingStream() {
    return this.recordingDestination.stream;
  }

  async prepareRecording() {
    if (this.audioContext.state !== "running") {
      await this.audioContext.resume();
    }
    if (this.audioContext.state !== "running") {
      throw new Error(
        "TapTalk audio is locked. Tap the page once and try recording again.",
      );
    }
    if (this.recordingClockSource) {
      return;
    }

    const source = this.audioContext.createConstantSource();
    source.offset.value = 0;
    source.connect(this.recordingDestination);
    source.start();
    this.recordingClockSource = source;
  }

  finishRecording() {
    const source = this.recordingClockSource;
    if (!source) {
      return;
    }
    this.recordingClockSource = null;
    try {
      source.stop();
    } catch {
      // A source that already stopped needs no additional cleanup.
    }
    source.disconnect?.();
  }

  async warmAssignments(assignments) {
    const grouped = new Map(
      Object.values(PIPER_VOICE_MODELS).map((modelId) => [modelId, []]),
    );
    for (const assignment of Object.values(assignments)) {
      const voiceId = fixedVoiceIdFor(assignment.language);
      const modelId = PIPER_MODEL_BY_VOICE_ID[voiceId];
      grouped.get(modelId).push({ voiceId, text: assignment.text });
    }

    for (const modelId of Object.values(PIPER_VOICE_MODELS)) {
      const unique = new Map(
        grouped
          .get(modelId)
          .map((request) => [cacheKey(request.voiceId, request.text), request]),
      );
      await Promise.all(
        [...unique.values()].map(({ voiceId, text }) =>
          this.loadBuffer(voiceId, text),
        ),
      );
    }
  }

  loadBuffer(voiceId, text) {
    if (!Object.hasOwn(VOICE_IDENTITIES, voiceId)) {
      throw new TypeError(`Unknown TapTalk voice: ${voiceId}`);
    }
    const key = cacheKey(voiceId, text);
    let loading = this.cache.get(key);
    if (loading) {
      return loading;
    }

    loading = this.synthesisTail.then(() =>
      this.synthesizeBuffer(voiceId, text),
    );
    this.synthesisTail = loading.catch(() => {});
    loading = loading.catch((error) => {
      this.cache.delete(key);
      throw error;
    });
    this.cache.set(key, loading);
    return loading;
  }

  async synthesizeBuffer(voiceId, text, allowRepair = true) {
    const modelId = PIPER_MODEL_BY_VOICE_ID[voiceId];
    try {
      const session = await this.getSession(modelId);
      const blob = await session.predict(text);
      const audioData = await blob.arrayBuffer();
      return await this.audioContext.decodeAudioData(audioData.slice(0));
    } catch (error) {
      if (allowRepair && error.message?.includes("JSON")) {
        await this.removeVoice(modelId);
        this.resetSession();
        return this.synthesizeBuffer(voiceId, text, false);
      }
      throw error;
    }
  }

  async getSession(modelId) {
    if (this.sessionModelId === modelId && this.sessionPromise) {
      return this.sessionPromise;
    }

    this.TtsSession._instance = null;
    this.sessionModelId = modelId;
    this.sessionPromise = this.TtsSession.create({
      voiceId: modelId,
      wasmPaths: this.wasmPaths,
      progress: ({ loaded, total }) => {
        this.onProgress({
          loaded,
          modelId,
          percent: total > 0 ? Math.round((loaded / total) * 100) : null,
          total,
        });
      },
    });
    try {
      return await this.sessionPromise;
    } catch (error) {
      this.resetSession();
      throw error;
    }
  }

  resetSession() {
    this.TtsSession._instance = null;
    this.sessionModelId = null;
    this.sessionPromise = null;
  }

  speak(request) {
    if (!Object.hasOwn(VOICE_IDENTITIES, request.voiceId)) {
      throw new TypeError(`Unknown TapTalk voice: ${request.voiceId}`);
    }

    return new Promise((resolve, reject) => {
      const pending = {
        interrupted: false,
        settled: false,
        source: null,
        settle: (status, error) => {
          if (pending.settled) {
            return;
          }
          pending.settled = true;
          this.pendingByActivationId.delete(request.activationId);
          if (error) {
            reject(error);
          } else {
            resolve({ status });
          }
        },
      };
      this.pendingByActivationId.set(request.activationId, pending);

      Promise.resolve()
        .then(async () => {
          if (this.audioContext.state !== "running") {
            await this.audioContext.resume();
          }
          if (this.audioContext.state !== "running") {
            throw new Error(
              "TapTalk audio is locked. Tap the page once and try again.",
            );
          }

          const buffer = await this.loadBuffer(request.voiceId, request.text);
          if (pending.interrupted) {
            pending.settle("interrupted");
            return;
          }

          const source = this.audioContext.createBufferSource();
          pending.source = source;
          source.buffer = buffer;
          source.connect(this.audioContext.destination);
          source.connect(this.recordingDestination);
          source.addEventListener(
            "ended",
            () =>
              pending.settle(
                pending.interrupted ? "interrupted" : "ended",
              ),
            { once: true },
          );
          source.start();
          request.onAudibleStart?.(this.clock());
        })
        .catch((error) => {
          request.onError?.(error);
          pending.settle("failed", error);
        });
    });
  }

  interrupt({ activationId }) {
    const target = this.pendingByActivationId.get(activationId);
    if (!target) {
      return false;
    }

    for (const pending of this.pendingByActivationId.values()) {
      pending.interrupted = true;
      if (pending.source) {
        try {
          pending.source.stop();
        } catch {
          pending.settle("interrupted");
        }
      } else {
        pending.settle("interrupted");
      }
    }
    return true;
  }

  destroy() {
    this.finishRecording();
    for (const pending of [...this.pendingByActivationId.values()]) {
      pending.interrupted = true;
      try {
        pending.source?.stop();
      } catch {
        // A source that already ended needs no additional cleanup.
      }
      pending.settle("interrupted");
    }
    void this.audioContext.close?.();
  }
}
