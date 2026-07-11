import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  navigateAndCaptureStableScreenshot,
} = require("../scripts/first-run/screenshot-helper.cjs");

test("stable screenshot navigation waits for reduced motion, final UI, fonts, and settled bounds", async () => {
  const calls = [];
  const bounds = [
    { x: 0, y: 0, width: 100, height: 40 },
    { x: 0, y: 0, width: 120, height: 40 },
    { x: 0, y: 0, width: 120, height: 40 },
  ];
  let boundsIndex = 0;

  const target = {
    async waitFor(options) {
      calls.push(["visible", options]);
    },
    async evaluate(callback, options) {
      const originalAnimationFrame = globalThis.requestAnimationFrame;
      globalThis.requestAnimationFrame = (next) => {
        queueMicrotask(() => next(performance.now()));
        return boundsIndex;
      };
      const element = {
        getBoundingClientRect() {
          calls.push(["bounds", boundsIndex]);
          const value = bounds[Math.min(boundsIndex, bounds.length - 1)];
          boundsIndex += 1;
          return value;
        },
      };
      try {
        return await callback(element, options);
      } finally {
        globalThis.requestAnimationFrame = originalAnimationFrame;
      }
    },
  };

  const page = {
    async emulateMedia(options) {
      calls.push(["media", options]);
    },
    async goto(url, options) {
      calls.push(["goto", url, options]);
    },
    async waitForURL(url, options) {
      calls.push(["url", String(url), options]);
    },
    locator(selector) {
      calls.push(["locator", selector]);
      return target;
    },
    async evaluate(callback) {
      const originalDocument = globalThis.document;
      globalThis.document = {
        fonts: {
          ready: Promise.resolve().then(() => calls.push(["fonts-ready"])),
        },
      };
      calls.push(["fonts-wait"]);
      try {
        return await callback();
      } finally {
        globalThis.document = originalDocument;
      }
    },
    async screenshot(options) {
      calls.push(["screenshot", options]);
      return Buffer.from("proof");
    },
  };

  const result = await navigateAndCaptureStableScreenshot(page, {
    url: "http://localhost:3000/start",
    finalUrl: /\/ready$/,
    target: "#ready",
    timeout: 5_000,
    stableFrames: 2,
    screenshot: { path: "tmp/proof.png", fullPage: true },
  });

  assert.deepEqual(result, Buffer.from("proof"));
  assert.deepEqual(calls[0], ["media", { reducedMotion: "reduce" }]);
  assert.deepEqual(calls[1], [
    "goto",
    "http://localhost:3000/start",
    { waitUntil: "domcontentloaded", timeout: 5_000 },
  ]);
  assert.deepEqual(calls[2], ["url", "/\\/ready$/", { timeout: 5_000 }]);
  assert.deepEqual(calls[3], ["locator", "#ready"]);
  assert.deepEqual(calls[4], ["visible", { state: "visible", timeout: 5_000 }]);

  const fontReadyIndex = calls.findIndex(([name]) => name === "fonts-ready");
  const firstBoundsIndex = calls.findIndex(([name]) => name === "bounds");
  const screenshotIndex = calls.findIndex(([name]) => name === "screenshot");
  assert.ok(fontReadyIndex > 0, "document.fonts.ready must be awaited");
  assert.ok(firstBoundsIndex > fontReadyIndex, "bounds must settle after fonts load");
  assert.equal(
    calls.filter(([name]) => name === "bounds").length,
    3,
    "a changed target must remain stable across two later animation frames",
  );
  assert.ok(screenshotIndex > firstBoundsIndex, "capture must happen after stable bounds");
});
