import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "dist");
const mediaPipeDirectory = resolve(
  projectRoot,
  "node_modules/@mediapipe/tasks-vision",
);
const requiredInputs = [
  "index.html",
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

console.log("Built static TapTalk prototype in dist/");
