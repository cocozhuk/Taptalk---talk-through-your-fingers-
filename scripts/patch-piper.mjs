import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const piperPath = resolve(
  import.meta.dirname,
  "../node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js",
);
const source = await readFile(piperPath, "utf8");
const original = `    const phonemeIds = await new Promise(async (resolve) => {
      const module = await __privateGet(this, _createPiperPhonemize).call(this, {
        print: (data) => {
          resolve(JSON.parse(data).phoneme_ids);
        },
        printErr: (message) => {
          throw new Error(message);
        },
        locateFile: (url) => {
          if (url.endsWith(".wasm")) return __privateGet(this, _wasmPaths).piperWasm;
          if (url.endsWith(".data")) return __privateGet(this, _wasmPaths).piperData;
          return url;
        }
      });
      module.callMain([
        "-l",
        __privateGet(this, _modelConfig).espeak.voice,
        "--input",
        input,
        "--espeak_data",
        "/espeak-ng-data"
      ]);
    });`;
const patched = `    const phonemeOutput = [];
    const module = await __privateGet(this, _createPiperPhonemize).call(this, {
      print: (data) => {
        phonemeOutput.push(data);
      },
      printErr: (message) => {
        throw new Error(message);
      },
      locateFile: (url) => {
        if (url.endsWith(".wasm")) return __privateGet(this, _wasmPaths).piperWasm;
        if (url.endsWith(".data")) return __privateGet(this, _wasmPaths).piperData;
        return url;
      }
    });
    module.callMain([
      "-l",
      __privateGet(this, _modelConfig).espeak.voice,
      "--input",
      input,
      "--espeak_data",
      "/espeak-ng-data"
    ]);
    const phonemeIds = JSON.parse(phonemeOutput.join("")).phoneme_ids;`;

if (source.includes(patched)) {
  process.exit(0);
}
if (!source.includes(original)) {
  throw new Error("The installed Piper package does not match the pinned patch.");
}
await writeFile(piperPath, source.replace(original, patched));
