import { VOICE_IDENTITIES, VOICE_IDENTITY_IDS, routeVoiceIdentity } from "./identities.mjs";
import { LatencyTracker } from "./latency-tracker.mjs";
import { PcmCache } from "./pcm-cache.mjs";

const ESTIMATED_ONSET_BASIS = "estimated-output";

export class TapTalkSpeechError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "TapTalkSpeechError";
    this.code = code;
  }
}

function asSpeechError(error, fallbackCode) {
  if (error instanceof TapTalkSpeechError) {
    return error;
  }
  return new TapTalkSpeechError(fallbackCode, error?.message ?? String(error), {
    cause: error,
  });
}

function validatePcm(pcm) {
  if (
    pcm === null ||
    typeof pcm !== "object" ||
    !Number.isFinite(pcm.sampleRate) ||
    pcm.sampleRate <= 0 ||
    !Array.isArray(pcm.channels) ||
    pcm.channels.length < 1 ||
    pcm.channels.some((channel) => !(channel instanceof Float32Array))
  ) {
    throw new TapTalkSpeechError(
      "invalid-audio",
      "The synthesis backend returned invalid PCM audio",
    );
  }

  const frameCount = pcm.channels[0].length;
  if (
    frameCount === 0 ||
    pcm.channels.some((channel) => channel.length !== frameCount)
  ) {
    throw new TapTalkSpeechError(
      "invalid-audio",
      "PCM channels must be non-empty and have equal lengths",
    );
  }

  return Object.freeze({
    sampleRate: pcm.sampleRate,
    channels: Object.freeze(pcm.channels),
  });
}

function validateTextBoundary(text) {
  if (typeof text !== "string" || text.length === 0) {
    throw new TapTalkSpeechError("invalid-request", "text must be a non-empty string");
  }
}

function validateRequest(request) {
  if (request === null || typeof request !== "object") {
    throw new TapTalkSpeechError("invalid-request", "A speech request is required");
  }
  if (typeof request.requestId !== "string" || request.requestId.length === 0) {
    throw new TapTalkSpeechError("invalid-request", "requestId must be a non-empty string");
  }
  validateTextBoundary(request.text);
  if (!Number.isFinite(request.confirmedAtMs)) {
    throw new TapTalkSpeechError(
      "invalid-request",
      "confirmedAtMs must use the performance time origin",
    );
  }

  try {
    return routeVoiceIdentity(request.language, request.gender);
  } catch (error) {
    throw new TapTalkSpeechError("unsupported-route", error.message, { cause: error });
  }
}

function validatePreparation(preparation) {
  if (preparation === null || typeof preparation !== "object") {
    throw new TapTalkSpeechError("invalid-request", "A preparation request is required");
  }
  validateTextBoundary(preparation.text);

  try {
    return routeVoiceIdentity(preparation.language, preparation.gender);
  } catch (error) {
    throw new TapTalkSpeechError("unsupported-route", error.message, { cause: error });
  }
}

function cacheKey(backendRevision, identity, text) {
  return JSON.stringify([backendRevision, identity.id, text]);
}

function createAudioBuffer(audioContext, pcm) {
  const frameCount = pcm.channels[0].length;
  const buffer = audioContext.createBuffer(pcm.channels.length, frameCount, pcm.sampleRate);

  for (let index = 0; index < pcm.channels.length; index += 1) {
    if (typeof buffer.copyToChannel === "function") {
      buffer.copyToChannel(pcm.channels[index], index);
    } else {
      buffer.getChannelData(index).set(pcm.channels[index]);
    }
  }
  return buffer;
}

function setAudioParam(audioParam, value, atTime) {
  if (typeof audioParam.setValueAtTime === "function") {
    audioParam.setValueAtTime(value, atTime);
  } else {
    audioParam.value = value;
  }
}

function rampAudioParam(audioParam, value, atTime) {
  if (typeof audioParam.linearRampToValueAtTime === "function") {
    audioParam.linearRampToValueAtTime(value, atTime);
  } else {
    audioParam.value = value;
  }
}

function stopNode(node, atTime) {
  try {
    node.stop(atTime);
  } catch (error) {
    if (error?.name !== "InvalidStateError") {
      throw error;
    }
  }
}

function disconnectNodes(nodes) {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // Disconnect is best-effort during teardown.
    }
  }
}

function estimateAudibleAtMs(audioContext, clock, startAtContextTime) {
  const nowMs = clock.now();
  const untilStartMs = Math.max(0, startAtContextTime - audioContext.currentTime) * 1000;
  const outputLatencySeconds =
    Number.isFinite(audioContext.outputLatency) && audioContext.outputLatency >= 0
      ? audioContext.outputLatency
      : Number.isFinite(audioContext.baseLatency) && audioContext.baseLatency >= 0
        ? audioContext.baseLatency
        : 0;
  return nowMs + untilStartMs + outputLatencySeconds * 1000;
}

function abortable(promise, signal) {
  if (signal === undefined) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(
      new TapTalkSpeechError("cancelled", "Speech request was cancelled before playback"),
    );
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(new TapTalkSpeechError("cancelled", "Speech request was cancelled before playback"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Create TapTalk's browser playback service.
 *
 * Playback has no global queue. Every request preempts the active source, and
 * synthesis finishing after a newer request is discarded before playback.
 */
export function createTapTalkSpeech({
  backend,
  audioContext,
  clock = globalThis.performance,
  onEvent = () => {},
  cacheOptions,
  startLeadSeconds = 0.005,
  playbackRate = 1.75,
  latencyTracker = new LatencyTracker(),
} = {}) {
  if (backend === null || typeof backend !== "object" || typeof backend.synthesize !== "function") {
    throw new TypeError("backend.synthesize is required");
  }
  if (
    audioContext === null ||
    typeof audioContext !== "object" ||
    typeof audioContext.createBufferSource !== "function"
  ) {
    throw new TypeError("A Web Audio-compatible audioContext is required");
  }
  if (clock === null || typeof clock.now !== "function") {
    throw new TypeError("clock.now is required");
  }
  if (!Number.isFinite(startLeadSeconds) || startLeadSeconds < 0) {
    throw new RangeError("startLeadSeconds must be a non-negative number");
  }
  if (!Number.isFinite(playbackRate) || playbackRate <= 0 || playbackRate > 4) {
    throw new RangeError("playbackRate must be greater than 0 and at most 4");
  }

  const cache = new PcmCache(cacheOptions);
  const inFlightSynthesis = new Map();
  const activePlaybacks = new Set();
  const recentRequests = new Map();
  const backendRevision = backend.revision ?? "unversioned";
  let warmUpPromise;
  let disposed = false;
  let latestRequestSequence = 0;

  function emit(event) {
    try {
      onEvent(Object.freeze(event));
    } catch {
      // Observer failures must never interrupt communication.
    }
  }

  async function getPcm(identity, text, signal) {
    const key = cacheKey(backendRevision, identity, text);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return { pcm: cached, cacheStatus: "hit" };
    }

    let synthesis = inFlightSynthesis.get(key);
    let cacheStatus = "shared";
    if (synthesis === undefined) {
      cacheStatus = "miss";
      synthesis = Promise.resolve()
        .then(() => backend.synthesize({ text, identity: identity.id }))
        .then(validatePcm)
        .then((pcm) => {
          if (!disposed) {
            cache.set(key, pcm);
          }
          return pcm;
        })
        .finally(() => {
          inFlightSynthesis.delete(key);
        });
      inFlightSynthesis.set(key, synthesis);
    }

    const pcm = await abortable(synthesis, signal);
    return { pcm, cacheStatus };
  }

  async function ensureAudioRunning() {
    if (audioContext.state === "running") {
      return;
    }
    if (typeof audioContext.resume === "function") {
      try {
        await audioContext.resume();
      } catch (error) {
        throw new TapTalkSpeechError(
          "audio-locked",
          "Audio could not be unlocked from the current browser interaction",
          { cause: error },
        );
      }
    }
    if (audioContext.state !== "running") {
      throw new TapTalkSpeechError(
        "audio-locked",
        "Audio is locked; call unlock() from a user activation before speaking",
      );
    }
  }

  function rememberRequest(request, identity) {
    recentRequests.set(request.requestId, {
      identity: identity.id,
      confirmedAtMs: request.confirmedAtMs,
    });
    if (recentRequests.size > 256) {
      recentRequests.delete(recentRequests.keys().next().value);
    }
  }

  async function prepare(preparation) {
    if (disposed) {
      throw new TapTalkSpeechError("disposed", "Speech service has been disposed");
    }
    const identity = validatePreparation(preparation);
    const result = await getPcm(identity, preparation.text);
    return Object.freeze({
      identity: identity.id,
      cacheStatus: result.cacheStatus,
      durationMs: (result.pcm.channels[0].length / result.pcm.sampleRate) * 1000,
    });
  }

  async function warmUp(preparations = []) {
    if (!Array.isArray(preparations)) {
      throw new TypeError("warmUp preparations must be an array");
    }
    if (disposed) {
      throw new TapTalkSpeechError("disposed", "Speech service has been disposed");
    }

    if (warmUpPromise === undefined) {
      warmUpPromise = Promise.resolve()
        .then(() => backend.warmUp?.({ identities: VOICE_IDENTITY_IDS }))
        .catch((error) => {
          warmUpPromise = undefined;
          throw asSpeechError(error, "warmup-failed");
        });
    }

    await warmUpPromise;
    return Promise.all(preparations.map((preparation) => prepare(preparation)));
  }

  async function unlock() {
    if (disposed) {
      throw new TapTalkSpeechError("disposed", "Speech service has been disposed");
    }
    try {
      await ensureAudioRunning();
      return audioContext.state === "running";
    } catch (error) {
      throw asSpeechError(error, "audio-locked");
    }
  }

  async function speak(request) {
    let identity;
    let requestSequence;
    try {
      if (disposed) {
        throw new TapTalkSpeechError("disposed", "Speech service has been disposed");
      }
      identity = validateRequest(request);
      requestSequence = ++latestRequestSequence;
      for (const playback of [...activePlaybacks]) {
        playback.stop("interrupted");
      }
      rememberRequest(request, identity);
      emit({
        type: "speech-requested",
        requestId: request.requestId,
        identity: identity.id,
        confirmedAtMs: request.confirmedAtMs,
      });

      await ensureAudioRunning();
      const { pcm, cacheStatus } = await getPcm(identity, request.text, request.signal);
      if (request.signal?.aborted) {
        throw new TapTalkSpeechError("cancelled", "Speech request was cancelled before playback");
      }
      if (disposed || requestSequence !== latestRequestSequence) {
        throw new TapTalkSpeechError(
          "cancelled",
          "Speech request was replaced by a newer activation",
        );
      }

      const source = audioContext.createBufferSource();
      source.buffer = createAudioBuffer(audioContext, pcm);

      const dryGain = audioContext.createGain();
      const wetFilter = audioContext.createBiquadFilter();
      const wetRing = audioContext.createGain();
      const wetGain = audioContext.createGain();
      const compressor = audioContext.createDynamicsCompressor();
      const master = audioContext.createGain();
      const oscillator = audioContext.createOscillator();
      const nodes = [source, dryGain, wetFilter, wetRing, wetGain, compressor, master, oscillator];
      const effect = identity.processing;
      const startAt = audioContext.currentTime + startLeadSeconds;
      const durationSeconds =
        pcm.channels[0].length / pcm.sampleRate / playbackRate;
      const endAt = startAt + durationSeconds;

      setAudioParam(source.playbackRate, playbackRate, startAt);
      wetFilter.type = "bandpass";
      setAudioParam(wetFilter.frequency, effect.bandpassFrequencyHz, startAt);
      setAudioParam(wetFilter.Q, effect.bandpassQ, startAt);
      setAudioParam(dryGain.gain, effect.dryGain, startAt);
      setAudioParam(wetGain.gain, effect.wetGain, startAt);
      setAudioParam(wetRing.gain, 0, startAt);
      oscillator.type = "sine";
      setAudioParam(oscillator.frequency, effect.ringFrequencyHz, startAt);

      setAudioParam(compressor.threshold, -18, startAt);
      setAudioParam(compressor.knee, 12, startAt);
      setAudioParam(compressor.ratio, 3, startAt);
      setAudioParam(compressor.attack, 0.003, startAt);
      setAudioParam(compressor.release, 0.12, startAt);

      setAudioParam(master.gain, 0, startAt);
      rampAudioParam(master.gain, 0.92, startAt + Math.min(0.008, durationSeconds / 4));
      if (durationSeconds > 0.016) {
        setAudioParam(master.gain, 0.92, endAt - 0.008);
        rampAudioParam(master.gain, 0, endAt);
      }

      source.connect(dryGain);
      dryGain.connect(compressor);
      source.connect(wetFilter);
      wetFilter.connect(wetRing);
      oscillator.connect(wetRing.gain);
      wetRing.connect(wetGain);
      wetGain.connect(compressor);
      compressor.connect(master);
      master.connect(audioContext.destination);

      const estimatedAudibleAtMs = estimateAudibleAtMs(audioContext, clock, startAt);
      const onset = latencyTracker.record({
        requestId: request.requestId,
        identity: identity.id,
        confirmedAtMs: request.confirmedAtMs,
        onsetAtMs: estimatedAudibleAtMs,
        basis: ESTIMATED_ONSET_BASIS,
      });

      let stopReason = "ended";
      let endedResolve;
      const ended = new Promise((resolve) => {
        endedResolve = resolve;
      });
      const playback = {
        requestId: request.requestId,
        identity: identity.id,
        onset,
        cacheStatus,
        ended,
        stop(reason = "stopped") {
          if (activePlaybacks.has(playback)) {
            stopReason = reason;
            stopNode(source, audioContext.currentTime);
          }
        },
      };

      source.onended = () => {
        activePlaybacks.delete(playback);
        request.signal?.removeEventListener("abort", playback.stop);
        disconnectNodes(nodes);
        const result = Object.freeze({
          requestId: request.requestId,
          identity: identity.id,
          reason: stopReason,
        });
        emit({ type: "speech-ended", ...result });
        endedResolve(result);
      };

      activePlaybacks.add(playback);
      request.signal?.addEventListener("abort", playback.stop, { once: true });
      try {
        oscillator.start(startAt);
        stopNode(oscillator, endAt);
        source.start(startAt);
      } catch (error) {
        activePlaybacks.delete(playback);
        request.signal?.removeEventListener("abort", playback.stop);
        stopNode(oscillator, audioContext.currentTime);
        disconnectNodes(nodes);
        throw error;
      }
      emit({
        type: "speech-scheduled",
        requestId: request.requestId,
        identity: identity.id,
        cacheStatus,
        onset,
      });
      return Object.freeze(playback);
    } catch (error) {
      const speechError = asSpeechError(error, "synthesis-failed");
      emit({
        type: "speech-failed",
        requestId: request?.requestId,
        identity: identity?.id,
        code: speechError.code,
        message: speechError.message,
      });
      throw speechError;
    }
  }

  function recordAudibleOnset({
    requestId,
    audibleAtMs,
    basis = "loopback",
    confirmedAtMs,
    identity,
  }) {
    if (basis === ESTIMATED_ONSET_BASIS) {
      throw new RangeError("Use a distinct basis for observed onset measurements");
    }
    const remembered = recentRequests.get(requestId);
    const resolvedConfirmedAt = confirmedAtMs ?? remembered?.confirmedAtMs;
    const resolvedIdentity = identity ?? remembered?.identity;
    if (!Number.isFinite(resolvedConfirmedAt) || typeof resolvedIdentity !== "string") {
      throw new TapTalkSpeechError(
        "unknown-request",
        "Observed onset needs a known requestId or explicit request metadata",
      );
    }

    return latencyTracker.record({
      requestId,
      identity: resolvedIdentity,
      confirmedAtMs: resolvedConfirmedAt,
      onsetAtMs: audibleAtMs,
      basis,
    });
  }

  async function dispose() {
    if (disposed) {
      return;
    }
    disposed = true;
    latestRequestSequence += 1;
    for (const playback of [...activePlaybacks]) {
      playback.stop();
    }
    cache.clear();
    inFlightSynthesis.clear();
    recentRequests.clear();
    await backend.dispose?.();
  }

  return Object.freeze({
    warmUp,
    unlock,
    prepare,
    speak,
    recordAudibleOnset,
    latencySnapshot: (options) => latencyTracker.snapshot(options),
    cacheSnapshot: () => cache.snapshot(),
    activePlaybackCount: () => activePlaybacks.size,
    dispose,
  });
}

export { ESTIMATED_ONSET_BASIS, VOICE_IDENTITIES };
