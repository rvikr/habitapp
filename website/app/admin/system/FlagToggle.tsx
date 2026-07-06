"use client";

import { useState, useTransition } from "react";
import { toggleFeatureFlag } from "./actions";

export function FlagToggle({ flagKey, enabled }: { flagKey: string; enabled: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [isEnabled, setIsEnabled] = useState(enabled);

  function handleClick() {
    const next = !isEnabled;
    setIsEnabled(next);
    startTransition(async () => {
      const res = await toggleFeatureFlag(flagKey, next);
      if (!res.ok) setIsEnabled(!next); // revert on error
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      aria-label={isEnabled ? "Disable" : "Enable"}
      className={`w-12 h-6 rounded-full relative transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 flex-shrink-0 ${
        isEnabled ? "bg-primary" : "bg-surface-container-highest"
      } ${isPending ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          isEnabled ? "translate-x-6" : "translate-x-0"
        }`}
      />
    </button>
  );
}
