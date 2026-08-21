import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { MatchaWorkerClient } from "./matcha-worker-client.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const iphoneMode = process.argv.slice(2).includes("--iphone");
const host = iphoneMode ? "0.0.0.0" : "127.0.0.1";
const requestedPort = Number.parseInt(process.env.TAPTALK_PORT ?? "4173", 10);
const port = Number.isSafeInteger(requestedPort) ? requestedPort : 4173;
const tlsOptions = iphoneMode
  ? await loadIphoneTlsOptions(process.argv.slice(2))
  : null;
const protocol = tlsOptions ? "https" : "http";
const speechCache = new Map();
const matchaSpeechCache = new Map();
const matchaWorker = new MatchaWorkerClient();
let nativeSynthesizerPromise = null;
const speechProfiles = Object.freeze({
  en_shelley: Object.freeze({
    nativeVoiceIdentifier: "com.apple.eloquence.en-US.Shelley",
    pitch: "1",
    webRate: "1",
  }),
  zh_tingting: Object.freeze({
    nativeVoiceIdentifier: "com.apple.voice.compact.zh-CN.Tingting",
    pitch: "1",
    webRate: "1",
  }),
});

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".data": "application/octet-stream",
  ".task": "application/octet-stream",
  ".wasm": "application/wasm",
};

const createServer = tlsOptions ? createHttpsServer : createHttpServer;
const server = createServer(tlsOptions ?? {}, async (request, response) => {
  const url = new URL(request.url ?? "/", `${protocol}://${host}:${port}`);
  if (url.pathname === "/api/matcha-speech") {
    await serveMatchaSpeech(url, response);
    return;
  }
  if (url.pathname === "/api/speech") {
    await serveSpeech(url, response);
    return;
  }
  const pathname = decodeURIComponent(url.pathname);
  const filePath = resolvePublicPath(pathname);

  if (!filePath) {
    response.writeHead(404).end("Not found");
    return;
  }

  try {
    if (!(await stat(filePath)).isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' 'nonce-taptalk-local-voice-lab'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://huggingface.co https://*.hf.co; worker-src 'self' blob:; frame-ancestors 'none'",
      "Content-Type":
        contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Permissions-Policy": "camera=(self), microphone=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

async function serveMatchaSpeech(url, response) {
  const text = (url.searchParams.get("text") ?? "").trim();
  if (!text || [...text].length > 20) {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Invalid TapTalk Mandarin speech request");
    return;
  }

  try {
    let audio = matchaSpeechCache.get(text);
    if (!audio) {
      audio = await matchaWorker.synthesize(text);
      matchaSpeechCache.set(text, audio);
      if (matchaSpeechCache.size > 64) {
        matchaSpeechCache.delete(
          matchaSpeechCache.keys().next().value,
        );
      }
    }
    response.writeHead(200, {
      "Cache-Control": "private, max-age=3600",
      "Content-Length": audio.length,
      "Content-Type": "audio/wav",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(audio);
  } catch (error) {
    console.error(`Matcha synthesis failed: ${error.message}`);
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Local Matcha speech synthesis failed");
  }
}

server.listen(port, host, () => {
  if (iphoneMode) {
    console.log(`TapTalk iPhone test server: https://<mac-lan-ip>:${port}`);
    console.log("LAN access is enabled for this process; stop it after testing.");
    return;
  }
  console.log(`TapTalk development server: http://${host}:${port}`);
});

const shutDown = () => {
  matchaWorker.stop();
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);

function resolvePublicPath(pathname) {
  if (pathname === "/" || pathname === "/index.html") {
    return resolve(projectRoot, "index.html");
  }
  if (pathname === "/voice-lab.html") {
    return resolve(projectRoot, "voice-lab.html");
  }

  const routes = [
    {
      prefix: "/src/",
      root: resolve(projectRoot, "src"),
    },
    {
      prefix: "/assets/",
      root: resolve(projectRoot, "assets"),
    },
    {
      prefix: "/vendor/mediapipe/",
      root: resolve(
        projectRoot,
        "node_modules/@mediapipe/tasks-vision",
      ),
    },
    {
      prefix: "/vendor/piper/",
      root: resolve(
        projectRoot,
        "node_modules/@mintplex-labs/piper-tts-web/dist",
      ),
    },
    {
      prefix: "/vendor/piper-wasm/",
      root: resolve(
        projectRoot,
        "node_modules/@diffusionstudio/piper-wasm/build",
      ),
    },
    {
      prefix: "/vendor/onnxruntime/",
      root: resolve(projectRoot, "node_modules/onnxruntime-web/dist"),
    },
    {
      prefix: "/vendor/vercel-analytics/",
      root: resolve(projectRoot, "node_modules/@vercel/analytics/dist"),
    },
  ];

  const route = routes.find(({ prefix }) => pathname.startsWith(prefix));
  if (!route) {
    return null;
  }

  const relativePath = pathname.slice(route.prefix.length);
  const candidate = resolve(route.root, relativePath);
  if (candidate !== route.root && !candidate.startsWith(`${route.root}${sep}`)) {
    return null;
  }
  return candidate;
}

async function loadIphoneTlsOptions(argumentsList) {
  const allowedArguments = new Set(["--iphone", "--cert", "--key"]);
  let certPath = "";
  let keyPath = "";

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!allowedArguments.has(argument)) {
      throw new Error(`Unknown development-server option: ${argument}`);
    }
    if (argument === "--iphone") {
      continue;
    }

    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a certificate file path`);
    }
    if (argument === "--cert") {
      certPath = value;
    } else {
      keyPath = value;
    }
    index += 1;
  }

  if (!certPath || !keyPath) {
    throw new Error(
      "iPhone HTTPS mode requires --cert <path> and --key <path>. See docs/IPHONE_LOCAL_TESTING.md.",
    );
  }

  try {
    return {
      cert: await readFile(resolve(certPath)),
      key: await readFile(resolve(keyPath)),
    };
  } catch (error) {
    throw new Error(`Unable to read the iPhone HTTPS certificate or key: ${error.message}`);
  }
}

async function serveSpeech(url, response) {
  const voiceId = url.searchParams.get("voiceId") ?? "";
  const text = (url.searchParams.get("text") ?? "").trim();
  if (!Object.hasOwn(speechProfiles, voiceId) || !text || text.length > 80) {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Invalid TapTalk speech request");
    return;
  }

  try {
    const audio = await synthesizeSpeech(voiceId, text);
    response.writeHead(200, {
      "Cache-Control": "private, max-age=3600",
      "Content-Length": audio.length,
      "Content-Type": "audio/wav",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(audio);
  } catch (error) {
    console.error(`TapTalk speech synthesis failed: ${error.message}`);
    response.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Local TapTalk speech synthesis failed");
  }
}

function synthesizeSpeech(voiceId, text) {
  const key = `${voiceId}\u0000${text}`;
  let synthesis = speechCache.get(key);
  if (synthesis) {
    return synthesis;
  }

  synthesis = createSpeechAudio(voiceId, text).catch((error) => {
    speechCache.delete(key);
    throw error;
  });
  speechCache.set(key, synthesis);
  if (speechCache.size > 64) {
    speechCache.delete(speechCache.keys().next().value);
  }
  return synthesis;
}

async function createSpeechAudio(voiceId, text) {
  const profile = speechProfiles[voiceId];
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "taptalk-speech-"),
  );
  const intermediatePath = join(temporaryDirectory, "speech.caf");
  const outputPath = join(temporaryDirectory, "speech.wav");
  try {
    if (profile.nativeVoiceIdentifier) {
      const nativeSynthesizer = await ensureNativeSynthesizer();
      await runProcess(nativeSynthesizer, [
        intermediatePath,
        profile.nativeVoiceIdentifier,
        profile.pitch,
        profile.webRate,
        text,
      ]);
    } else {
      await runProcess("/usr/bin/say", [
        "-v",
        profile.voice,
        "-r",
        profile.rate,
        "-o",
        intermediatePath,
        `${profile.prefix}${text}`,
      ]);
    }
    await runProcess("/usr/bin/afconvert", [
      "-f",
      "WAVE",
      "-d",
      "LEI16@24000",
      intermediatePath,
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function ensureNativeSynthesizer() {
  nativeSynthesizerPromise ??= (async () => {
    const buildDirectory = await mkdtemp(
      join(tmpdir(), "taptalk-native-speech-"),
    );
    const binaryPath = join(buildDirectory, "synthesize-speech");
    await runProcess("/usr/bin/xcrun", [
      "clang",
      "-fobjc-arc",
      "-fblocks",
      "-framework",
      "Foundation",
      "-framework",
      "AVFoundation",
      resolve(projectRoot, "scripts/synthesize-speech.m"),
      "-o",
      binaryPath,
    ]);
    return binaryPath;
  })();
  return nativeSynthesizerPromise;
}

function runProcess(command, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const process = spawn(command, argumentsList, { stdio: "ignore" });
    process.once("error", rejectPromise);
    process.once("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`${command} exited with status ${code}`));
      }
    });
  });
}
