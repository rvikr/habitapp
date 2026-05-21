export type ColorVariant = "primary" | "secondary" | "tertiary" | "neutral";
export type HabitType =
  | "water_intake"
  | "walk"
  | "sleep"
  | "read"
  | "run"
  | "cycling"
  | "meditate"
  | "workout"
  | "journal"
  | "vitamins"
  | "healthy_eating"
  | "cold_shower"
  | "no_social_media"
  | "coding"
  | "stretch"
  | "cooking"
  | "custom";
export type MetricType = "volume_ml" | "steps" | "hours" | "pages" | "minutes" | "distance_km" | "boolean";
export type VisualType = "water_bottle" | "step_path" | "sleep_moon" | "reading_book" | "progress_ring";
export type SubscriptionStatus =
  | "free"
  | "trial"
  | "active"
  | "grace_period"
  | "billing_issue"
  | "expired"
  | "cancelled";
export type ReminderStrategy = "manual" | "interval" | "conditional_interval";
export type CoachTone = "friendly" | "motivational" | "calm" | "strict" | "military";

export type Habit = {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  icon: string;
  color: ColorVariant;
  target: number | null;
  unit: string | null;
  reminder_time: string | null;
  reminder_times: string[] | null;
  reminder_days: number[] | null;
  reminders_enabled: boolean | null;
  habit_type: HabitType | null;
  metric_type: MetricType | null;
  visual_type: VisualType | null;
  reminder_strategy: ReminderStrategy | null;
  reminder_interval_minutes: number | null;
  default_log_value: number | null;
  created_at: string;
  archived_at: string | null;
};

export type HabitCompletion = {
  id: string;
  habit_id: string;
  user_id: string | null;
  completed_on: string;
  value: number | null;
  note: string | null;
  created_at: string;
};

export type Badge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  earned_at?: string;
  tone: "yellow" | "purple" | "teal" | "red" | "indigo" | "orange";
};
