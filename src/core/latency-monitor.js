function percentile(samples, requestedPercentile) {
  if (samples.length === 0) {
    return null;
  }
  const sorted = [...samples].sort((first, second) => first - second);
  const index = Math.ceil((requestedPercentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export class LatencyMonitor {
  constructor(sampleLimit = 200) {
    this.sampleLimit = sampleLimit;
    this.samples = {
      visual: [],
      audio: [],
    };
  }

  record(kind, latencyMs) {
    if (!Object.hasOwn(this.samples, kind) || !Number.isFinite(latencyMs)) {
      return;
    }
    const values = this.samples[kind];
    values.push(Math.max(0, latencyMs));
    if (values.length > this.sampleLimit) {
      values.shift();
    }
  }

  summary(kind) {
    const values = this.samples[kind] ?? [];
    return {
      count: values.length,
      p50Ms: percentile(values, 50),
      p95Ms: percentile(values, 95),
    };
  }
}

