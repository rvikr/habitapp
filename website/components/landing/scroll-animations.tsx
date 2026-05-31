"use client";

import { useEffect } from "react";

export default function ScrollAnimations() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );

    // Treat anything within ~90% of the viewport height as already on screen so
    // above-the-fold content never starts hidden (it just never gets armed).
    const inView = (el: Element) =>
      el.getBoundingClientRect().top < window.innerHeight * 0.9;

    // 1. Whole-section fade-up — skip the hero (animates on load via CSS) and any
    //    section that owns staggered content (those reveal heading + cards individually).
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>(".landing-section, .landing-footer")
    );
    sections.forEach((el, i) => {
      if (i === 0) return;
      if (el.querySelector(".stagger")) return;
      if (inView(el)) return;
      el.classList.add("landing-fade-in");
      io.observe(el);
    });

    // 2. Individual elements (section headings) fade up on scroll.
    document.querySelectorAll<HTMLElement>(".reveal-up").forEach((el) => {
      if (inView(el)) return;
      el.classList.add("reveal-armed");
      io.observe(el);
    });

    // 3. Stagger groups — direct children cascade in one-by-one.
    document.querySelectorAll<HTMLElement>(".stagger").forEach((el) => {
      if (inView(el)) return;
      el.classList.add("stagger-armed");
      io.observe(el);
    });

    return () => io.disconnect();
  }, []);

  return null;
}
