import assert from "node:assert/strict";
import test from "node:test";

import {
  detectInterfaceMode,
  INTERFACE_MODES,
  localMobileScreenPreview,
  selectInterfaceMode,
} from "../src/ui/interface-mode.js";

const IPHONE_SAFARI_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";

test("selects the iPhone flow for iPhone Safari", () => {
  assert.equal(
    detectInterfaceMode({
      platform: "iPhone",
      userAgent: IPHONE_SAFARI_USER_AGENT,
    }),
    INTERFACE_MODES.iphone,
  );
});

test("selects the iPhone flow for third-party iPhone browsers", () => {
  assert.equal(
    detectInterfaceMode({
      platform: "iPhone",
      userAgent: IPHONE_SAFARI_USER_AGENT.replace(
        "Version/18.0 Mobile/15E148 Safari/604.1",
        "CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1",
      ),
    }),
    INTERFACE_MODES.iphone,
  );
});

test("preserves the desktop interface on macOS", () => {
  assert.equal(
    detectInterfaceMode({
      platform: "MacIntel",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) " +
        "AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
    }),
    INTERFACE_MODES.desktop,
  );
});

test("excludes iPad in both mobile and desktop-site user-agent modes", () => {
  const mobileIPad = {
    maxTouchPoints: 5,
    platform: "iPad",
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) " +
      "AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  };
  const desktopSiteIPad = {
    maxTouchPoints: 5,
    platform: "MacIntel",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) " +
      "AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15",
  };

  assert.equal(detectInterfaceMode(mobileIPad), INTERFACE_MODES.desktop);
  assert.equal(detectInterfaceMode(desktopSiteIPad), INTERFACE_MODES.desktop);
});

test("an explicit iPad identity wins over a conflicting iPhone token", () => {
  assert.equal(
    detectInterfaceMode({
      maxTouchPoints: 5,
      platform: "iPad",
      userAgent: IPHONE_SAFARI_USER_AGENT,
    }),
    INTERFACE_MODES.desktop,
  );
});

test("viewport and orientation changes cannot alter the selected mode", () => {
  const navigatorLike = {
    platform: "iPhone",
    userAgent: IPHONE_SAFARI_USER_AGENT,
    viewportWidth: 390,
    orientation: "portrait",
  };

  const initialMode = detectInterfaceMode(navigatorLike);
  navigatorLike.viewportWidth = 844;
  navigatorLike.orientation = "landscape";

  assert.equal(initialMode, INTERFACE_MODES.iphone);
  assert.equal(detectInterfaceMode(navigatorLike), initialMode);
});

test("defaults unknown and non-iPhone mobile devices to desktop", () => {
  assert.equal(detectInterfaceMode(undefined), INTERFACE_MODES.desktop);
  assert.equal(
    detectInterfaceMode({
      platform: "Linux armv8l",
      userAgent:
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 " +
        "Chrome/126.0.0.0 Mobile Safari/537.36",
    }),
    INTERFACE_MODES.desktop,
  );
});

test("local visual QA may preview either interface without affecting production", () => {
  const macNavigator = {
    platform: "MacIntel",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)",
  };
  assert.equal(
    selectInterfaceMode({
      navigatorLike: macNavigator,
      locationLike: {
        hostname: "127.0.0.1",
        search: "?taptalk-interface=iphone",
      },
    }),
    INTERFACE_MODES.iphone,
  );
  assert.equal(
    selectInterfaceMode({
      navigatorLike: macNavigator,
      locationLike: {
        hostname: "taptalk.example",
        search: "?taptalk-interface=iphone",
      },
    }),
    INTERFACE_MODES.desktop,
  );
});

test("local visual QA may preview mobile screens only on loopback", () => {
  assert.equal(
    localMobileScreenPreview({
      hostname: "localhost",
      search: "?taptalk-screen=live",
    }),
    "live",
  );
  assert.equal(
    localMobileScreenPreview({
      hostname: "localhost",
      search: "?taptalk-screen=unknown",
    }),
    null,
  );
  assert.equal(
    localMobileScreenPreview({
      hostname: "taptalk.example",
      search: "?taptalk-screen=live",
    }),
    null,
  );
});
