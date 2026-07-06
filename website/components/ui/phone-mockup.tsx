/**
 * Midnight product mockup for the landing hero — mirrors the app's redesigned
 * timeline (rail + accent icon nodes + check chips) and AI coach card.
 * Pure divs/SVG, no icon font, server-renderable.
 */

function IconSun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </svg>
  );
}

function IconBook({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}

function IconDrop({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 2.7s6.5 7.1 6.5 12A6.5 6.5 0 0 1 12 21.2a6.5 6.5 0 0 1-6.5-6.5c0-4.9 6.5-12 6.5-12z" />
    </svg>
  );
}

function IconLeaf({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M11 20A7 7 0 0 1 4 13c0-5 4.5-9 10-10 1.5 5.5-1 12-5.5 15" />
      <path d="M4 21c4-2 7-5 9-9" />
    </svg>
  );
}

function CheckChip() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary/15 text-secondary">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}

type Row = {
  name: string;
  meta: string;
  icon: React.ReactNode;
  accent: string; // text-* class driving node border + icon color
  done: boolean;
};

const ROWS: Row[] = [
  { name: "Morning walk", meta: "07:00 · 20 min", icon: <IconSun className="h-4 w-4" />, accent: "text-habit-walk", done: true },
  { name: "Read 10 pages", meta: "08:30 · Deep focus", icon: <IconBook className="h-4 w-4" />, accent: "text-habit-read", done: true },
  { name: "Drink water", meta: "All day · 6 of 8 glasses", icon: <IconDrop className="h-4 w-4" />, accent: "text-habit-water", done: true },
  { name: "Meditate", meta: "21:00 · 10 min", icon: <IconLeaf className="h-4 w-4" />, accent: "text-habit-meditate", done: false },
];

function ProgressRing() {
  const r = 15.9155; // circumference ≈ 100, so dasharray maps to percent
  return (
    <div className="relative h-14 w-14">
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#2C2C36" strokeWidth="3.4" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="#F26B1F"
          strokeWidth="3.4"
          strokeLinecap="round"
          strokeDasharray="75 100"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-xs font-bold text-on-background">
        3/4
      </span>
    </div>
  );
}

export default function PhoneMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Ambient glow behind the phone */}
      <div className="bg-ember-glow glow-pulse pointer-events-none absolute -inset-14 rounded-full" />

      <div className="float-slow relative mx-auto w-[300px] rounded-[34px] border border-outline-variant bg-surface-container-lowest p-2 shadow-card sm:w-[320px]">
        <div className="overflow-hidden rounded-[26px] bg-background">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[10px] font-semibold text-on-surface-variant">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/60" />
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant/60" />
              <span className="h-1.5 w-1.5 rounded-full bg-on-surface-variant" />
            </span>
          </div>

          {/* Header: Today + progress ring */}
          <div className="flex items-center justify-between px-5 pb-4 pt-2">
            <div>
              <p className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">
                Today&apos;s timeline
              </p>
              <p className="font-display mt-1 text-xl font-bold tracking-tight text-on-background">
                Today
              </p>
            </div>
            <ProgressRing />
          </div>

          {/* Timeline rows */}
          <div className="space-y-0 px-4 pb-2">
            {ROWS.map((row, i) => (
              <div key={row.name} className="flex gap-3">
                {/* Rail + node */}
                <div className="flex w-10 flex-col items-center">
                  {i > 0 && <span className="h-2 w-0.5 bg-outline-variant" />}
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 bg-surface ${row.accent} ${
                      row.done ? "border-current" : `border-current pulse-ring`
                    }`}
                  >
                    {row.icon}
                  </span>
                  {i < ROWS.length - 1 && <span className="w-0.5 flex-1 bg-outline-variant" />}
                </div>
                {/* Row card */}
                <div className="mb-2 mt-1 flex flex-1 items-center justify-between rounded-2xl border border-outline-variant bg-surface px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className={`truncate text-[13px] font-bold ${row.done ? "text-on-background" : "text-on-surface-variant"}`}>
                      {row.name}
                    </p>
                    <p className="truncate text-[11px] font-medium text-on-surface-variant/70">{row.meta}</p>
                  </div>
                  {row.done ? (
                    <CheckChip />
                  ) : (
                    <span className="h-6 w-6 rounded-full border-2 border-outline-variant" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* AI coach card */}
          <div className="px-4 pb-5">
            <div className="flex gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-3.5">
              <span className="w-1 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0">
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-tertiary">
                  AI Coach
                </p>
                <p className="mt-1 text-[12px] font-medium leading-snug text-on-surface-variant">
                  You&apos;re 3 for 3 this morning — a short meditation tonight keeps the streak alive.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
