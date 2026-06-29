import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("homepage is a focused Google Play landing page", () => {
  assert.match(pageSource, /Build better habits with AI/);
  assert.match(pageSource, /Track habits, stay consistent, and get AI-powered guidance with Lagan\. Download on Google Play\./);
  assert.match(pageSource, /Get it on Google Play/);
  assert.match(pageSource, /https:\/\/play\.google\.com\/store\/apps\/details\?id=health\.lagan\.app/);
});

test("homepage includes the required feature and how-it-works sections", () => {
  for (const text of [
    "AI habit suggestions",
    "Daily habit tracking",
    "Progress insights",
    "Simple reminders",
    "Motivation to stay consistent",
    "Download Lagan",
    "Add your habits",
    "Track progress and improve with AI",
  ]) {
    assert.match(pageSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("homepage does not depend on dynamic Supabase stats", () => {
  assert.doesNotMatch(pageSource, /@supabase\/supabase-js/);
  assert.doesNotMatch(pageSource, /createClient/);
  assert.doesNotMatch(pageSource, /get_public_stats/);
  assert.doesNotMatch(pageSource, /force-dynamic/);
});
