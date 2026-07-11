const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_STABLE_FRAMES = 2;

async function prepareScreenshotPage(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function waitForDocumentFonts(page) {
  await page.evaluate(async () => {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
  });
}

async function waitForStableBounds(locator, options = {}) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const stableFrames = options.stableFrames ?? DEFAULT_STABLE_FRAMES;

  await locator.evaluate(
    (element, settings) =>
      new Promise((resolve, reject) => {
        const startedAt = performance.now();
        let previousBounds;
        let matchingFrames = 0;

        const sample = () => {
          requestAnimationFrame((frameTime) => {
            const rect = element.getBoundingClientRect();
            const bounds = {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            };
            const matchesPrevious =
              previousBounds &&
              bounds.x === previousBounds.x &&
              bounds.y === previousBounds.y &&
              bounds.width === previousBounds.width &&
              bounds.height === previousBounds.height;

            matchingFrames = matchesPrevious ? matchingFrames + 1 : 1;
            previousBounds = bounds;

            if (matchingFrames >= settings.stableFrames) {
              resolve();
              return;
            }
            if (frameTime - startedAt >= settings.timeout) {
              reject(new Error("target bounds did not become stable before screenshot timeout"));
              return;
            }
            sample();
          });
        };

        sample();
      }),
    { stableFrames, timeout },
  );
}

async function captureStableScreenshot(page, options) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const finalUrl = options.finalUrl ?? page.url();
  await page.waitForURL(finalUrl, { timeout });

  const target =
    typeof options.target === "string" || options.target === undefined
      ? page.locator(options.target ?? "body")
      : options.target;

  await target.waitFor({ state: "visible", timeout });
  await waitForDocumentFonts(page);
  await waitForStableBounds(target, {
    timeout,
    stableFrames: options.stableFrames,
  });
  return page.screenshot(options.screenshot);
}

async function navigateAndCaptureStableScreenshot(page, options) {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  await prepareScreenshotPage(page);
  await page.goto(options.url, {
    waitUntil: options.waitUntil ?? "domcontentloaded",
    timeout,
  });
  return captureStableScreenshot(page, options);
}

module.exports = {
  captureStableScreenshot,
  navigateAndCaptureStableScreenshot,
  prepareScreenshotPage,
  waitForDocumentFonts,
  waitForStableBounds,
};
