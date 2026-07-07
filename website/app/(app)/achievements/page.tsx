import type { Metadata } from "next";
import { getStats } from "@/lib/habits";
import { computeBadges } from "@/lib/badges";
import ShareButton from "@/components/share-button";
import { getBadgeShareMessage } from "@/lib/share-messages";
import { addDateKeyDays, dateKeyInTimeZone } from "@/lib/date";
import { getRequestTimeZone } from "@/lib/request-timezone";
import { XP_PER_LEVEL, levelForXp, xpForCompletions, xpInLevel } from "@/lib/xp";
import type { Badge } from "@/types/db";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Achievements",
  robots: { index: false, follow: false },
  openGraph: {
    images: [`${SITE_URL}/api/og/card?type=badge&id=diamond&tone=purple`],
  },
};
export const dynamic = "force-dynamic";

const TONE_MAP: Record<Badge["tone"], { bg: string; ic: string; tag: string }> = {
  yellow: { bg: "bg-tertiary-fixed",      ic: "text-on-tertiary-container", tag: "bg-tertiary-fixed text-on-tertiary-container" },
  orange: { bg: "bg-primary-fixed",       ic: "text-primary",               tag: "bg-primary-fixed text-primary" },
  purple: { bg: "bg-habit-read/15",       ic: "text-habit-read",            tag: "bg-habit-read/15 text-habit-read" },
  teal:   { bg: "bg-secondary-container", ic: "text-secondary",             tag: "bg-secondary-container text-on-secondary-container" },
  indigo: { bg: "bg-habit-meditate/15",   ic: "text-habit-meditate",        tag: "bg-habit-meditate/15 text-habit-meditate" },
  red:    { bg: "bg-error-container",     ic: "text-error",                 tag: "bg-error-container text-on-error-container" },
};

function BadgeCard({ badge }: { badge: Badge }) {
  const tone = TONE_MAP[badge.tone];
  const { tagline } = getBadgeShareMessage(badge.id, badge.name);
  const cardUrl = `/api/og/card?type=badge&id=${badge.id}&name=${encodeURIComponent(badge.name)}&tone=${badge.tone}`;
  const shareText = `${tagline}\n\nEarned the "${badge.name}" badge on Lagan.`;

  return (
    <div
      className={`bg-surface rounded-3xl p-5 border border-outline-variant flex flex-col items-center gap-3 text-center transition-all duration-200 ${
        badge.earned ? "hover:-translate-y-1 hover:shadow-card-hover" : "opacity-45 grayscale-[0.5]"
      }`}
    >
      <div className={`w-16 h-16 rounded-2xl ${tone.bg} flex items-center justify-center relative`}>
        <span
          className={`material-symbols-outlined ${tone.ic} text-3xl`}
          style={badge.earned ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {badge.icon}
        </span>
        {!badge.earned && (
          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-outline-variant flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>lock</span>
          </div>
        )}
      </div>
      <div>
        <p className="font-bold text-on-background text-sm">{badge.name}</p>
        <p className="text-xs text-on-surface-variant mt-0.5 leading-snug">{badge.description}</p>
      </div>
      {badge.earned && (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tone.tag}`}>
            Earned
          </span>
          <ShareButton
            shareText={shareText}
            shareUrl={`${SITE_URL}/achievements`}
            cardUrl={cardUrl}
            label="Share"
          />
        </div>
      )}
    </div>
  );
}

export default async function AchievementsPage() {
  const stats = await getStats();
  const badges = stats ? computeBadges(stats) : [];

  const earned = badges.filter((b) => b.earned);
  const locked = badges.filter((b) => !b.earned);

  const totalXP = xpForCompletions(stats?.totalCompletions ?? 0);
  const level = levelForXp(totalXP);
  const levelXP = xpInLevel(totalXP);
  const levelPct = Math.round((levelXP / XP_PER_LEVEL) * 100);

  // Build last-30-days activity
  const timeZone = await getRequestTimeZone();
  const todayStr = dateKeyInTimeZone(new Date(), timeZone);
  const thirtyDays = Array.from({ length: 30 }, (_, i) => {
    return addDateKeyDays(todayStr, -29 + i);
  });
  const activeDatesSet = new Set(stats?.activeDates ?? []);

  return (
    <div className="app-stagger max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-on-background">
          Your Achievements
        </h1>
        <p className="text-on-surface-variant text-base mt-1">
          Keep building habits to unlock more badges and level up.
        </p>
      </div>

      {/* Level hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-container p-5 text-white shadow-[0_8px_40px_rgba(242,107,31,0.35)] sm:p-8">
        <div className="absolute -right-8 -top-8 opacity-15 pointer-events-none">
          <span className="material-symbols-outlined text-[200px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
        </div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-surface/20 backdrop-blur-sm flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
              </div>
              <div>
                <p className="text-white/70 text-sm font-bold uppercase tracking-wider">Current Level</p>
                <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                  Level {level}
                </h2>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/70 font-medium">XP Progress</span>
                <span className="text-white font-bold">{levelXP.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()} XP</span>
              </div>
              <div className="h-3 w-full max-w-72 overflow-hidden rounded-full bg-surface/20">
                <div
                  className="h-full bg-surface rounded-full transition-all duration-700"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
              <p className="text-white/60 text-xs">{(XP_PER_LEVEL - levelXP).toLocaleString()} XP to Level {level + 1}</p>
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:w-auto lg:gap-5">
            {[
              { icon: "local_fire_department", val: stats?.streak ?? 0,              lbl: "Day Streak",    color: "text-on-tertiary-fixed"   },
              { icon: "military_tech",          val: earned.length,                   lbl: "Badges Earned", color: "text-secondary-fixed"      },
              { icon: "check_circle",           val: stats?.totalCompletions ?? 0,    lbl: "Habits Done",   color: "text-secondary-fixed"      },
            ].map(({ icon, val, lbl, color }) => (
              <div key={lbl} className="rounded-2xl border border-white/15 bg-surface/15 px-4 py-4 text-center backdrop-blur-sm sm:px-6 sm:py-5">
                <span className={`material-symbols-outlined ${color} text-3xl`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                <p className="mt-2 font-display text-3xl font-bold tracking-tight text-white">{val}</p>
                <p className="text-white/65 text-sm mt-0.5">{lbl}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Earned badges */}
      {earned.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-on-background text-xl">Unlocked Badges</h2>
            <span className="bg-secondary-container/40 text-on-secondary-container text-xs font-bold px-2.5 py-1 rounded-full">
              {earned.length} earned
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {earned.map((b) => <BadgeCard key={b.id} badge={b} />)}
          </div>
        </div>
      )}

      {/* Locked badges */}
      {locked.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-on-background text-xl">Locked Badges</h2>
            <span className="bg-surface-container text-on-surface-variant text-xs font-bold px-2.5 py-1 rounded-full">
              {locked.length} remaining
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {locked.map((b) => <BadgeCard key={b.id} badge={b} />)}
          </div>
        </div>
      )}

      {/* Streak history */}
      <div className="hover-raise bg-surface rounded-3xl p-6 border border-outline-variant space-y-4">
        <h2 className="font-bold text-on-background text-xl">Last 30 Days</h2>
        <div className="flex gap-1.5 flex-wrap">
          {thirtyDays.map((date) => {
            const isToday = date === todayStr;
            const active = activeDatesSet.has(date);
            return (
              <div
                key={date}
                title={date}
                className={`w-8 h-8 rounded-lg ${
                  isToday
                    ? "bg-primary/20 border-2 border-primary border-dashed"
                    : active
                    ? "bg-secondary"
                    : "bg-surface-container"
                }`}
              />
            );
          })}
        </div>
        <div className="flex items-center gap-6 pt-1">
          {[
            { color: "bg-secondary",    label: "Completed" },
            { color: "bg-surface-container", label: "No activity" },
            { color: "bg-primary/20 border-2 border-primary border-dashed", label: "Today" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${color}`} />
              <span className="text-xs text-on-surface-variant font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
