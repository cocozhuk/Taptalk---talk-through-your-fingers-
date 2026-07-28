import {
  remove,
  TtsSession,
} from "/vendor/piper/piper-tts-web.js";
import { PIPER_VOICE_MODELS } from "./adapters/piper-voice.js";

const VOICES = Object.freeze({
  english: Object.freeze({
    voiceId: PIPER_VOICE_MODELS.en,
    text: "Hello, thank you.",
  }),
  mandarin: Object.freeze({
    voiceId: PIPER_VOICE_MODELS.zh,
    text: "你好，谢谢。",
  }),
});

const buttons = [...document.querySelectorAll("[data-voice]")];
const status = document.querySelector("#voice-status");
let activeAudio = null;
let activeUrl = null;

function setBusy(busy) {
  for (const button of buttons) {
    button.disabled = busy;
  }
}

async function testVoice(key) {
  const profile = VOICES[key];
  if (!profile) {
    return;
  }

  activeAudio?.pause();
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
  }
  setBusy(true);
  status.textContent = "Preparing the voice… first use can take 15–60 seconds.";

  const createAudio = async () => {
    TtsSession._instance = null;
    const session = await TtsSession.create({
      voiceId: profile.voiceId,
      wasmPaths: {
        onnxWasm: "/vendor/onnxruntime/",
        piperData: "/vendor/piper-wasm/piper_phonemize.data",
        piperWasm: "/vendor/piper-wasm/piper_phonemize.wasm",
      },
      progress: ({ loaded, total }) => {
        if (total > 0) {
          status.textContent = `Downloading voice… ${Math.round(
            (loaded / total) * 100,
          )}%`;
        }
      },
    });
    return session.predict(profile.text);
  };

  try {
    let audioBlob;
    try {
      audioBlob = await createAudio();
    } catch (error) {
      if (!error.message.includes("JSON")) {
        throw error;
      }
      status.textContent = "Repairing the voice cache, then retrying…";
      await remove(profile.voiceId);
      audioBlob = await createAudio();
    }
    activeUrl = URL.createObjectURL(audioBlob);
    activeAudio = new Audio(activeUrl);
    activeAudio.addEventListener(
      "ended",
      () => {
        status.textContent = "Finished. Test the other voice or replay this one.";
      },
      { once: true },
    );
    await activeAudio.play();
    status.textContent = "Playing…";
  } catch (error) {
    status.textContent = `Voice test failed: ${error.message}`;
  } finally {
    setBusy(false);
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    void testVoice(button.dataset.voice);
  });
}

window.addEventListener("pagehide", () => {
  activeAudio?.pause();
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
  }
});
