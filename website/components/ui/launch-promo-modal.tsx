"use client";

import { useCallback, useEffect, useState } from "react";
import { PLAY_STORE_URL } from "@/lib/site";

/**
 * Launch-campaign promo. A dismissible modal that advertises 50% off the yearly
 * Lagan Pro plan. Purchases happen in the Android app, so the CTA sends people to
 * the Google Play listing. Dismissal is remembered in localStorage so returning
 * visitors are not nagged on every load.
 */

const STORAGE_KEY = "lagan_launch_promo_dismissed_v1";
const OPEN_DELAY_MS = 900;

// Launch pricing — 50% off the ₹499/yr annual plan. Update alongside the store offer.
const ORIGINAL_PRICE = "₹499";
const PROMO_PRICE = "₹249";

const PRO_BENEFITS = [
  "Personalized AI habit coach",
  "AI-optimized smart reminders",
  "AI routine refinement during onboarding",
  "5 custom coach tones",
  "Weekly AI progress reports",
];

function GooglePlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 3.5v17l9-8.5-9-8.5Z" fill="#34A853" />
      <path d="m13.5 12 2.8-2.65L6.1 3.75 13.5 12Z" fill="#4285F4" />
      <path d="m13.5 12-7.4 8.25 10.2-5.6L13.5 12Z" fill="#FBBC04" />
      <path d="m16.3 9.35 2.75 1.5c.9.5.9 1.8 0 2.3l-2.75 1.5L13.5 12l2.8-2.65Z" fill="#EA4335" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="mt-0.5 shrink-0 text-secondary"
      aria-hidden="true"
    >
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LaunchPromoModal() {
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage can be unavailable (private mode); dismissing this session is enough.
    }
  }, []);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;

    const timer = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-promo-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close launch offer"
        onClick={dismiss}
        className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
      />

      {/* Card */}
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-outline-variant bg-surface shadow-card">
        <div
          className="bg-ember-glow pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full"
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-on-surface-variant transition-colors hover:text-on-background"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="relative px-6 py-8 sm:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            Launch offer
          </span>

          <h2
            id="launch-promo-title"
            className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-on-background"
          >
            50% off Lagan Pro
          </h2>
          <p className="mt-2 text-sm leading-6 text-on-surface-variant">
            For our launch, get the yearly plan at half price. Unlock every AI feature and keep
            your streak coached all year.
          </p>

          {/* Price */}
          <div className="mt-5 flex items-end gap-3">
            <span className="font-display text-4xl font-bold tracking-tight text-on-background">
              {PROMO_PRICE}
            </span>
            <span className="pb-1 text-sm font-medium text-on-surface-variant">/ year</span>
            <span className="pb-1 text-base font-semibold text-outline line-through">
              {ORIGINAL_PRICE}
            </span>
            <span className="mb-1 ml-auto rounded-full bg-secondary-container/50 px-2.5 py-1 text-xs font-bold text-on-secondary-container">
              Save 50%
            </span>
          </div>

          {/* Benefits */}
          <ul className="mt-6 space-y-2.5">
            {PRO_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-on-surface">
                <CheckIcon />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <a
            href={PLAY_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="btn-press mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 py-3 text-base font-bold text-white shadow-cta transition hover:bg-[#D95C18] focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"
          >
            <GooglePlayIcon />
            Subscribe on Google Play
          </a>

          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full text-center text-sm font-semibold text-on-surface-variant transition-colors hover:text-on-background"
          >
            Maybe later
          </button>

          <p className="mt-4 text-center text-xs leading-5 text-outline">
            Billed yearly through Google Play. Auto-renews at the regular price; cancel anytime.
            Launch pricing for a limited time.
          </p>
        </div>
      </div>
    </div>
  );
}
