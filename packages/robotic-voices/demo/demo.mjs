import { createTapTalkSpeech } from "../src/index.mjs";
import { createDiagnosticToneBackend } from "../src/diagnostic-tone-backend.mjs";

const status = document.querySelector("#status");
const unlockButton = document.querySelector("#unlock");
const voiceButtons = [...document.querySelectorAll(".voice")];
const active = document.querySelector("#active");
const median = document.querySelector("#median");
const p95 = document.querySelector("#p95");
const cache = document.querySelector("#cache");
const events = document.querySelector("#events");
const eventLines = [];
let requestNumber = 0;

const audioContext = new AudioContext({ latencyHint: "interactive" });
const speech = createTapTalkSpeech({
  backend: createDiagnosticToneBackend(),
  audioContext,
  onEvent(event) {
    eventLines.unshift(
      `${event.type} ${event.requestId ?? ""} ${event.identity ?? ""}`.trim(),
    );
    events.textContent = eventLines.slice(0, 12).join("\n");
    renderMetrics();
  },
});

function formatMetric(value) {
  return value === null ? "—" : `${value.toFixed(1)} ms`;
}

function renderMetrics() {
  const latency = speech.latencySnapshot();
  const cacheState = speech.cacheSnapshot();
  active.textContent = String(speech.activePlaybackCount());
  median.textContent = formatMetric(latency.medianMs);
  p95.textContent = formatMetric(latency.p95Ms);
  cache.textContent = `${cacheState.entries} entries / ${cacheState.sizeBytes} bytes`;
}

const preparations = voiceButtons.map((button) => ({
  text: button.dataset.language === "zh" ? "你好" : "Hello",
  language: button.dataset.language,
  gender: button.dataset.gender,
}));

try {
  await speech.warmUp(preparations);
  renderMetrics();
  status.textContent = "Diagnostic cache ready. Unlock audio to test the four routes.";
  unlockButton.disabled = false;
} catch (error) {
  status.textContent = `Warm-up failed: ${error.message}`;
}

unlockButton.addEventListener("click", async () => {
  try {
    await speech.unlock();
    status.textContent =
      "Audio ready. Press routes quickly to hear each newest tone replace the last.";
    unlockButton.disabled = true;
    for (const button of voiceButtons) {
      button.disabled = false;
    }
  } catch (error) {
    status.textContent = `Audio unlock failed: ${error.message}`;
  }
});

for (const button of voiceButtons) {
  button.addEventListener("click", async () => {
    requestNumber += 1;
    const confirmedAtMs = performance.now();
    try {
      const playback = await speech.speak({
        requestId: `diagnostic-${requestNumber}`,
        text: button.dataset.language === "zh" ? "你好" : "Hello",
        language: button.dataset.language,
        gender: button.dataset.gender,
        confirmedAtMs,
      });
      renderMetrics();
      await playback.ended;
      renderMetrics();
    } catch (error) {
      status.textContent = `Playback failed: ${error.code ?? error.message}`;
    }
  });
}
