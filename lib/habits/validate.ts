import type { HabitType, MetricType } from "../coach/habit-intelligence";

export type HabitValidationStatus = "ok" | "warn" | "block" | "uncertain";
export type HabitValidationCategory = "policy" | "unhealthy" | "impossible";

export type HabitValidationSuggestion = {
  target?: number;
  unit?: string;
  name?: string;
};

export type HabitValidationResult = {
  status: HabitValidationStatus;
  category: HabitValidationCategory | null;
  message: string | null;
  suggestion: HabitValidationSuggestion | null;
  source: "local" | "gemini" | "gemini_unavailable";
};

export type HabitValidationInput = {
  name: string;
  description: string | null;
  unit: string;
  target: number | null;
  metricType: MetricType;
  habitType: HabitType;
};

const POSITIVE_INTENT =
  /^(quit|stop|no |reduce|reducing|less|avoid|cut down|cut back|fewer|limit)\b/i;

const POLICY_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\b(smoke|smoking|cigarette|cigarettes|vape|vaping|nicotine|tobacco|hookah|shisha)\b/i,
    message:
      'This habit looks like it tracks smoking. We can only help you reduce or quit — try renaming it to "Quit smoking" or "Smoke-free days".',
  },
  {
    pattern:
      /\b(cocaine|heroin|meth|methamphetamine|mdma|ecstasy|ketamine|fentanyl|crack|opioid|opioids)\b/i,
    message:
      "We can't track recreational drug use. If you're trying to quit, rename it to \"Stay sober\" or reach out to a professional.",
  },
  {
    pattern: /\b(smoke|use|take|do|using|taking)\s+(weed|marijuana|cannabis|pot|hash|ganja)\b/i,
    message:
      "We can't track recreational drug use. Try framing this as quitting or reducing instead.",
  },
  {
    pattern: /\b(self[\s-]?harm|cutting myself|hurt myself|suicide|suicidal)\b/i,
    message:
      "We're worried about this habit. Please reach out to a friend, family member, or a helpline near you. We can't track this.",
  },
  {
    pattern:
      /\b(binge eat|binge eating|purge|purging|starve myself|skip meals|not eat|stop eating)\b/i,
    message:
      "This habit could be unsafe for your health. Consider speaking to a professional. We can't track restrictive or purging behaviors.",
  },
  {
    pattern: /\b(get drunk|black out|blackout drink|drink until|chug alcohol)\b/i,
    message: 'We can\'t track excessive drinking. Try "Alcohol-free days" or "Drink less" instead.',
  },
];

export const SANITY_LIMITS = {
  volume_ml: {
    max: 5000,
    message:
      "Drinking more than 5 L of water in a day can be unsafe (water intoxication). 2–3 L is plenty for most adults.",
  },
  steps: {
    max: 50000,
    message:
      "50,000+ steps a day is closer to an ultra-marathon than a habit. Consider a more sustainable target.",
  },
  distance_km: {
    max: 50,
    message: "50 km a day is extreme for most people. Even pros build up to this slowly.",
  },
  hours_sleep_min: {
    min: 4,
    message: "Sleeping less than 4 hours regularly is unhealthy. Adults usually need 7–9 hours.",
  },
  hours_sleep_max: {
    max: 14,
    message:
      "Sleeping more than 14 hours daily may signal an underlying issue. Most adults need 7–9.",
  },
  hours_other_max: {
    max: 8,
    message:
      "More than 8 hours daily on one activity is hard to sustain. Try a more realistic target.",
  },
  minutes_cold_shower: {
    max: 30,
    message: "Cold showers over 30 minutes can cause hypothermia. 2–5 minutes is typical.",
  },
} as const;

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function checkPolicy(name: string, description: string | null): HabitValidationResult | null {
  const haystack = `${name} ${description ?? ""}`;
  const normalized = normalize(name);

  if (POSITIVE_INTENT.test(normalized)) return null;

  for (const { pattern, message } of POLICY_PATTERNS) {
    if (pattern.test(haystack)) {
      return {
        status: "block",
        category: "policy",
        message,
        suggestion: null,
        source: "local",
      };
    }
  }
  return null;
}

function checkNumeric(
  metricType: MetricType,
  habitType: HabitType,
  target: number | null,
): HabitValidationResult | null {
  if (target == null || !Number.isFinite(target) || target <= 0) return null;

  if (metricType === "volume_ml" && target > SANITY_LIMITS.volume_ml.max) {
    return warn("unhealthy", SANITY_LIMITS.volume_ml.message, { target: 3000, unit: "ml" });
  }
  if (metricType === "steps" && target > SANITY_LIMITS.steps.max) {
    return warn("impossible", SANITY_LIMITS.steps.message, { target: 10000 });
  }
  if (metricType === "distance_km" && target > SANITY_LIMITS.distance_km.max) {
    return warn("impossible", SANITY_LIMITS.distance_km.message, { target: 5 });
  }
  if (metricType === "hours" && habitType === "sleep") {
    if (target < SANITY_LIMITS.hours_sleep_min.min) {
      return warn("unhealthy", SANITY_LIMITS.hours_sleep_min.message, { target: 7 });
    }
    if (target > SANITY_LIMITS.hours_sleep_max.max) {
      return warn("unhealthy", SANITY_LIMITS.hours_sleep_max.message, { target: 8 });
    }
  }
  if (
    metricType === "hours" &&
    habitType !== "sleep" &&
    target > SANITY_LIMITS.hours_other_max.max
  ) {
    return warn("impossible", SANITY_LIMITS.hours_other_max.message, { target: 2 });
  }
  if (
    metricType === "minutes" &&
    habitType === "cold_shower" &&
    target > SANITY_LIMITS.minutes_cold_shower.max
  ) {
    return warn("unhealthy", SANITY_LIMITS.minutes_cold_shower.message, { target: 5 });
  }

  return null;
}

function warn(
  category: HabitValidationCategory,
  message: string,
  suggestion: HabitValidationSuggestion | null,
): HabitValidationResult {
  return { status: "warn", category, message, suggestion, source: "local" };
}

export function validateHabitLocally(input: HabitValidationInput): HabitValidationResult {
  const policy = checkPolicy(input.name, input.description);
  if (policy) return policy;

  const numeric = checkNumeric(input.metricType, input.habitType, input.target);
  if (numeric) return numeric;

  if (input.metricType === "boolean") {
    return { status: "ok", category: null, message: null, suggestion: null, source: "local" };
  }

  return { status: "uncertain", category: null, message: null, suggestion: null, source: "local" };
}
