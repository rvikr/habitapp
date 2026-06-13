/* Assembles the final promo MP4s from rendered frames + voiceover (+ optional music).
 * Uses the static ffmpeg shipped by @ffmpeg-installer/ffmpeg (libx264 + AAC). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = ffmpegInstaller.path;

const FORMATS = {
  "9x16": "lagan-promo-9x16.mp4",
  appstore: "lagan-promo-appstore.mp4",
};

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "scenes.json"), "utf8"));
const fps = cfg.fps;
const durSec = cfg.durationMs / 1000;

const voDir = path.join(__dirname, "vo");
const musicFile = path.join(__dirname, "assets", "music.mp3");
const hasMusic = fs.existsSync(musicFile);

const fwd = (p) => p.split(path.sep).join("/");

function buildAudioArgs(inputArgs, filters) {
  // collect existing per-scene VO wavs
  const vo = [];
  for (const s of cfg.scenes) {
    const w = path.join(voDir, `${s.id}.wav`);
    if (fs.existsSync(w)) vo.push({ file: w, start: s.start });
  }
  if (vo.length === 0 && !hasMusic) return null; // no audio track

  const labels = [];
  vo.forEach((v, i) => {
    inputArgs.push("-i", fwd(v.file));
  });
  if (hasMusic) inputArgs.push("-stream_loop", "0", "-i", fwd(musicFile));

  // input indices: 0 = frames(video). audio inputs start at 1.
  // Each VO clip is delayed to its scene start and padded to full length so amix
  // (which has no `normalize` option in this ffmpeg build) keeps a constant 1/N
  // weight; we then restore full level with volume=N + a limiter for safety.
  const n = vo.length;
  vo.forEach((v, i) => {
    filters.push(`[${i + 1}:a]adelay=${v.start},apad[a${i}]`);
    labels.push(`[a${i}]`);
  });

  let voLabel = null;
  if (n > 1) {
    filters.push(
      `${labels.join("")}amix=inputs=${n}:dropout_transition=0,volume=${n},alimiter=limit=0.95[vobus]`,
    );
    voLabel = "[vobus]";
  } else if (n === 1) {
    voLabel = labels[0];
  }

  if (hasMusic) {
    const mIdx = n + 1;
    filters.push(
      `[${mIdx}:a]volume=0.16,afade=t=in:st=0:d=1,afade=t=out:st=${(durSec - 1.5).toFixed(2)}:d=1.5,apad[mus]`,
    );
    if (voLabel) {
      // duck the music under the voiceover, then mix (volume=2 restores level)
      filters.push(`${voLabel}asplit=2[vo1][vo2]`);
      filters.push(
        `[mus][vo2]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=300[ducked]`,
      );
      filters.push(
        `[vo1][ducked]amix=inputs=2:dropout_transition=0,volume=2,alimiter=limit=0.95[aout]`,
      );
      return "[aout]";
    }
    return "[mus]";
  }
  return voLabel;
}

function buildFormat(fmtName, outName) {
  const framesDir = path.join(__dirname, "frames", fmtName);
  if (!fs.existsSync(framesDir) || fs.readdirSync(framesDir).length === 0) {
    console.warn(`! skipping ${fmtName} — no frames in ${framesDir} (run: node render-frames.mjs)`);
    return;
  }
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, outName);

  const inputArgs = ["-framerate", String(fps), "-i", fwd(path.join(framesDir, "frame_%05d.png"))];
  const filters = [];
  const aout = buildAudioArgs(inputArgs, filters);

  const args = ["-y", ...inputArgs];
  if (filters.length) args.push("-filter_complex", filters.join(";"));
  args.push("-map", "0:v");
  if (aout) args.push("-map", aout);
  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-preset",
    "medium",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
  );
  if (aout) args.push("-c:a", "aac", "-b:a", "192k");
  // Trim a touch under the nominal duration so the muxed file stays < 30s
  // (App Store app-preview hard limit). Audio padding can otherwise spill ~0.05s over.
  args.push("-t", (durSec - 0.1).toFixed(2), fwd(outFile));

  console.log(`\n[${fmtName}] -> out/${outName}`);
  const r = spawnSync(FFMPEG, args, { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`! ffmpeg failed for ${fmtName} (exit ${r.status})`);
    process.exitCode = 1;
  } else {
    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`✓ ${outName} (${kb} KB)`);
  }
}

console.log(`ffmpeg: ${FFMPEG}`);
console.log(
  hasMusic
    ? "music: assets/music.mp3 (mixed under VO)"
    : "music: none (drop a royalty-free track at assets/music.mp3 to add one)",
);
for (const [fmt, name] of Object.entries(FORMATS)) buildFormat(fmt, name);
