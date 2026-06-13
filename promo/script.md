# Lagan promo — script & storyboard

~30 seconds, vertical. **`scenes.json` is the machine-readable source of truth**
(timings, captions, voiceover). This file is the human-readable companion — edit both
together if you change copy.

| #   | Time       | Scene                                                                 | On-screen caption                                   | Voiceover                                                          |
| --- | ---------- | --------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | 0–3.0s     | Sign-in / logo reveal                                                 | **Meet Lagan** · Your AI habit coach                | "Meet Lagan, your AI habit coach."                                 |
| 2   | 3.0–8.0s   | AI routine wizard: goals → "Building your routine…" → habits slide in | **AI builds your routine** · Answer a few questions | "Answer a few questions, and AI builds a routine for your day."    |
| 3   | 8.0–13.5s  | Today dashboard: tap the walk → check + confetti + ring fills         | **Track with one tap** · Keep your streak alive     | "Track your habits with a single tap, and keep your streak alive." |
| 4   | 13.5–17.0s | AI Coach chat nudge                                                   | **Coaching that adapts** · Personal nudges, on time | "Get personal coaching that adapts to your momentum."              |
| 5   | 17.0–20.5s | Habit detail: weekly bars + auto step sync counting up                | **Steps & sleep, auto-synced** · No extra logging   | "Steps and sleep sync automatically. No extra logging."            |
| 6   | 20.5–24.5s | Progress: heatmap + life-balance wheel + XP bar + level up            | **See your progress grow** · Consistency & balance  | "Watch your consistency and balance grow, week after week."        |
| 7   | 24.5–27.5s | Leaderboard rows + badge pop                                          | **Badges, XP & ranks** · Level up together          | "Earn badges, level up, and climb the leaderboard."                |
| 8   | 27.5–30.0s | CTA: logo + store badges + lagan.health                               | **Build better habits** · iOS · Android · Web       | "Lagan. Build better habits, on iOS, Android, and web."            |

## Editing copy

- Change captions / VO / timings in **`scenes.json`**, then re-run the pipeline.
- Visual choreography (taps, confetti, bars, etc.) lives in **`scene/timeline.js`**, keyed by
  scene `id` and absolute millisecond offsets.
