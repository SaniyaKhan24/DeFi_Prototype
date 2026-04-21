/**
 * Serves /frontend/* and POST /rpc-proxy → Ganache (JSON-RPC).
 * Lets the browser talk to Ganache without CORS issues (college dev / private-key mode).
 *
 * Usage: npm run dev
 * Env: PORT (default 5174), GANACHE_URL (default http://127.0.0.1:7545)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 8788);
const GANACHE = process.env.GANACHE_URL || "http://127.0.0.1:7545";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function proxyRpc(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Use POST with JSON-RPC body");
    return;
  }
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const target = new URL(GANACHE);
    const mod = target.protocol === "https:" ? require("https") : http;
    const opts = {
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: target.pathname || "/",
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };
    const p = mod.request(opts, (pr) => {
      cors(res);
      res.writeHead(pr.statusCode || 200, {
        "Content-Type": pr.headers["content-type"] || "application/json; charset=utf-8",
      });
      pr.pipe(res);
    });
    p.on("error", (e) => {
      cors(res);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32000, message: "Ganache proxy error: " + e.message + " — is Ganache running at " + GANACHE + "?" },
        })
      );
    });
    p.write(body);
    p.end();
  });
}

function resolveStaticPath(pathname) {
  let rel = decodeURIComponent(pathname.split("?")[0]);
  if (rel === "/" || rel === "") {
    return path.join(ROOT, "frontend", "index.html");
  }
  if (rel === "/frontend" || rel === "/frontend/") {
    return path.join(ROOT, "frontend", "index.html");
  }
  if (!rel.startsWith("/frontend/")) {
    return null;
  }
  rel = rel.slice("/frontend/".length);
  if (!rel || rel.endsWith("/")) {
    return path.join(ROOT, "frontend", rel ? path.join(rel, "index.html") : "index.html");
  }
  const fp = path.normalize(path.join(ROOT, "frontend", rel));
  const rootFront = path.normalize(path.join(ROOT, "frontend"));
  if (!fp.startsWith(rootFront)) {
    return null;
  }
  return fp;
}

function serveStatic(req, res, pathname) {
  const fp = resolveStaticPath(pathname);
  if (!fp) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Open http://127.0.0.1:" + PORT + "/frontend/");
    return;
  }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(fp);
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(fp).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", "http://127.0.0.1");
  if (u.pathname === "/rpc-proxy") {
    return proxyRpc(req, res);
  }
  if (u.pathname === "/frontend") {
    res.writeHead(302, { Location: "/frontend/" });
    res.end();
    return;
  }
  return serveStatic(req, res, u.pathname);
});

server.on("error", function (e) {
  if (e.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Example: set PORT=8790 && npm run dev");
  }
  throw e;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Aureon dev server");
  console.log("  Ganache RPC:", GANACHE);
  console.log("  App:        http://127.0.0.1:" + PORT + "/frontend/");
  console.log("  RPC proxy:  http://127.0.0.1:" + PORT + "/rpc-proxy (for Ganache-key mode)");
});
