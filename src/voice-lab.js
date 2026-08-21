const buttons = [...document.querySelectorAll("[data-audio]")];
const status = document.querySelector("#voice-status");
let activeAudio = null;

async function playSample(button) {
  const source = button.dataset.audio;
  if (!source) {
    return;
  }

  activeAudio?.pause();
  activeAudio = new Audio(source);
  const voiceName = button.closest(".voice-card")?.querySelector("p")?.textContent;
  status.textContent = `Playing ${voiceName}: ${button.textContent.trim()}`;

  try {
    activeAudio.addEventListener(
      "ended",
      () => {
        status.textContent = "Finished. Try the matching comparison.";
      },
      { once: true },
    );
    await activeAudio.play();
  } catch (error) {
    status.textContent = `Sample could not play: ${error.message}`;
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    void playSample(button);
  });
}

window.addEventListener("pagehide", () => {
  activeAudio?.pause();
});
