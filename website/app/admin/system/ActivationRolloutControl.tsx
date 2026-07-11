"use client";

import { useState, useTransition } from "react";
import { updateFeatureFlagRollout } from "./actions";

export function ActivationRolloutControl({
  enabled,
  rolloutPercentage,
}: {
  enabled: boolean;
  rolloutPercentage: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [percentage, setPercentage] = useState(rolloutPercentage);
  const [saved, setSaved] = useState({ enabled, rolloutPercentage });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = isEnabled !== saved.enabled || percentage !== saved.rolloutPercentage;

  function setValidPercentage(value: number) {
    if (!Number.isFinite(value)) return;
    setPercentage(Math.max(0, Math.min(100, Math.trunc(value))));
    setMessage(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateFeatureFlagRollout("activation_v2", isEnabled, percentage);
      if (result.ok) {
        setSaved({ enabled: isEnabled, rolloutPercentage: percentage });
        setMessage({ ok: true, text: "Activation rollout updated." });
      } else {
        setMessage({ ok: false, text: result.error ?? "Could not update rollout." });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-on-surface">Master switch</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Disabled always keeps every user on the current experience.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label="Enable Activation V2"
          onClick={() => {
            setIsEnabled((current) => !current);
            setMessage(null);
          }}
          disabled={isPending}
          className={`relative h-7 w-14 flex-shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            isEnabled ? "bg-primary" : "bg-surface-container-highest"
          }`}
        >
          <span
            className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
              isEnabled ? "translate-x-7" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="activation-rollout-range"
            className="text-sm font-semibold text-on-surface"
          >
            Eligible cohort
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={percentage}
              onChange={(event) => setValidPercentage(Number(event.target.value))}
              aria-label="Activation rollout percentage value"
              className="w-20 rounded-xl border border-outline-variant bg-surface-container-low px-3 py-2 text-right text-sm font-bold text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            />
            <span className="text-sm font-bold text-on-surface-variant">%</span>
          </div>
        </div>
        <input
          id="activation-rollout-range"
          type="range"
          min={0}
          max={100}
          step={1}
          value={percentage}
          onChange={(event) => setValidPercentage(Number(event.target.value))}
          aria-label="Activation rollout percentage"
          className="w-full accent-primary"
        />
        <p className="text-xs text-on-surface-variant">
          Users keep a deterministic bucket, so increasing rollout adds a stable cohort.
        </p>
      </div>

      {message && (
        <p
          role="status"
          className={`rounded-xl px-3 py-2 text-xs font-medium ${
            message.ok
              ? "bg-secondary-container/40 text-on-secondary-container"
              : "bg-error-container/40 text-error"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !dirty}
        aria-busy={isPending}
        className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Apply rollout
      </button>
    </form>
  );
}
