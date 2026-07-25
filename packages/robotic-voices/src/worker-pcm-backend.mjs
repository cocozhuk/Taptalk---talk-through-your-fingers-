import { VOICE_IDENTITY_IDS } from "./identities.mjs";

const MESSAGE_PREFIX = "taptalk-tts:";

function validateSpeakers(speakers) {
  if (speakers === null || typeof speakers !== "object" || Array.isArray(speakers)) {
    throw new TypeError("speakers must map all four fixed identities");
  }

  const keys = Object.keys(speakers).sort();
  const expected = [...VOICE_IDENTITY_IDS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError("speakers must contain exactly the four TapTalk identity IDs");
  }
}

function asFloat32Channels(channels) {
  if (!Array.isArray(channels)) {
    throw new TypeError("Worker result channels must be an array");
  }
  return channels.map((channel) => {
    if (channel instanceof Float32Array) {
      return channel;
    }
    if (channel instanceof ArrayBuffer) {
      return new Float32Array(channel);
    }
    throw new TypeError("Worker result channels must contain Float32Array or ArrayBuffer values");
  });
}

/**
 * Adapt a module Worker running a local TTS engine to the stable PCM backend.
 *
 * Model-specific speaker values are posted only to the worker and never
 * exposed through the TapTalk service or UI.
 */
export function createWorkerPcmBackend({
  worker,
  speakers,
  revision = "worker-unversioned",
  terminateOnDispose = true,
} = {}) {
  if (
    worker === null ||
    typeof worker !== "object" ||
    typeof worker.postMessage !== "function" ||
    typeof worker.addEventListener !== "function"
  ) {
    throw new TypeError("A Worker-compatible object is required");
  }
  validateSpeakers(speakers);

  const pending = new Map();
  let operationCounter = 0;
  let disposed = false;

  function nextOperationId() {
    operationCounter += 1;
    return `voice-operation-${operationCounter}`;
  }

  function rejectAll(error) {
    for (const operation of pending.values()) {
      operation.reject(error);
    }
    pending.clear();
  }

  function onMessage(event) {
    const message = event.data;
    if (
      message === null ||
      typeof message !== "object" ||
      typeof message.operationId !== "string"
    ) {
      return;
    }

    const operation = pending.get(message.operationId);
    if (operation === undefined) {
      return;
    }

    if (message.type === `${MESSAGE_PREFIX}error`) {
      pending.delete(message.operationId);
      operation.reject(new Error(message.message ?? "TTS worker operation failed"));
      return;
    }

    if (operation.kind === "warmup" && message.type === `${MESSAGE_PREFIX}ready`) {
      pending.delete(message.operationId);
      operation.resolve();
      return;
    }

    if (operation.kind === "synthesis" && message.type === `${MESSAGE_PREFIX}result`) {
      try {
        const result = {
          sampleRate: message.sampleRate,
          channels: asFloat32Channels(message.channels),
        };
        pending.delete(message.operationId);
        operation.resolve(result);
      } catch (error) {
        pending.delete(message.operationId);
        operation.reject(error);
      }
    }
  }

  function onWorkerError(event) {
    rejectAll(new Error(event?.message ?? "TTS worker failed"));
  }

  function assertAvailable() {
    if (disposed) {
      throw new Error("TTS worker backend has been disposed");
    }
  }

  function request(kind, message) {
    assertAvailable();
    const operationId = nextOperationId();
    const promise = new Promise((resolve, reject) => {
      pending.set(operationId, { kind, resolve, reject });
    });
    try {
      worker.postMessage({ ...message, operationId });
    } catch (error) {
      pending.delete(operationId);
      return Promise.reject(error);
    }
    return promise;
  }

  worker.addEventListener("message", onMessage);
  worker.addEventListener("error", onWorkerError);
  worker.addEventListener("messageerror", onWorkerError);

  return Object.freeze({
    revision,
    warmUp() {
      return request("warmup", {
        type: `${MESSAGE_PREFIX}warmup`,
        voices: VOICE_IDENTITY_IDS.map((identity) => ({
          identity,
          speaker: speakers[identity],
        })),
      });
    },
    synthesize({ text, identity }) {
      if (!VOICE_IDENTITY_IDS.includes(identity)) {
        return Promise.reject(new RangeError(`Unknown TapTalk identity: ${identity}`));
      }
      return request("synthesis", {
        type: `${MESSAGE_PREFIX}synthesize`,
        text,
        identity,
        speaker: speakers[identity],
      });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      worker.removeEventListener?.("message", onMessage);
      worker.removeEventListener?.("error", onWorkerError);
      worker.removeEventListener?.("messageerror", onWorkerError);
      rejectAll(new Error("TTS worker backend was disposed"));
      try {
        worker.postMessage({ type: `${MESSAGE_PREFIX}dispose` });
      } finally {
        if (terminateOnDispose) {
          worker.terminate?.();
        }
      }
    },
  });
}
