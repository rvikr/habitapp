import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const sitemapSource = readFileSync(new URL("../app/sitemap.ts", import.meta.url), "utf8");
const aboutPageUrl = new URL("../app/about/page.tsx", import.meta.url);

test("homepage reinforces exact Lagan brand search phrases", () => {
  for (const text of [
    "Lagan Health",
    "Lagan AI Habit Tracker",
    "lagan.health",
    "Build better habits with Lagan Health",
  ]) {
    assert.match(pageSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("homepage includes the required feature and how-it-works sections", () => {
  for (const text of [
    "AI habit suggestions",
    "Daily habit tracking",
    "Progress insights",
    "Simple reminders",
    "Motivation to stay consistent",
    "Open Lagan Health",
    "Add your habits",
    "Track progress and improve with AI",
  ]) {
    assert.match(pageSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("homepage sends visitors to the web app while Play Store listing is unavailable", () => {
  assert.doesNotMatch(pageSource, /https:\/\/play\.google\.com\/store\/apps\/details\?id=health\.lagan\.app/);
  assert.doesNotMatch(pageSource, /Get it on Google Play/);
  assert.doesNotMatch(pageSource, /Download on Google Play/);
  assert.match(pageSource, /Open Lagan web app/);
  assert.match(pageSource, /Continue on website/);
  assert.match(pageSource, /const WEB_APP_URL = "\/app";/);
  assert.match(pageSource, /href=\{WEB_APP_URL\}/);
});

test("homepage and layout expose richer software and organization search metadata", () => {
  for (const text of [
    "Lagan Health - Lagan AI Habit Tracker",
    "Lagan Health is the home of Lagan AI Habit Tracker",
    "Lagan Health",
    "Lagan AI Habit Tracker",
    "https://lagan.health",
  ]) {
    assert.match(pageSource + layoutSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(pageSource, /"@type": \["MobileApplication", "SoftwareApplication"\]/);
  assert.match(pageSource, /applicationSubCategory: "Habit tracker"/);
  assert.match(pageSource, /sameAs: \[\]/);
  assert.match(layoutSource, /sameAs: \[\]/);
});

test("about page is public and included in the sitemap", () => {
  assert.equal(existsSync(aboutPageUrl), true);

  const aboutSource = readFileSync(aboutPageUrl, "utf8");
  for (const text of [
    "About Lagan Health",
    "Lagan AI Habit Tracker",
    "lagan.health",
    "AI habit coach",
    "daily routines",
  ]) {
    assert.match(aboutSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(sitemapSource, /`\$\{SITE_URL\}\/about`/);
});

test("homepage does not depend on dynamic Supabase stats", () => {
  assert.doesNotMatch(pageSource, /@supabase\/supabase-js/);
  assert.doesNotMatch(pageSource, /createClient/);
  assert.doesNotMatch(pageSource, /get_public_stats/);
  assert.doesNotMatch(pageSource, /force-dynamic/);
});
