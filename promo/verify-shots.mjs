/* Dev helper: screenshot one representative frame per scene for visual QA. */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/scene/index.html";
  const file = path.join(__dirname, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const shots = {
  signin: 1500,
  wizard: 6500,
  today: 10800,
  coach: 16200,
  detail: 19200,
  progress: 23400,
  leaderboard: 25800,
  cta: 29200,
};
const outDir = path.join(__dirname, "verify");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});
await page.goto(`${base}/scene/index.html?capture=1`, { waitUntil: "networkidle" });
await page.waitForFunction("window.__ready === true", null, { timeout: 30000 });
for (const [name, ms] of Object.entries(shots)) {
  await page.evaluate((t) => window.__seek(t), ms);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log(`shot ${name} @ ${ms}ms`);
}
await browser.close();
server.close();
console.log("✓ verify/ shots written");
