// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiQuota, recordAiUsageEvent } from "../_shared/ai-guard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_REMINDER_MODEL =
  Deno.env.get("GEMINI_REMINDER_MODEL") ?? Deno.env.get("GEMINI_COACH_MODEL") ?? "gemini-2.5-flash";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SmartReminderRequest = {
  date?: unknown;
  contexts?: unknown;
};

const HABIT_TYPES = new Set([
  "water_intake",
  "walk",
  "sleep",
  "read",
  "run",
  "cycling",
  "meditate",
  "workout",
  "journal",
  "vitamins",
  "healthy_eating",
  "cold_shower",
  "no_social_media",
  "coding",
  "stretch",
  "cooking",
  "custom",
]);
const METRIC_TYPES = new Set(["volume_ml", "steps", "hours", "pages", "minutes", "distance_km", "boolean"]);
const REMINDER_STRATEGIES = new Set(["interval", "conditional_interval"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function cleanTime(value: unknown): string | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return value;
}

function cleanNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function cleanContext(item: unknown) {
  if (!isRecord(item)) return null;
  const habitId = cleanText(item.habitId, 64);
  const habitName = cleanText(item.habitName, 80);
  const habitType = item.habitType;
  const metricType = item.metricType;
  const strategy = item.strategy;
  const currentTime = cleanTime(item.currentTime);
  if (!habitId || !habitName || !currentTime) return null;
  if (typeof habitType !== "string" || !HABIT_TYPES.has(habitType)) return null;
  if (typeof metricType !== "string" || !METRIC_TYPES.has(metricType)) return null;
  if (typeof strategy !== "string" || !REMINDER_STRATEGIES.has(strategy)) return null;

  return {
    habitId,
    habitName,
    habitType,
    metricType,
    strategy,
    intervalMinutes: cleanNumber(item.intervalMinutes),
    target: cleanNumber(item.target),
    unit: typeof item.unit === "string" ? item.unit.slice(0, 16) : null,
    progress: isRecord(item.progress) ? item.progress : {},
    completions: Array.isArray(item.completions) ? item.completions.slice(-14) : [],
    manualTimes: Array.isArray(item.manualTimes) ? item.manualTimes.filter(cleanTime).slice(0, 8) : [],
    reminderDays: Array.isArray(item.reminderDays)
      ? item.reminderDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [],
    streak: cleanNumber(item.streak),
    typicalHour: cleanNumber(item.typicalHour),
    currentTime,
  };
}

function sanitizeContexts(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 20) return null;
  const contexts = input.map(cleanContext);
  if (contexts.some((context) => !context)) return null;
  return contexts;
}

function outputText(body: any): string | null {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.length > 0) return part.text;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let body: SmartReminderRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const contexts = sanitizeContexts(body.contexts);
  if (!contexts) return json({ error: "Invalid reminder contexts" }, 400);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("AI quota guard is not configured for smart-reminders");
    return json({ plans: [], generated: false, reason: "quota_guard_unavailable" }, 503);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const quota = await enforceAiQuota(admin, user.id, "smart-reminders");
  if (!quota.allowed) {
    console.warn("AI smart-reminders blocked", { userId: user.id, reason: quota.reason });
    return json({ plans: [], generated: false, reason: quota.reason }, quota.status);
  }

  if (!GEMINI_API_KEY) {
    await recordAiUsageEvent(admin, user.id, "smart-reminders", "fallback", "gemini_key_missing");
    return json({ plans: [], generated: false, reason: "gemini_key_missing" }, 503);
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_REMINDER_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": GEMINI_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text:
                "You choose same-day habit reminder times. Return JSON only. " +
                "Use only future HH:MM local times between 08:00 and 22:00. " +
                "Prefer times near recent successful completions, avoid notification spam, and never exceed 4 times per habit.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: JSON.stringify({
                  date: typeof body.date === "string" ? body.date : null,
                  contexts,
                }),
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 900,
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: smartReminderSchema(),
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini smart-reminders failed", { status: response.status, error });
    await recordAiUsageEvent(admin, user.id, "smart-reminders", "failed", "gemini_error", {
      status: response.status,
    });
    return json({ plans: [], generated: false });
  }

  try {
    const result = await response.json();
    const parsed = JSON.parse(outputText(result) ?? "{}");
    const plans = isRecord(parsed) && Array.isArray(parsed.plans) ? parsed.plans : [];
    await recordAiUsageEvent(
      admin,
      user.id,
      "smart-reminders",
      plans.length > 0 ? "succeeded" : "fallback",
      plans.length > 0 ? undefined : "empty_gemini_output",
    );
    return json({ plans, generated: plans.length > 0 });
  } catch (error) {
    console.error("Gemini smart-reminders parse failed", error);
    await recordAiUsageEvent(admin, user.id, "smart-reminders", "failed", "parse_failed");
    return json({ plans: [], generated: false });
  }
});

function smartReminderSchema() {
  return {
    type: "object",
    required: ["plans"],
    properties: {
      plans: {
        type: "array",
        minItems: 0,
        maxItems: 20,
        items: {
          type: "object",
          required: ["habitId", "times"],
          properties: {
            habitId: { type: "string" },
            times: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string" },
            },
          },
        },
      },
    },
  };
}
