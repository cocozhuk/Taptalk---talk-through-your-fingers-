import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";


const projectRoot = resolve(import.meta.dirname, "..");
const environmentDirectory = resolve(projectRoot, ".matcha-venv");
const environmentPython =
  process.platform === "win32"
    ? resolve(environmentDirectory, "Scripts/python.exe")
    : resolve(environmentDirectory, "bin/python");
const systemPython = process.platform === "win32" ? "python" : "python3";

function run(command, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PIP_CACHE_DIR: join(tmpdir(), "taptalk-pip-cache"),
      },
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(`${command} exited with status ${code}`),
        );
      }
    });
  });
}

try {
  await access(environmentPython);
} catch {
  console.log("Creating TapTalk's local Matcha environment…");
  await run(systemPython, [
    "-m",
    "venv",
    environmentDirectory,
  ]);
}

console.log("Installing the local Matcha speech runtime…");
await run(environmentPython, [
  "-m",
  "pip",
  "install",
  "--requirement",
  resolve(projectRoot, "requirements-matcha.txt"),
]);
console.log("Matcha is ready. Run npm run dev to start TapTalk.");
