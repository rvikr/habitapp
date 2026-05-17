import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const ICON_MAP: Record<string, string> = {
  // Navigation
  home: "home",
  person: "account",
  settings: "cog",
  emoji_events: "trophy",
  auto_awesome: "auto-fix",
  // Actions
  add: "plus",
  close: "close",
  edit: "pencil",
  delete: "delete",
  check: "check",
  check_circle: "check-circle",
  radio_button_unchecked: "circle-outline",
  more_horiz: "dots-horizontal",
  chevron_right: "chevron-right",
  arrow_back: "arrow-left",
  arrow_forward: "arrow-right",
  // Habits
  water_drop: "water",
  directions_run: "run-fast",
  directions_walk: "walk",
  menu_book: "book-open-variant",
  self_improvement: "meditation",
  edit_note: "note-edit",
  fitness_center: "dumbbell",
  bedtime: "weather-night",
  medication: "pill",
  restaurant: "food",
  nutrition: "food-apple",
  shower: "shower-head",
  do_not_disturb_on: "cancel",
  code: "code-tags",
  sports_gymnastics: "yoga",
  directions_bike: "bicycle",
  outdoor_grill: "grill",
  spa: "leaf",
  // Badges
  flag: "flag",
  add_task: "clipboard-check-outline",
  eco: "leaf",
  local_fire_department: "fire",
  workspace_premium: "star-circle",
  favorite: "heart",
  whatshot: "fire",
  // Settings / misc
  notifications: "bell",
  notifications_off: "bell-off",
  light_mode: "weather-sunny",
  dark_mode: "weather-night",
  brightness_auto: "brightness-5",
  lock: "lock",
  email: "email",
  security: "shield-lock",
  calendar_today: "calendar-today",
  timer: "timer",
  circle: "circle",
};

type Props = {
  name: string;
  size?: number;
  color?: string;
};

export default function Icon({ name, size = 24, color = "currentColor" }: Props) {
  const mapped = (ICON_MAP[name] ?? name) as keyof typeof MaterialCommunityIcons.glyphMap;
  return <MaterialCommunityIcons name={mapped} size={size} color={color} />;
}
