import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const siteSource = readFileSync(new URL("../lib/site.ts", import.meta.url), "utf8");
const faqsSource = readFileSync(new URL("../lib/faqs.ts", import.meta.url), "utf8");
const faqPageSource = readFileSync(new URL("../app/faq/page.tsx", import.meta.url), "utf8");
const shareCardSource = readFileSync(
  new URL("../app/api/og/card/route.tsx", import.meta.url),
  "utf8",
);

test("homepage is a Lagan-branded landing page with web, iOS, and Android CTAs", () => {
  assert.match(pageSource, /Lagan — build better habits/);
  assert.match(pageSource, /Lagan is an AI habit tracker/);
  assert.match(pageSource, /Use the web app/);
  // The Android app is live on Google Play — CTAs link to the listing via the
  // shared PLAY_STORE_URL constant (never a hardcoded play.google.com literal).
  assert.match(pageSource, /Use Android/);
  assert.match(pageSource, /href=\{PLAY_STORE_URL\}/);
  assert.doesNotMatch(pageSource, /play\.google\.com/);
  // The iOS app is live on the App Store and uses the shared URL constant.
  assert.match(pageSource, /Use iOS/);
  assert.match(pageSource, /href=\{APP_STORE_URL\}/);
  assert.doesNotMatch(pageSource, /apps\.apple\.com/);
  assert.match(
    siteSource,
    /APP_STORE_URL = "https:\/\/apps\.apple\.com\/app\/lagan-ai-habit-tracker\/id6808705929"/,
  );
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

test("homepage renders an FAQ section from the shared list and links to /faq", () => {
  assert.match(pageSource, /LANDING_FAQS/);
  assert.match(pageSource, /from "@\/lib\/faqs"/);
  assert.match(pageSource, /id="faq"/);
  assert.match(pageSource, /href="\/faq"/);
  // FAQPage JSON-LD lives only on /faq — one FAQPage per site.
  assert.doesNotMatch(pageSource, /"FAQPage"/);
});

test("the FAQ content module answers the pinned questions", () => {
  assert.match(faqsSource, /What is Lagan\?/);
  assert.match(faqsSource, /Is Lagan on Google Play\?/);
  assert.match(faqsSource, /What happens when I miss a day\?/);
});

test("/faq renders every FAQ with FAQPage JSON-LD", () => {
  assert.match(faqPageSource, /faqPageJsonLd\(ALL_FAQS\)/);
  assert.match(faqPageSource, /ALL_FAQS\.map/);
  assert.match(faqPageSource, /canonical: "\/faq"/);
});

test("homepage links to the iOS app and offers a web app path", () => {
  assert.doesNotMatch(pageSource, /iOS — coming soon/);
  assert.match(pageSource, /href=\{APP_STORE_URL\}/);
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

test("share image route supports branded portrait achievement cards", () => {
  assert.match(shareCardSource, /portrait \? 1080 : 1200/);
  assert.match(shareCardSource, /portrait \? 1350 : 630/);
  assert.match(shareCardSource, /function ChainMark/);
  assert.match(shareCardSource, /Can you beat me\?/);
  assert.match(shareCardSource, /lagan\.health/);
});
