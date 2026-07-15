import { PLAY_STORE_URL } from "@/lib/site";

/**
 * Explains that the web app is a view-only companion: habits are added and logged
 * in the Lagan app, while the web shows progress, achievements, and the leaderboard.
 */
export default function AppOnlyBanner() {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-primary/20 bg-primary/8 p-5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <span
            className="material-symbols-outlined text-primary text-xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            smartphone
          </span>
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-on-background">Adding & logging habits lives in the app</p>
          <p className="mt-0.5 text-xs leading-relaxed text-on-surface-variant">
            On the web you can follow your progress, achievements, and leaderboard. To create habits
            and check them off, use the Lagan Android app.
          </p>
        </div>
      </div>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex flex-shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
      >
        <span className="material-symbols-outlined text-[18px]">android</span>
        Get the app
      </a>
    </div>
  );
}
