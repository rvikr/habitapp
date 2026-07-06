"use client";

import { useState, useTransition } from "react";
import { updateFeedbackStatus, type FeedbackStatus } from "./actions";

export interface FeedbackReport {
  id: string;
  email: string | null;
  category: "bug" | "idea" | "usability" | "other";
  rating: number;
  message: string;
  app_version: string | null;
  build_number: string | null;
  platform: string | null;
  os_version: string | null;
  device_name: string | null;
  status: FeedbackStatus;
  created_at: string;
}

const CATEGORY_META: Record<FeedbackReport["category"], { icon: string; label: string; color: string; bg: string }> = {
  bug:       { icon: "bug_report",  label: "Bug",       color: "text-error",     bg: "bg-error-container/40"     },
  idea:      { icon: "lightbulb",   label: "Idea",      color: "text-tertiary",   bg: "bg-tertiary-fixed/60"   },
  usability: { icon: "touch_app",   label: "Usability", color: "text-habit-water",    bg: "bg-habit-water/10"    },
  other:     { icon: "chat_bubble", label: "Other",     color: "text-on-surface-variant",   bg: "bg-surface-container-high"  },
};

const STATUS_META: Record<FeedbackStatus, { label: string; color: string }> = {
  new:      { label: "New",      color: "bg-primary/15 text-primary"   },
  reviewed: { label: "Reviewed", color: "bg-habit-water/15 text-habit-water"    },
  planned:  { label: "Planned",  color: "bg-tertiary-fixed/60 text-on-tertiary-container"  },
  resolved: { label: "Resolved", color: "bg-secondary-container/60 text-secondary"  },
  closed:   { label: "Closed",   color: "bg-surface-container-high text-on-surface-variant"  },
};

const STATUS_OPTIONS: FeedbackStatus[] = ["new", "reviewed", "planned", "resolved", "closed"];

export default function FeedbackRow({ report }: { report: FeedbackReport }) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<FeedbackStatus>(report.status);
  const [err, setErr] = useState("");

  const cat = CATEGORY_META[report.category];
  const created = new Date(report.created_at);

  const meta = [
    report.platform,
    report.os_version,
    report.app_version && `v${report.app_version}`,
    report.build_number && `build ${report.build_number}`,
    report.device_name,
  ].filter(Boolean) as string[];

  function handleStatusChange(next: FeedbackStatus) {
    const prev = status;
    setStatus(next);
    setErr("");
    startTransition(async () => {
      const res = await updateFeedbackStatus(report.id, next);
      if (!res.ok) {
        setStatus(prev);
        setErr(res.error ?? "Failed to update");
      }
    });
  }

  return (
    <div className="px-5 py-4 hover:bg-surface-container-high/60 transition-colors">
      <div className="flex items-start gap-4">
        {/* Category icon */}
        <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${cat.bg}`}>
          <span className={`material-symbols-outlined text-[20px] ${cat.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
            {cat.icon}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-2">
          {/* Top line: category + rating + date */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className={`text-xs font-bold ${cat.color}`}>{cat.label}</span>
            <span className="flex items-center gap-0.5" title={`${report.rating} of 5`}>
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`material-symbols-outlined text-[14px] ${i < report.rating ? "text-tertiary" : "text-on-surface"}`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  star
                </span>
              ))}
            </span>
            <span className="ml-auto text-xs text-on-surface-variant">
              {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {" · "}
              {created.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>

          {/* Message */}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-on-surface">{report.message}</p>

          {/* Reporter + device metadata */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
            {report.email ? (
              <a href={`mailto:${report.email}`} className="flex items-center gap-1 font-medium text-on-surface-variant hover:text-primary">
                <span className="material-symbols-outlined text-[14px]">mail</span>
                {report.email}
              </a>
            ) : (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">person_off</span>
                Anonymous
              </span>
            )}
            {meta.length > 0 && <span className="text-on-surface-variant">·</span>}
            {meta.map((m, i) => (
              <span key={i} className="font-mono">{m}</span>
            ))}
          </div>

          {err && <p className="text-xs font-medium text-error">{err}</p>}
        </div>

        {/* Status control */}
        <div className="flex-shrink-0">
          <label className="sr-only" htmlFor={`status-${report.id}`}>Status</label>
          <div className="relative">
            <select
              id={`status-${report.id}`}
              value={status}
              disabled={isPending}
              onChange={(e) => handleStatusChange(e.target.value as FeedbackStatus)}
              className={`cursor-pointer appearance-none rounded-full border-0 py-1 pl-3 pr-7 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60 ${STATUS_META[status].color}`}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} className="bg-surface text-on-surface">
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[16px] text-current opacity-60">
              {isPending ? "hourglass_empty" : "expand_more"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
