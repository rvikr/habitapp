export type GeminiSafetySetting = {
  category: string;
  threshold: "BLOCK_MEDIUM_AND_ABOVE" | "BLOCK_ONLY_HIGH";
};

const SAFETY_CATEGORIES = [
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
] as const;

export const GENERATIVE_SAFETY_SETTINGS: GeminiSafetySetting[] =
  SAFETY_CATEGORIES.map(
    (category) => ({ category, threshold: "BLOCK_MEDIUM_AND_ABOVE" }),
  );

export const CLASSIFIER_SAFETY_SETTINGS: GeminiSafetySetting[] =
  SAFETY_CATEGORIES.map(
    (category) => ({ category, threshold: "BLOCK_ONLY_HIGH" }),
  );

export type GeminiResponseMetadata = {
  safetyBlocked: boolean;
  finishReason: string | null;
  safetyCategory: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export function sanitizeUntrustedText(
  value: unknown,
  maxLength: number,
): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

export function untrustedUserData(value: unknown): string {
  return JSON.stringify({ user_data: value });
}

export function geminiResponseMetadata(value: unknown): GeminiResponseMetadata {
  const body = asRecord(value);
  const promptFeedback = asRecord(body.promptFeedback);
  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  const candidate = asRecord(candidates[0]);
  const finishReason = stringValue(candidate.finishReason);
  const promptBlockReason = stringValue(promptFeedback.blockReason);
  const safetyRatings = [
    ...(Array.isArray(promptFeedback.safetyRatings)
      ? promptFeedback.safetyRatings
      : []),
    ...(Array.isArray(candidate.safetyRatings) ? candidate.safetyRatings : []),
  ];
  const normalizedRatings = safetyRatings.map(asRecord);
  const blockedRating = normalizedRatings.find((rating) =>
    rating.blocked === true
  );
  const safetyBlocked = Boolean(promptBlockReason) ||
    finishReason === "SAFETY" ||
    blockedRating != null;
  const categoryRating = blockedRating ??
    (safetyBlocked
      ? normalizedRatings.find((rating) => stringValue(rating.category))
      : undefined);
  const rawCategory = stringValue(categoryRating?.category);
  const usage = asRecord(body.usageMetadata);

  return {
    safetyBlocked,
    finishReason,
    safetyCategory: rawCategory?.replace(/^HARM_CATEGORY_/, "") ?? null,
    inputTokens: nonNegativeInteger(usage.promptTokenCount),
    outputTokens: nonNegativeInteger(usage.candidatesTokenCount),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;
}
