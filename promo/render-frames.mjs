/* Deterministic frame capture for the Lagan promo.
 * Serves promo/ over http, drives the scene via window.__seek(ms), and writes
 * one PNG per frame at 30fps for each output format. */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATS = {
  "9x16": { width: 1080, height: 1920 },
  appstore: { width: 1290, height: 2796 }, // iPhone 6.7" App Store preview
};

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
}
const onlyFmt = arg("fmt");
const frameLimit = arg("frames") ? parseInt(arg("frames"), 10) : null;

// ── tiny static server rooted at promo/ ─────────────────────────────────────
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/scene/index.html";
      const file = path.join(__dirname, p);
      if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function captureFormat(browser, base, fmtName, dims) {
  const outDir = path.join(__dirname, "frames", fmtName);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const page = await browser.newPage({
    viewport: { width: dims.width, height: dims.height },
    deviceScaleFactor: 1,
  });
  await page.goto(`${base}/scene/index.html?capture=1`, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__ready === true", null, { timeout: 30000 });

  const fps = await page.evaluate(() => window.__fps);
  const durationMs = await page.evaluate(() => window.__durationMs);
  let totalFrames = Math.round((durationMs / 1000) * fps);
  if (frameLimit) totalFrames = Math.min(totalFrames, frameLimit);

  process.stdout.write(
    `\n[${fmtName}] ${dims.width}x${dims.height} · ${totalFrames} frames @ ${fps}fps\n`,
  );
  for (let f = 0; f < totalFrames; f++) {
    const ms = (f / fps) * 1000;
    await page.evaluate((t) => window.__seek(t), ms);
    const name = `frame_${String(f).padStart(5, "0")}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    if (f % 30 === 0 || f === totalFrames - 1) {
      process.stdout.write(`\r  frame ${f + 1}/${totalFrames}`);
    }
  }
  process.stdout.write("\n");
  await page.close();
}

(async () => {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    for (const [name, dims] of Object.entries(FORMATS)) {
      if (onlyFmt && name !== onlyFmt) continue;
      await captureFormat(browser, base, name, dims);
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log("\n✓ Frames rendered to promo/frames/<format>/");
})();
