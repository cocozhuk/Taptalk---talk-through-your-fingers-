import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldStartVercelAnalytics,
  startVercelAnalytics,
} from "../src/adapters/vercel-analytics.js";

test("starts page-view analytics on the public Vercel deployment", () => {
  const calls = [];

  assert.equal(
    startVercelAnalytics({
      injectAnalytics: (options) => calls.push(options),
      locationLike: {
        hostname: "taptalk-talk-through-your-fingers.vercel.app",
        protocol: "https:",
      },
    }),
    true,
  );
  assert.deepEqual(calls, [{ mode: "production" }]);
});

test("keeps analytics disabled on every local TapTalk test address", () => {
  for (const locationLike of [
    { hostname: "localhost", protocol: "http:" },
    { hostname: "127.0.0.1", protocol: "http:" },
    { hostname: "192.168.1.194", protocol: "https:" },
    { hostname: "10.0.0.8", protocol: "https:" },
    { hostname: "172.16.4.2", protocol: "https:" },
  ]) {
    assert.equal(shouldStartVercelAnalytics(locationLike), false);
  }
});

test("does not initialize collection on non-Vercel hosts", () => {
  assert.equal(
    shouldStartVercelAnalytics({
      hostname: "taptalk.example",
      protocol: "https:",
    }),
    false,
  );
  assert.equal(
    shouldStartVercelAnalytics({
      hostname: "fake-vercel.app.example",
      protocol: "https:",
    }),
    false,
  );
});

test("does not call the analytics package when collection is disabled", () => {
  let called = false;

  assert.equal(
    startVercelAnalytics({
      injectAnalytics: () => {
        called = true;
      },
      locationLike: {
        hostname: "127.0.0.1",
        protocol: "http:",
      },
    }),
    false,
  );
  assert.equal(called, false);
});
