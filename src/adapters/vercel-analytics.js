export function shouldStartVercelAnalytics(
  locationLike = globalThis.location,
) {
  const hostname = String(locationLike?.hostname ?? "").toLowerCase();
  return (
    locationLike?.protocol === "https:" &&
    (hostname === "vercel.app" || hostname.endsWith(".vercel.app"))
  );
}

export function startVercelAnalytics({
  injectAnalytics,
  locationLike = globalThis.location,
} = {}) {
  if (!shouldStartVercelAnalytics(locationLike)) {
    return false;
  }
  if (typeof injectAnalytics !== "function") {
    throw new TypeError("Vercel Analytics requires an inject function");
  }

  injectAnalytics({ mode: "production" });
  return true;
}
