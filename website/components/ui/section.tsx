import type { ReactNode } from "react";

/** Shared page-width rhythm for marketing sections. */
export function Section({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 ${className}`}>
      {children}
    </section>
  );
}

/** Uppercase tracked overline — ember by default, tint via `className`. */
export function Eyebrow({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <p
      className={`font-display text-xs font-bold uppercase tracking-[0.18em] text-primary ${className}`}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h2
      className={`font-display text-3xl font-bold tracking-tight text-on-background sm:text-4xl ${className}`}
    >
      {children}
    </h2>
  );
}
