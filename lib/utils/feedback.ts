import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { validateFeedback } from "../auth/validation";

export type FeedbackCategory = "bug" | "idea" | "usability" | "other";

export type FeedbackInput = {
  category: FeedbackCategory;
  rating: number;
  message: string;
  includeEmail: boolean;
};

export async function submitFeedback(
  input: FeedbackInput,
): Promise<{ ok: boolean; error?: string }> {
  const validationError = validateFeedback(input);
  if (validationError) return { ok: false, error: validationError };
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase is not configured." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to sign in again." };

  const { error } = await supabase.from("feedback_reports").insert({
    user_id: user.id,
    email: input.includeEmail ? (user.email ?? null) : null,
    category: input.category,
    rating: input.rating,
    message: input.message.trim(),
    app_version: Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    build_number: String(
      Constants.expoConfig?.android?.versionCode ?? Constants.nativeBuildVersion ?? "",
    ),
    platform: Platform.OS,
    os_version: Device.osVersion ?? null,
    device_name: Device.deviceName ?? Device.modelName ?? null,
  });

  if (error) return { ok: false, error: error.message };

  // Fire-and-forget: notify team via email. Don't fail the submission if this errors.
  supabase.functions
    .invoke("support-email", {
      body: { message: input.message.trim(), category: input.category, rating: input.rating },
    })
    .catch(() => {});

  return { ok: true };
}
