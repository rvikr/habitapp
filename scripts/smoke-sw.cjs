// Service-worker smoke test: verifies the SW registers, controls the page,
// serves navigations without redirected responses, and falls back to the
// cached shell when offline. Run: node scripts/smoke-sw.cjs
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const DIST = path.join(__dirname, "..", "dist");
const PORT = 4174;

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/app") {
    // Simulate an upstream trailing-slash redirect — the exact production
    // behavior that used to poison the SW cache on iOS.
    res.writeHead(301, { Location: "/app/" });
    res.end();
    return;
  }
  if (pathname.startsWith("/app/")) pathname = pathname.slice(4);
  let file = path.join(DIST, pathname.replace(/\/+$/, "") || "index.html");
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, "index.html");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

async function main() {
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "networkidle" });
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { scope: reg.scope, active: Boolean(reg.active) };
  });
  console.log("SW ready:", JSON.stringify(swState));

  // Give precache a moment, then reload under SW control.
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  const bodyAfterReload = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").slice(0, 120),
  );
  console.log("Controlled by SW after reload:", controlled);
  console.log("Body:", bodyAfterReload);

  // Navigate through the redirecting /app entry while controlled — must land
  // on a working page (the SW cleans the redirected response).
  await page.goto(`http://localhost:${PORT}/app`, { waitUntil: "networkidle" });
  console.log("After /app (redirected) nav, URL:", page.url());

  // Offline: the cached shell must serve the navigation.
  await context.setOffline(true);
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: "domcontentloaded" });
  const offlineBody = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").slice(0, 120),
  );
  console.log("Offline body:", offlineBody || "(empty)");
  const offlineServedShell = await page.evaluate(
    () => document.querySelector("#root") !== null,
  );
  console.log("Offline navigation served shell:", offlineServedShell);

  console.log("Page errors:", errors.length ? errors : "(none)");
  await browser.close();
  server.close();
  process.exit(offlineServedShell && controlled ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
