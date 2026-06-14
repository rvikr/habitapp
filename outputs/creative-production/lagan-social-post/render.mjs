import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dirname, "post.html");
const pngPath = path.join(dirname, "lagan-mvp-social-post-1080.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: 1080, height: 1080 } });
await browser.close();

console.log(pngPath);
