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
export type MetricType =
  | "volume_ml"
  | "steps"
  | "hours"
  | "pages"
  | "minutes"
  | "distance_km"
  | "boolean";
export type VisualType =
  | "water_bottle"
  | "step_path"
  | "sleep_moon"
  | "reading_book"
  | "progress_ring";
export type ReminderStrategy = "manual" | "interval" | "conditional_interval";
export type CoachTone = "friendly" | "motivational" | "calm" | "strict" | "military";
export type SubscriptionStatus =
  | "free"
  | "trial"
  | "active"
  | "grace_period"
  | "billing_issue"
  | "expired"
  | "cancelled";

export type Profile = {
  user_id: string;
  display_name: string | null;
  avatar_style: string | null;
  avatar_seed: string | null;
  is_pro: boolean;
  platform: string | null;
  coach_tone: CoachTone | null;
  pro_trial_started_at: string | null;
  pro_trial_ends_at: string | null;
  revenuecat_app_user_id: string | null;
  revenuecat_entitlement_id: string | null;
  revenuecat_product_id: string | null;
  revenuecat_store: string | null;
  revenuecat_period_type: string | null;
  revenuecat_latest_event_id: string | null;
  revenuecat_entitlement_active: boolean;
  revenuecat_status: SubscriptionStatus;
  pro_expires_at: string | null;
  subscription_synced_at: string | null;
  first_habit_logged_at: string | null;
  activation_engaged_at: string | null;
  created_at: string;
  updated_at: string;
};

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

export type SleepEntry = {
  id: string;
  user_id: string | null;
  sleep_date: string;
  source: "healthConnect" | "healthKit" | "manual";
  duration_minutes: number;
  score: number;
  start_time: string | null;
  end_time: string | null;
  stage_minutes: {
    awake?: number;
    asleep?: number;
    core?: number;
    deep?: number;
    rem?: number;
    outOfBed?: number;
  } | null;
  source_metadata: Record<string, unknown> | null;
  synced_at: string;
  created_at: string;
  updated_at: string;
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

export type Milestone = {
  id: string;
  name: string;
  description: string;
  progress: number;
};

// One habit's deterministic weekly breakdown, computed by the progress-report
// edge function. Mirrors HabitAnalysis there. All figures already carry their
// own unit; the UI renders these as-is and the AI prose only rephrases them.
export type WeeklyReportHabitAnalysis = {
  name: string;
  unit: string | null;
  target: number | null;
  isQuantity: boolean;
  daysLogged: number;
  scheduledDays: number;
  completionRate: number; // 0..1
  weeklyTotal: number | null;
  dailyAverage: number | null;
  targetHitDays: number | null;
  displayTotal: string | null; // pre-formatted, e.g. "41,000 steps"
  displayAverage: string | null;
};

export type WeeklyReportSnapshot = {
  weekStart: string;
  weekEnd: string;
  totalCompletions: number;
  activeHabits: number;
  perfectDays: number;
  bestStreak: number;
  completionRate: number; // 0..1
  strongestHabit: string | null;
  focusHabit: string | null;
  trend: { lastWeekCompletions: number; delta: number };
  byHabit: WeeklyReportHabitAnalysis[];
};

export type WeeklyProgressReport = {
  id: string;
  user_id: string;
  week_start: string;
  summary_text: string;
  // Older rows used a flatter shape; treat as partial when reading.
  stats_snapshot: Partial<WeeklyReportSnapshot> & Record<string, unknown>;
  model: string | null;
  generated_at: string;
};
