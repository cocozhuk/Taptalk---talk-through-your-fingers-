import assert from "node:assert/strict";
import test from "node:test";
import { LatencyMonitor } from "../src/core/latency-monitor.js";

test("latency monitor reports median and slow-percentile samples", () => {
  const monitor = new LatencyMonitor();
  for (const sample of [10, 20, 30, 40, 100]) {
    monitor.record("audio", sample);
  }

  assert.deepEqual(monitor.summary("audio"), {
    count: 5,
    p50Ms: 30,
    p95Ms: 100,
  });
});

test("latency monitor bounds sample memory and ignores invalid values", () => {
  const monitor = new LatencyMonitor(2);
  monitor.record("visual", 10);
  monitor.record("visual", 20);
  monitor.record("visual", 30);
  monitor.record("visual", Number.NaN);
  monitor.record("unknown", 40);

  assert.deepEqual(monitor.summary("visual"), {
    count: 2,
    p50Ms: 20,
    p95Ms: 30,
  });
});

