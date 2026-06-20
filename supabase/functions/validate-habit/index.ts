// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiQuota, recordAiUsageEvent } from "../_shared/ai-guard.ts";
import { generateContent } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_VALIDATE_MODEL =
  Deno.env.get("GEMINI_VALIDATE_MODEL") ?? Deno.env.get("GEMINI_COACH_MODEL") ?? "gemini-2.5-flash";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
const METRIC_TYPES = new Set([
  "volume_ml",
  "steps",
  "hours",
  "pages",
  "minutes",
  "distance_km",
  "boolean",
]);

type HabitInput = {
  name: string;
  description: string | null;
  unit: string;
  target: number | null;
  habitType: string;
  metricType: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function sanitizeHabit(input: unknown): HabitInput | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const name = cleanText(raw.name, 120);
  const habitType = typeof raw.habitType === "string" && HABIT_TYPES.has(raw.habitType) ? raw.habitType : null;
  const metricType = typeof raw.metricType === "string" && METRIC_TYPES.has(raw.metricType) ? raw.metricType : null;
  if (!name || !habitType || !metricType) return null;

  const unit = typeof raw.unit === "string" ? raw.unit.trim().slice(0, 16) : "";
  const description =
    typeof raw.description === "string" && raw.description.trim().length > 0
      ? raw.description.trim().slice(0, 400)
      : null;
  const target =
    typeof raw.target === "number" && Number.isFinite(raw.target) && raw.target > 0 ? raw.target : null;

  return { name, description, unit, target, habitType, metricType };
}

function outputText(body: any): string | null {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.length > 0) return part.text;
  }
  return null;
}

function okResult(source: "gemini" | "gemini_unavailable") {
  return { status: "ok" as const, category: null, message: null, suggestion: null, source };
}

function unavailableResult(reason: string) {
  return {
    status: "warn" as const,
    category: null,
    message:
      "AI safety review is temporarily unavailable. Review this habit carefully before saving.",
    suggestion: null,
    source: "gemini_unavailable" as const,
    reason,
  };
}

function validateHabitSchema() {
  return {
    type: "object",
    required: ["status"],
    properties: {
      status: { type: "string", enum: ["ok", "warn", "block"] },
      category: { type: "string", enum: ["policy", "unhealthy", "impossible"], nullable: true },
      message: { type: "string", nullable: true },
      suggestion: {
        type: "object",
        nullable: true,
        properties: {
          target: { type: "number" },
          unit: { type: "string" },
          name: { type: "string" },
        },
      },
    },
  };
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

  let body: { habit?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const habit = sanitizeHabit(body.habit);
  if (!habit) return json({ error: "Invalid habit payload" }, 400);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("AI quota guard is not configured for validate-habit");
    return json(unavailableResult("quota_guard_unavailable"));
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const quota = await enforceAiQuota(admin, user.id, "validate-habit");
  if (!quota.allowed) {
    console.warn("AI validate-habit blocked", { userId: user.id, reason: quota.reason });
    if (quota.reason === "quota_guard_failed") return json(unavailableResult(quota.reason));
    return json(okResult("gemini_unavailable"));
  }

  if (!GEMINI_API_KEY) {
    await recordAiUsageEvent(admin, user.id, "validate-habit", "fallback", "gemini_key_missing");
    return json(okResult("gemini_unavailable"));
  }

  const response = await generateContent(GEMINI_VALIDATE_MODEL, GEMINI_API_KEY, {
    systemInstruction: {
      parts: [
        {
          text:
            "You are a safety reviewer for a habit-tracker app. Decide if the user's habit is realistic, healthy, and policy-compliant. " +
            "BLOCK habits that encourage smoking, recreational drug use, self-harm, suicide, disordered eating, or excessive drinking. " +
            "WARN on physically impossible targets (e.g. 10 L water/day, 100 km running/day) or clearly unhealthy ranges. " +
            "APPROVE quitting-, reducing-, or harm-reduction habits (e.g. 'Quit smoking', 'Less alcohol'). " +
            "When unsure, return status 'ok'. " +
            "Reply ONLY in the JSON schema. Keep messages under 160 characters, supportive in tone, no moralizing, no medical advice. " +
            "If you warn, include a realistic suggested target/unit when possible.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: JSON.stringify({
              name: habit.name,
              description: habit.description,
              target: habit.target,
              unit: habit.unit,
              habitType: habit.habitType,
              metricType: habit.metricType,
            }),
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 200,
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: validateHabitSchema(),
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini validate-habit failed", { status: response.status, error });
    await recordAiUsageEvent(admin, user.id, "validate-habit", "failed", "gemini_error", {
      status: response.status,
    });
    return json(okResult("gemini_unavailable"));
  }

  try {
    const result = await response.json();
    const text = outputText(result);
    const parsed = text ? JSON.parse(text) : null;
    if (!parsed || typeof parsed !== "object") {
      await recordAiUsageEvent(admin, user.id, "validate-habit", "fallback", "empty_gemini_output");
      return json(okResult("gemini"));
    }
    await recordAiUsageEvent(admin, user.id, "validate-habit", "succeeded");
    return json({ ...parsed, source: "gemini" });
  } catch (error) {
    console.error("Gemini validate-habit parse failed", error);
    await recordAiUsageEvent(admin, user.id, "validate-habit", "failed", "parse_failed");
    return json(okResult("gemini_unavailable"));
  }
});
