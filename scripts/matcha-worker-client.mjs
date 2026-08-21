import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";


const projectRoot = resolve(import.meta.dirname, "..");
const workerPath = resolve(projectRoot, "scripts/matcha-worker.py");
const pythonCandidates =
  process.platform === "win32"
    ? [
        resolve(projectRoot, ".matcha-venv/Scripts/python.exe"),
        "python",
      ]
    : [
        resolve(projectRoot, ".matcha-venv/bin/python"),
        "python3",
      ];

export class MatchaWorkerClient {
  constructor() {
    this.worker = null;
    this.pending = new Map();
    this.nextId = 1;
    this.outputBuffer = "";
  }

  async start() {
    if (this.worker) {
      return;
    }

    let python = null;
    for (const candidate of pythonCandidates) {
      if (!candidate.includes("/")) {
        python = candidate;
        break;
      }
      try {
        await access(candidate);
        python = candidate;
        break;
      } catch {
        // Try the next local Python candidate.
      }
    }

    if (!python) {
      throw new Error(
        "Matcha Python runtime is missing. Run npm run setup:matcha.",
      );
    }

    this.worker = spawn(python, [workerPath], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.worker.stdout.setEncoding("utf8");
    this.worker.stdout.on("data", (chunk) => this.consumeOutput(chunk));
    this.worker.once("error", (error) => this.failAll(error));
    this.worker.once("exit", (code) => {
      this.failAll(
        new Error(`Matcha worker stopped with status ${code ?? "unknown"}.`),
      );
      this.worker = null;
    });
  }

  consumeOutput(chunk) {
    this.outputBuffer += chunk;
    let newlineIndex = this.outputBuffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.outputBuffer.slice(0, newlineIndex);
      this.outputBuffer = this.outputBuffer.slice(newlineIndex + 1);
      if (line.trim()) {
        this.handleResponse(JSON.parse(line));
      }
      newlineIndex = this.outputBuffer.indexOf("\n");
    }
  }

  handleResponse(response) {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error));
      return;
    }
    pending.resolve(Buffer.from(response.audio, "base64"));
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  async synthesize(text) {
    await this.start();
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, {
        reject: rejectPromise,
        resolve: resolvePromise,
      });
      this.worker.stdin.write(
        `${JSON.stringify({ id, text })}\n`,
        (error) => {
          if (!error) {
            return;
          }
          this.pending.delete(id);
          rejectPromise(error);
        },
      );
    });
  }

  stop() {
    this.worker?.kill();
    this.worker = null;
  }
}
