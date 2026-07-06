import type { ReactNode } from "react";

type Surface = "surface" | "lowest" | "low" | "container" | "high";

const SURFACES: Record<Surface, string> = {
  surface: "bg-surface",
  lowest: "bg-surface-container-lowest",
  low: "bg-surface-container-low",
  container: "bg-surface-container",
  high: "bg-surface-container-high",
};

/** Bordered midnight surface — the base card for every redesigned page. */
export function Card({
  surface = "surface",
  hover = false,
  className = "",
  children,
}: {
  surface?: Surface;
  hover?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-3xl border border-outline-variant",
        SURFACES[surface],
        hover ? "lift-card" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
