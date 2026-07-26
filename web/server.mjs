/**
 * Production static server for Azure App Service (Linux).
 *
 * Why not `pm2 serve --spa`?
 * That mode returns index.html (200) for *missing* /assets/*.js hashes.
 * Android Chrome often keeps a cached index that points at old chunk names
 * after a deploy — the browser then executes HTML as a module and the app
 * goes blank / "not active". Real 404s for assets force a clean reload.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT || process.env.WEBSITES_PORT || 8080);
const BUILD_ID =
  process.env.BABITK_BUILD_ID?.trim() ||
  (() => {
    try {
      const stat = fs.statSync(path.join(ROOT, "index.html"));
      return `mtime-${stat.mtimeMs | 0}`;
    } catch {
      return "unknown";
    }
  })();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? Buffer.from(body) : body;
  res.writeHead(status, {
    "Content-Length": payload.length,
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, obj, extraHeaders = {}) {
  send(res, status, JSON.stringify(obj), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
}

function safeJoin(root, pathname) {
  const resolved = path.resolve(root, "." + pathname);
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

const indexHtml = readFileSafe(path.join(ROOT, "index.html"));

// Bind ASAP so Azure health probes succeed during slow cert/volume warmup.
const server = http.createServer((req, res) => {
  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/health" || pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        service: "babitk-web",
        buildId: BUILD_ID,
        ts: Date.now(),
      });
      return;
    }

    // Never SPA-fallback API paths — Azure previously served HTML 200 here,
    // which broke clients expecting JSON (usage, billing, sync).
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      sendJson(res, 404, {
        ok: false,
        error: "api_not_on_static_host",
        message: "API is served by Convex, not this static host",
      });
      return;
    }

    if (pathname === "/") pathname = "/index.html";

    const filePath = safeJoin(ROOT, pathname);
    if (!filePath) {
      send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    const isAsset = pathname.startsWith("/assets/");
    const data = readFileSafe(filePath);
    if (data) {
      const ext = path.extname(filePath).toLowerCase();
      const type = MIME[ext] || "application/octet-stream";
      const cache =
        isAsset || ext === ".woff" || ext === ".woff2"
          ? "public, max-age=31536000, immutable"
          : pathname.endsWith(".html")
            ? "no-cache, no-store, must-revalidate"
            : "public, max-age=300";
      send(res, 200, data, {
        "Content-Type": type,
        "Cache-Control": cache,
        "X-Content-Type-Options": "nosniff",
        "X-Babitk-Build": BUILD_ID,
      });
      return;
    }

    // Critical: never SPA-fallback hashed asset URLs.
    if (isAsset) {
      send(res, 404, "Asset not found", {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return;
    }

    // Client-side routes → index.html
    if (indexHtml) {
      send(res, 200, indexHtml, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "X-Babitk-Build": BUILD_ID,
      });
      return;
    }

    send(res, 500, "index.html missing", {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (error) {
    console.error("[babitk-web]", error);
    send(res, 500, "Internal Server Error", {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
});

server.listen(PORT, () => {
  console.log(`[babitk-web] listening on ${PORT} root=${ROOT} build=${BUILD_ID}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
