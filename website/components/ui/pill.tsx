import type { ReactNode } from "react";

/** Small rounded badge — hero eyebrows, counts, statuses. */
export function Pill({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-tertiary ${className}`}
    >
      {children}
    </span>
  );
}

/** Compact stat: big display numeral over a muted label. */
export function StatTile({
  value,
  label,
  className = "",
}: {
  value: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="font-display text-3xl font-bold tracking-tight text-on-background">{value}</p>
      <p className="mt-1 text-sm font-medium text-on-surface-variant">{label}</p>
    </div>
  );
}
