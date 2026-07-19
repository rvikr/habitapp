import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const faqsSource = readFileSync(new URL("../lib/faqs.ts", import.meta.url), "utf8");
const faqPageSource = readFileSync(new URL("../app/faq/page.tsx", import.meta.url), "utf8");

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
