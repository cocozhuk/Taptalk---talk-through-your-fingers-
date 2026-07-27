import {
  VOICE_IDENTITIES,
  fixedVoiceIdFor,
} from "../domain/contracts.js";

const SPEECH_PROFILE_REVISION = "shelley-tingting-v5";

function cacheKey(voiceId, text) {
  return `${SPEECH_PROFILE_REVISION}\u0000${voiceId}\u0000${text}`;
}

export class LocalAudioVoicePort {
  constructor({
    AudioContext =
      globalThis.AudioContext ?? globalThis.webkitAudioContext,
    fetchImpl = globalThis.fetch,
    clock = () => performance.now(),
    connectToSpeakers = true,
  } = {}) {
    if (!AudioContext) {
      throw new Error("Web Audio is unavailable in this browser.");
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("Local TapTalk speech loading is unavailable.");
    }

    this.audioContext = new AudioContext({ latencyHint: "interactive" });
    this.recordingDestination =
      this.audioContext.createMediaStreamDestination();
    this.fetchImpl = (...args) => fetchImpl(...args);
    this.clock = clock;
    this.connectToSpeakers = connectToSpeakers;
    this.cache = new Map();
    this.pendingByActivationId = new Map();
  }

  get recordingStream() {
    return this.recordingDestination.stream;
  }

  async warmAssignments(assignments) {
    await Promise.all(
      Object.values(assignments).map((assignment) =>
        this.loadBuffer(
          fixedVoiceIdFor(assignment.language),
          assignment.text,
        ),
      ),
    );
  }

  loadBuffer(voiceId, text) {
    const key = cacheKey(voiceId, text);
    let loading = this.cache.get(key);
    if (loading) {
      return loading;
    }

    const query = new URLSearchParams({
      format: SPEECH_PROFILE_REVISION,
      voiceId,
      text,
    });
    loading = Promise.resolve(
      this.fetchImpl(`/api/speech?${query.toString()}`),
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Local speech preparation failed (${response.status}).`,
          );
        }
        return response.arrayBuffer();
      })
      .then((audioData) =>
        this.audioContext.decodeAudioData(audioData.slice(0)),
      )
      .catch((error) => {
        this.cache.delete(key);
        throw error;
      });
    this.cache.set(key, loading);
    return loading;
  }

  speak(request) {
    if (!Object.hasOwn(VOICE_IDENTITIES, request.voiceId)) {
      throw new TypeError(`Unknown TapTalk voice: ${request.voiceId}`);
    }

    return new Promise((resolve, reject) => {
      const pending = {
        activationId: request.activationId,
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
          if (this.connectToSpeakers) {
            source.connect(this.audioContext.destination);
          }
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
