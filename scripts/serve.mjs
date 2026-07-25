import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createServer } from "node:http";

const projectRoot = resolve(import.meta.dirname, "..");
const host = "127.0.0.1";
const requestedPort = Number.parseInt(process.env.TAPTALK_PORT ?? "4173", 10);
const port = Number.isSafeInteger(requestedPort) ? requestedPort : 4173;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const allowed =
    pathname === "/" ||
    pathname === "/index.html" ||
    pathname.startsWith("/src/");

  if (!allowed) {
    response.writeHead(404).end("Not found");
    return;
  }

  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(projectRoot, requestedPath);
  if (
    filePath !== projectRoot &&
    !filePath.startsWith(`${projectRoot}${sep}`)
  ) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!(await stat(filePath)).isFile()) {
      throw new Error("Not a file");
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'none'; frame-ancestors 'none'",
      "Content-Type":
        contentTypes[extname(filePath)] ?? "application/octet-stream",
      "Permissions-Policy": "camera=(self), microphone=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`TapTalk development server: http://${host}:${port}`);
});

