import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(projectRoot, "dist");
const requiredInputs = ["index.html", "src/main.js", "src/styles.css"];

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

console.log("Built static TapTalk prototype in dist/");

