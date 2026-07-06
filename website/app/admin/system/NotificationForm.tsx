"use client";

import { useState, useTransition } from "react";
import { sendGlobalNotification } from "./actions";

const TYPES = [
  { value: "info",    label: "Info",    color: "bg-habit-water"  },
  { value: "warning", label: "Warning", color: "bg-tertiary" },
  { value: "success", label: "Success", color: "bg-secondary" },
];

export function NotificationForm() {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody]   = useState("");
  const [type, setType]   = useState("info");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    startTransition(async () => {
      const res = await sendGlobalNotification(title.trim(), body.trim(), type);
      setResult({ ok: res.ok, msg: res.ok ? "Notification sent to all active users!" : (res.error ?? "Failed") });
      if (res.ok) { setTitle(""); setBody(""); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-on-surface uppercase tracking-wide">Type</label>
        <div className="flex gap-2">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold border transition-all ${
                type === t.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-outline-variant text-on-surface-variant hover:border-outline"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${t.color}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-on-surface uppercase tracking-wide">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. New feature available!"
          maxLength={80}
          className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-on-surface uppercase tracking-wide">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write the notification body…"
          rows={3}
          maxLength={300}
          className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all resize-none"
        />
        <p className="text-xs text-on-surface-variant text-right">{body.length}/300</p>
      </div>

      {result && (
        <p className={`text-xs font-medium px-3 py-2 rounded-xl ${result.ok ? "bg-secondary-container/40 text-on-secondary-container" : "bg-error-container/40 text-error"}`}>
          {result.msg}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !title.trim() || !body.trim()}
        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
          send
        </span>
        {isPending ? "Sending…" : "Send to All Users"}
      </button>
    </form>
  );
}
