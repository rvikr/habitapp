const { chromium } = require("playwright");
const {
  captureStableScreenshot,
  prepareScreenshotPage,
} = require("./scripts/first-run/screenshot-helper.cjs");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareScreenshotPage(page);
  await page.goto("http://localhost:3001", { waitUntil: "networkidle" });

  for (const selector of ["#features", "#how-it-works", "#chill-mode"]) {
    const el = page.locator(selector);
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
    }
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.evaluate(() => window.scrollTo(0, 0));

  await captureStableScreenshot(page, {
    finalUrl: "http://localhost:3001/",
    target: "body",
    screenshot: {
      path: "C:/Users/rk/AppData/Local/Temp/lagan-full2.png",
      fullPage: true,
    },
  });

  // Also capture viewport shots of key sections
  for (const [sel, name] of [
    ["#features", "features"],
    ["#how-it-works", "howitworks"],
    ["#chill-mode", "chill"],
  ]) {
    const el = page.locator(sel);
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
      await captureStableScreenshot(page, {
        finalUrl: "http://localhost:3001/",
        target: el,
        screenshot: { path: `C:/Users/rk/AppData/Local/Temp/lagan-${name}.png` },
      });
    }
  }

  console.log("Done");
  await browser.close();
})();
