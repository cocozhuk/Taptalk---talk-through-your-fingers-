import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "dist");
const mediaPipeDirectory = resolve(
  projectRoot,
  "node_modules/@mediapipe/tasks-vision",
);
const piperDirectory = resolve(
  projectRoot,
  "node_modules/@mintplex-labs/piper-tts-web/dist",
);
const piperWasmDirectory = resolve(
  projectRoot,
  "node_modules/@diffusionstudio/piper-wasm/build",
);
const onnxRuntimeDirectory = resolve(
  projectRoot,
  "node_modules/onnxruntime-web/dist",
);
const requiredInputs = [
  "index.html",
  "voice-lab.html",
  "src/main.js",
  "src/styles.css",
  "assets/models/hand_landmarker.task",
  "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
];

for (const input of requiredInputs) {
  const details = await stat(resolve(projectRoot, input));
  if (!details.isFile()) {
    throw new Error(`Required build input is not a file: ${input}`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(projectRoot, "index.html"), resolve(outputDirectory, "index.html"));
await cp(
  resolve(projectRoot, "voice-lab.html"),
  resolve(outputDirectory, "voice-lab.html"),
);
await cp(resolve(projectRoot, "src"), resolve(outputDirectory, "src"), {
  recursive: true,
});
await cp(
  resolve(projectRoot, "assets"),
  resolve(outputDirectory, "assets"),
  { recursive: true },
);
await mkdir(resolve(outputDirectory, "vendor/mediapipe"), {
  recursive: true,
});
await cp(
  resolve(mediaPipeDirectory, "vision_bundle.mjs"),
  resolve(outputDirectory, "vendor/mediapipe/vision_bundle.mjs"),
);
await cp(
  resolve(mediaPipeDirectory, "wasm"),
  resolve(outputDirectory, "vendor/mediapipe/wasm"),
  { recursive: true },
);
await cp(
  piperDirectory,
  resolve(outputDirectory, "vendor/piper"),
  { recursive: true },
);
await mkdir(resolve(outputDirectory, "vendor/piper-wasm"), {
  recursive: true,
});
for (const filename of ["piper_phonemize.data", "piper_phonemize.wasm"]) {
  await cp(
    resolve(piperWasmDirectory, filename),
    resolve(outputDirectory, "vendor/piper-wasm", filename),
  );
}
await mkdir(resolve(outputDirectory, "vendor/onnxruntime/esm"), {
  recursive: true,
});
await cp(
  resolve(onnxRuntimeDirectory, "esm/ort.min.js"),
  resolve(outputDirectory, "vendor/onnxruntime/esm/ort.min.js"),
);
for (const filename of [
  "ort-wasm.wasm",
  "ort-wasm-threaded.wasm",
  "ort-wasm-simd.wasm",
  "ort-wasm-simd-threaded.wasm",
]) {
  await cp(
    resolve(onnxRuntimeDirectory, filename),
    resolve(outputDirectory, "vendor/onnxruntime", filename),
  );
}

console.log("Built static TapTalk prototype in dist/");
