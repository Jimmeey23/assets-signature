import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { cfg, apiConfigured, handleHealth, handleSubmit, sendJson, rateLimited } from "./handlers.mjs";

/* ───────── Static files ───────── */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = path.normalize(path.join(cfg.staticDir, urlPath === "/" ? "index.html" : urlPath));
  if (!file.startsWith(cfg.staticDir)) return sendJson(res, 403, { ok: false, error: "Forbidden" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(cfg.staticDir, "index.html");
  if (!fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("App not built yet. Run `npm run build` first.");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

/* ───────── HTTP server ───────── */
const server = http.createServer(async (req, res) => {
  const url = (req.url || "").split("?")[0];
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": cfg.origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      return res.end();
    }
    if (req.method === "GET" && url === "/api/health") {
      return await handleHealth(req, res);
    }
    if (req.method === "POST" && url === "/api/submit") {
      const ip = req.socket.remoteAddress || "unknown";
      if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: "Too many submissions from this device. Try again later." });
      return await handleSubmit(req, res);
    }
    if (req.method === "GET" && !url.startsWith("/api/")) return serveStatic(req, res);
    return sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (e) {
    console.error(e);
    return sendJson(res, 500, { ok: false, error: "Unexpected server error." });
  }
});

server.listen(cfg.port, () => {
  console.log(`Physique 57 asset-declaration server → http://localhost:${cfg.port}`);
  console.log(`  Mailtrap API: ${cfg.host} (${apiConfigured ? "configured" : "NOT configured – set MAILTRAP_API_TOKEN and MAILTRAP_FROM in server/.env"})`);
  console.log(`  Recipient:   ${cfg.to}`);
  console.log(`  From:        ${cfg.from || "(unset)"}`);
  console.log(`  Ledger:      ${path.join(cfg.dataDir, "submissions.json")}`);
});
