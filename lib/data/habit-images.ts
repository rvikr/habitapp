import type { Habit, HabitType } from "@/types/db";
import { inferHabitType } from "../coach/habit-intelligence.ts";

export type HabitVisual = {
  base: string;
  accent: string;
  glow: string;
  mark: string;
};

const DEFAULT_PRESET: HabitVisual = {
  base: "#2F3A32",
  accent: "#F26B1F",
  glow: "#FFC56B",
  mark: "M126 254 C174 178 258 132 360 130 C314 160 292 202 300 258 C246 226 190 230 126 254 Z",
};

const SVG_XMLNS = "http" + "://www.w3.org/2000/svg";

const PRESETS: Partial<Record<HabitType, HabitVisual>> = {
  workout: {
    base: "#2E3440",
    accent: "#F26B1F",
    glow: "#FFC56B",
    mark: "M142 210 H198 V184 H226 V276 H198 V250 H142 V276 H114 V184 H142 Z M374 210 H430 V184 H458 V276 H430 V250 H374 V276 H346 V184 H374 Z M232 220 H340 V240 H232 Z",
  },
  run: {
    base: "#263238",
    accent: "#4DB6AC",
    glow: "#F26B1F",
    mark: "M160 278 C220 222 256 176 328 132 L360 156 C312 180 294 214 268 266 L224 250 C206 268 184 282 160 278 Z M354 128 A24 24 0 1 0 354 80 A24 24 0 0 0 354 128 Z",
  },
  walk: {
    base: "#26392F",
    accent: "#5DBB63",
    glow: "#FFC56B",
    mark: "M132 286 C190 250 250 232 312 232 C370 232 422 246 474 278 M176 254 L220 210 L260 244 L310 184 L366 232 L414 198 L466 254",
  },
  water_intake: {
    base: "#17384B",
    accent: "#4FB9E8",
    glow: "#BFEFFF",
    mark: "M300 82 C248 156 216 208 216 254 A84 84 0 0 0 384 254 C384 208 352 156 300 82 Z M250 260 C282 286 322 286 350 260",
  },
  read: {
    base: "#343049",
    accent: "#C7A7FF",
    glow: "#FFC56B",
    mark: "M146 128 C210 112 250 126 300 160 C350 126 390 112 454 128 V282 C390 266 350 280 300 314 C250 280 210 266 146 282 Z M300 160 V314",
  },
  meditate: {
    base: "#29374A",
    accent: "#8EC5FF",
    glow: "#F26B1F",
    mark: "M300 140 A38 38 0 1 0 300 64 A38 38 0 0 0 300 140 Z M182 280 C230 214 370 214 418 280 M222 298 C270 254 330 254 378 298",
  },
  journal: {
    base: "#40332E",
    accent: "#E7B980",
    glow: "#F26B1F",
    mark: "M178 98 H392 C410 98 424 112 424 130 V302 H178 C160 302 146 288 146 270 V130 C146 112 160 98 178 98 Z M198 138 H372 M198 182 H350 M198 226 H314",
  },
  sleep: {
    base: "#232946",
    accent: "#A9B7FF",
    glow: "#FFC56B",
    mark: "M350 92 C312 118 292 158 300 204 C310 258 356 292 414 286 C384 316 336 326 292 306 C232 278 204 210 232 150 C252 106 298 82 350 92 Z",
  },
  vitamins: {
    base: "#324136",
    accent: "#B7E07A",
    glow: "#F26B1F",
    mark: "M216 124 L384 292 M250 90 A70 70 0 0 1 320 160 L196 284 A70 70 0 0 1 126 214 Z M350 116 A62 62 0 0 1 438 204 L334 308 A62 62 0 0 1 246 220 Z",
  },
  healthy_eating: {
    base: "#2D3B2F",
    accent: "#77C66E",
    glow: "#FFC56B",
    mark: "M300 302 C238 250 202 190 214 126 C272 128 314 164 326 220 C346 164 390 122 456 112 C462 188 414 270 300 302 Z",
  },
  cold_shower: {
    base: "#183140",
    accent: "#83D8FF",
    glow: "#FFFFFF",
    mark: "M218 102 H382 V142 H218 Z M250 170 V282 M300 170 V282 M350 170 V282 M232 310 H368",
  },
  no_social_media: {
    base: "#3A2A35",
    accent: "#F37C8D",
    glow: "#FFC56B",
    mark: "M208 110 H392 A36 36 0 0 1 428 146 V254 A36 36 0 0 1 392 290 H208 A36 36 0 0 1 172 254 V146 A36 36 0 0 1 208 110 Z M196 292 L404 108",
  },
  coding: {
    base: "#22313F",
    accent: "#63D2B4",
    glow: "#FFC56B",
    mark: "M240 142 L160 204 L240 266 M360 142 L440 204 L360 266 M326 126 L274 282",
  },
  stretch: {
    base: "#312F43",
    accent: "#D7A7FF",
    glow: "#F26B1F",
    mark: "M300 132 A34 34 0 1 0 300 64 A34 34 0 0 0 300 132 Z M182 294 C238 214 362 214 418 294 M300 154 V250 M238 184 H362",
  },
  cycling: {
    base: "#26343A",
    accent: "#7DD3C7",
    glow: "#F26B1F",
    mark: "M210 278 A58 58 0 1 0 210 162 A58 58 0 0 0 210 278 Z M390 278 A58 58 0 1 0 390 162 A58 58 0 0 0 390 278 Z M210 220 H282 L328 154 H382 M282 220 L350 220",
  },
  cooking: {
    base: "#3E3028",
    accent: "#FFB06B",
    glow: "#F26B1F",
    mark: "M190 180 H410 V220 C410 280 370 314 300 314 C230 314 190 280 190 220 Z M236 142 C236 112 270 112 270 82 M300 142 C300 112 334 112 334 82 M364 142 C364 112 398 112 398 82",
  },
};

function makeHabitImage({ base, accent, glow, mark }: HabitVisual): string {
  const svg = `<svg xmlns="${SVG_XMLNS}" viewBox="0 0 600 400"><rect width="600" height="400" fill="${base}"/><circle cx="98" cy="78" r="118" fill="${accent}" opacity=".28"/><circle cx="500" cy="322" r="154" fill="${glow}" opacity=".18"/><path d="${mark}" fill="none" stroke="${accent}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><path d="M58 340 C188 284 316 380 542 300" fill="none" stroke="${glow}" stroke-width="10" opacity=".22" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_HABIT_IMAGE = makeHabitImage(DEFAULT_PRESET);

export const HABIT_IMAGES: Partial<Record<HabitType, string>> = {
  workout: makeHabitImage(PRESETS.workout!),
  run: makeHabitImage(PRESETS.run!),
  walk: makeHabitImage(PRESETS.walk!),
  water_intake: makeHabitImage(PRESETS.water_intake!),
  read: makeHabitImage(PRESETS.read!),
  meditate: makeHabitImage(PRESETS.meditate!),
  journal: makeHabitImage(PRESETS.journal!),
  sleep: makeHabitImage(PRESETS.sleep!),
  vitamins: makeHabitImage(PRESETS.vitamins!),
  healthy_eating: makeHabitImage(PRESETS.healthy_eating!),
  cold_shower: makeHabitImage(PRESETS.cold_shower!),
  no_social_media: makeHabitImage(PRESETS.no_social_media!),
  coding: makeHabitImage(PRESETS.coding!),
  stretch: makeHabitImage(PRESETS.stretch!),
  cycling: makeHabitImage(PRESETS.cycling!),
  cooking: makeHabitImage(PRESETS.cooking!),
};

export function getHabitImage(habitType: HabitType | null | undefined): string {
  if (!habitType) return DEFAULT_HABIT_IMAGE;
  return HABIT_IMAGES[habitType] ?? DEFAULT_HABIT_IMAGE;
}

export function getHabitVisual(habitType: HabitType | null | undefined): HabitVisual {
  if (!habitType) return DEFAULT_PRESET;
  return PRESETS[habitType] ?? DEFAULT_PRESET;
}

export function getHabitImageForHabit(
  habit: Pick<Habit, "habit_type" | "name" | "icon" | "unit">,
): string {
  const inferredType =
    habit.habit_type && habit.habit_type !== "custom"
      ? habit.habit_type
      : inferHabitType({
          name: habit.name,
          icon: habit.icon,
          unit: habit.unit,
          habitType: habit.habit_type,
        });

  return getHabitImage(inferredType);
}

export function getHabitVisualForHabit(
  habit: Pick<Habit, "habit_type" | "name" | "icon" | "unit">,
): HabitVisual {
  const inferredType =
    habit.habit_type && habit.habit_type !== "custom"
      ? habit.habit_type
      : inferHabitType({
          name: habit.name,
          icon: habit.icon,
          unit: habit.unit,
          habitType: habit.habit_type,
        });

  return getHabitVisual(inferredType);
}
