export const INTERFACE_MODES = Object.freeze({
  desktop: "desktop",
  iphone: "iphone",
});

function readIdentityValue(navigatorLike, property) {
  const value = navigatorLike?.[property];
  return typeof value === "string" ? value : "";
}

/**
 * Selects TapTalk's interface from device identity, not viewport dimensions.
 * This keeps the selected mode unchanged when an iPhone rotates and leaves
 * iPad on the existing desktop experience.
 */
export function detectInterfaceMode(navigatorLike = globalThis.navigator) {
  const userAgent = readIdentityValue(navigatorLike, "userAgent");
  const platform = readIdentityValue(navigatorLike, "platform");
  const identity = `${userAgent} ${platform}`;
  const isIPad =
    /\biPad\b/i.test(identity) ||
    (platform === "MacIntel" && navigatorLike?.maxTouchPoints > 1);

  if (isIPad) {
    return INTERFACE_MODES.desktop;
  }

  return /\biPhone\b/i.test(identity)
    ? INTERFACE_MODES.iphone
    : INTERFACE_MODES.desktop;
}

export function selectInterfaceMode({
  navigatorLike = globalThis.navigator,
  locationLike = globalThis.location,
} = {}) {
  const localHost = ["127.0.0.1", "localhost", "::1"].includes(
    locationLike?.hostname,
  );
  if (localHost) {
    const previewMode = new URLSearchParams(locationLike?.search ?? "").get(
      "taptalk-interface",
    );
    if (Object.values(INTERFACE_MODES).includes(previewMode)) {
      return previewMode;
    }
  }
  return detectInterfaceMode(navigatorLike);
}

export function localMobileScreenPreview(
  locationLike = globalThis.location,
) {
  if (
    !["127.0.0.1", "localhost", "::1"].includes(locationLike?.hostname)
  ) {
    return null;
  }
  const screen = new URLSearchParams(locationLike?.search ?? "").get(
    "taptalk-screen",
  );
  return ["tutorial", "setup", "live"].includes(screen) ? screen : null;
}
