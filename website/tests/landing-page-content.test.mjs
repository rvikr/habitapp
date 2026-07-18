import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("homepage is a Lagan-branded landing page with web and Android CTAs", () => {
  assert.match(pageSource, /Lagan — build better habits/);
  assert.match(pageSource, /Lagan is an AI habit tracker/);
  assert.match(pageSource, /Use the web app/);
  // The Android app is live on Google Play — CTAs link to the listing via the
  // shared PLAY_STORE_URL constant (never a hardcoded play.google.com literal).
  assert.match(pageSource, /Use Android/);
  assert.match(pageSource, /href=\{PLAY_STORE_URL\}/);
  assert.doesNotMatch(pageSource, /play\.google\.com/);
});

test("homepage surfaces the launch promo modal", () => {
  assert.match(pageSource, /<LaunchPromoModal\s*\/>/);
});

test("homepage includes the required feature and how-it-works sections", () => {
  for (const text of [
    "AI habit suggestions",
    "Daily habit tracking",
    "Progress insights",
    "Simple reminders",
    "Motivation to stay consistent",
    "Open Lagan",
    "Add your habits",
    "Track progress and improve with AI",
  ]) {
    assert.match(pageSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("homepage renders an FAQ section backed by FAQPage JSON-LD", () => {
  assert.match(pageSource, /"FAQPage"/);
  assert.match(pageSource, /What is Lagan\?/);
  assert.match(pageSource, /Is Lagan on Google Play\?/);
  assert.match(pageSource, /id="faq"/);
});

test("homepage marks iOS coming soon and offers a web app path", () => {
  assert.match(pageSource, /iOS — coming soon/);
  assert.match(pageSource, /from "@\/lib\/site"/);
  assert.match(pageSource, /href=\{WEB_APP_URL\}/);
});

test("homepage exposes the app without advertising website sign-in", () => {
  assert.match(pageSource, /Open the app/);
  assert.doesNotMatch(pageSource, /href="\/login"/);
});

test("homepage does not depend on dynamic Supabase stats", () => {
  assert.doesNotMatch(pageSource, /@supabase\/supabase-js/);
  assert.doesNotMatch(pageSource, /createClient/);
  assert.doesNotMatch(pageSource, /get_public_stats/);
  assert.doesNotMatch(pageSource, /force-dynamic/);
});
