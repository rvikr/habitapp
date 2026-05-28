"use client";

import { useEffect } from "react";

export default function ScrollAnimations() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(
      document.querySelectorAll<HTMLElement>(".landing-section, .landing-footer")
    );
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px 0px 0px" }
    );

    // Skip first section (hero) — always visible
    // For the rest: only animate if they start off-screen
    els.forEach((el, i) => {
      if (i === 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight) {
        // Already in view on load — show immediately, no animation
        return;
      }
      el.classList.add("landing-fade-in");
      io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  return null;
}
