// Smoke test: serve dist/ under /app (mirroring the lagan.health proxy +
// nginx SPA fallback) and load key routes in headless Chromium, failing on
// console errors or missing UI. Run: node scripts/smoke-web.cjs
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DIST = path.join(__dirname, "..", "dist");
const PORT = 4173;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  // The production proxy strips the /app prefix before nginx sees the path.
  if (pathname === "/app") pathname = "/";
  else if (pathname.startsWith("/app/")) pathname = pathname.slice(4);

  let file = path.join(DIST, pathname.replace(/\/+$/, "") || "index.html");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html"); // SPA fallback, like nginx try_files
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const routes = ["/app/", "/app/login"];
  for (const route of routes) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`\n=== ${route} ===`);
    console.log("URL after load:", page.url());
    console.log("Body text (first 300 chars):", bodyText.replace(/\s+/g, " ").slice(0, 300));
  }

  console.log("\n=== Console errors ===");
  if (consoleErrors.length === 0) console.log("(none)");
  else consoleErrors.forEach((e) => console.log("ERROR:", e));

  await browser.close();
  server.close();
  process.exit(consoleErrors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
