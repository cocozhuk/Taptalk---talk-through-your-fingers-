const DEFAULT_TARGET_MS = 500;

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return null;
  }

  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil(percentileValue * sortedValues.length) - 1),
  );
  return sortedValues[index];
}

function median(sortedValues) {
  if (sortedValues.length === 0) {
    return null;
  }

  const midpoint = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) {
    return sortedValues[midpoint];
  }
  return (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2;
}

export class LatencyTracker {
  #samples = [];
  #maxSamples;
  #targetMs;

  constructor({ maxSamples = 512, targetMs = DEFAULT_TARGET_MS } = {}) {
    if (!Number.isInteger(maxSamples) || maxSamples < 1) {
      throw new RangeError("maxSamples must be a positive integer");
    }
    if (!Number.isFinite(targetMs) || targetMs <= 0) {
      throw new RangeError("targetMs must be a positive number");
    }

    this.#maxSamples = maxSamples;
    this.#targetMs = targetMs;
  }

  record({ requestId, identity, confirmedAtMs, onsetAtMs, basis }) {
    if (!Number.isFinite(confirmedAtMs) || !Number.isFinite(onsetAtMs)) {
      throw new TypeError("confirmedAtMs and onsetAtMs must use the performance time origin");
    }
    if (onsetAtMs < confirmedAtMs) {
      throw new RangeError("onsetAtMs cannot precede confirmedAtMs");
    }
    if (typeof basis !== "string" || basis.length === 0) {
      throw new TypeError("basis is required");
    }

    const sample = Object.freeze({
      requestId,
      identity,
      confirmedAtMs,
      onsetAtMs,
      latencyMs: onsetAtMs - confirmedAtMs,
      basis,
    });

    this.#samples.push(sample);
    if (this.#samples.length > this.#maxSamples) {
      this.#samples.shift();
    }
    return sample;
  }

  snapshot({ basis = "estimated-output" } = {}) {
    const matching = this.#samples.filter((sample) => sample.basis === basis);
    const values = matching.map((sample) => sample.latencyMs).sort((a, b) => a - b);
    const withinTarget = values.filter((value) => value <= this.#targetMs).length;

    return Object.freeze({
      basis,
      count: values.length,
      targetMs: this.#targetMs,
      medianMs: median(values),
      p95Ms: percentile(values, 0.95),
      maxMs: values.length === 0 ? null : values[values.length - 1],
      withinTargetRatio: values.length === 0 ? null : withinTarget / values.length,
    });
  }

  samples({ basis } = {}) {
    return Object.freeze(
      this.#samples.filter((sample) => basis === undefined || sample.basis === basis),
    );
  }
}
