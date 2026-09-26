// Serve the production build (dist/) with the Content-Security-Policy from
// src-tauri/tauri.conf.json, so the smoke tests run under the same CSP as the app.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const conf = JSON.parse(fs.readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
const csp = Object.entries(conf.app.security.csp).map(([directive, value]) => `${directive} ${value}`).join("; ");
const port = Number(process.env.PORT || 4173);

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error("dist/index.html is missing. Build the frontend first: npx vite build");
  process.exit(1);
}

const types = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.join(dist, urlPath);
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end();
    return;
  }
  const headers = { "Content-Type": types[path.extname(file)] || "application/octet-stream" };
  if (file.endsWith(".html")) headers["Content-Security-Policy"] = csp;
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Serving dist/ on http://127.0.0.1:${port}`));
