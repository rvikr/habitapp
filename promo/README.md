# Lagan promo video pipeline

Self-contained, reproducible **~30s vertical promo** for Lagan — for the App Store listing
and social media. It renders a brand-accurate animated "scene" (no live backend, no auth)
deterministically with Playwright, adds an AI voiceover + on-screen captions, and exports
MP4s with the bundled ffmpeg.

**Nothing here touches the app** — it's an isolated folder.

## Output

| File                           | Resolution       | Use                                         |
| ------------------------------ | ---------------- | ------------------------------------------- |
| `out/lagan-promo-9x16.mp4`     | 1080×1920 (9:16) | Reels / Shorts / TikTok / Stories           |
| `out/lagan-promo-appstore.mp4` | 1290×2796        | App Store Connect app preview (iPhone 6.7") |

Both are 30 fps, H.264 + AAC, ~30 s — within App Store preview limits (portrait, 30 fps,
H.264, 15–30 s, ≤500 MB).

## One-time setup

```bash
cd promo
npm install            # playwright (chromium already cached) + @ffmpeg-installer/ffmpeg
```

## Render everything

```bash
npm run all            # frames  ->  voiceover  ->  mp4s
```

…or step by step:

```bash
npm run render         # Playwright -> frames/<fmt>/*.png   (deterministic, 30fps)
npm run vo             # Windows SAPI -> vo/<scene>.wav
npm run build          # ffmpeg -> out/*.mp4
```

Fast smoke test (30 frames, one format):

```bash
npm run render:test
```

## Preview the scene live

```bash
node -e "import('node:http')"   # (no-op) — use any static server rooted at promo/
npx http-server . -p 8080       # then open http://localhost:8080/scene/index.html
```

In the browser console you can scrub: `window.__seek(8000)` (ms). It auto-plays/loops unless
the URL has `?capture=1`.

## Customize

- **Copy / timing / captions / VO lines** → edit `scenes.json` (the source of truth), then
  re-run. `script.md` is the human-readable storyboard.
- **Motion / choreography** (taps, confetti, bars, badge pop) → `scene/timeline.js`, keyed by
  scene `id` + absolute ms offsets.
- **Look** (colors, fonts, phone frame, each screen) → `scene/styles.css` + `scene/index.html`.
  Palette mirrors the app: Ember `#F26B1F`, success `#3EBB7F`, gold `#FFC56B`, dark `#0B0B0E`.
- **App Store device size**: change `appstore` dims in `render-frames.mjs` (e.g. 6.9" =
  1320×2868).

## Music (optional)

Drop a **royalty-free** track at `assets/music.mp3` and re-run `npm run build`. It's auto-mixed
under the voiceover with ducking. None is included — grab one from the YouTube Audio Library or
Pixabay (no copyrighted music).

## Voiceover quality

Default is **offline Windows SAPI** — zero setup, but the voices are robotic. To upgrade,
replace the `Speak` loop in `tts.ps1` with an ElevenLabs / OpenAI TTS call that writes the same
`vo/<scene-id>.wav` files; `build.mjs` is unchanged. Review the SAPI output first to decide if
it's good enough.
