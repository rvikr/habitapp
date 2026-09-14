import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

type Tone = "yellow" | "orange" | "purple" | "teal" | "indigo" | "red";

const CARD_PITCH =
  "Lagan helps you build better habits with simple tracking, streaks, smart reminders, and AI coaching.";

const TONE_ACCENT: Record<Tone, string> = {
  yellow: "#E5A84A",
  orange: "#F26B1F",
  purple: "#7C5CC4",
  teal: "#2A8A5A",
  indigo: "#4F72B8",
  red: "#D84949",
};

const fontsDir = path.join(process.cwd(), "public", "fonts");
const fontDisplay = fs.readFileSync(path.join(fontsDir, "SpaceGrotesk-Bold.ttf"));
const fontBody = fs.readFileSync(path.join(fontsDir, "Manrope-Regular.ttf"));

function safeText(value: string | null, fallback: string, maxLength: number) {
  const normalized = value?.trim();
  return (normalized || fallback).slice(0, maxLength);
}

function safeRank(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function safeTone(value: string | null): Tone {
  return value && value in TONE_ACCENT ? (value as Tone) : "indigo";
}

function badgeMonogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "✓";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function ChainMark({ size }: { size: number }) {
  const stroke = Math.max(5, Math.round(size * 0.11));
  return (
    <div style={{ display: "flex", position: "relative", width: size, height: size }}>
      <div
        style={{
          position: "absolute",
          left: size * 0.13,
          top: size * 0.05,
          width: size * 0.34,
          height: size * 0.62,
          border: `${stroke}px solid #F26B1F`,
          borderRadius: size * 0.2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: size * 0.32,
          top: size * 0.42,
          width: size * 0.62,
          height: size * 0.34,
          border: `${stroke}px solid #C24E0D`,
          borderRadius: size * 0.2,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: size * 0.39,
          top: size * 0.5,
          width: stroke,
          height: size * 0.17,
          borderRadius: stroke,
          backgroundColor: "#F26B1F",
        }}
      />
    </div>
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "badge";
  const portrait = searchParams.get("ratio") === "portrait";
  const width = portrait ? 1080 : 1200;
  const height = portrait ? 1350 : 630;
  const pad = portrait ? 76 : 64;

  const tone = safeTone(searchParams.get("tone"));
  const accent = type === "rank" || type === "article" ? "#F26B1F" : TONE_ACCENT[tone];
  const rank = safeRank(searchParams.get("rank"));
  const badgeName = safeText(searchParams.get("name"), "New Achievement", 48);
  const badgeDescription = safeText(
    searchParams.get("description"),
    "A new milestone earned through consistent daily action.",
    150,
  );
  const articleTitle = safeText(searchParams.get("title"), "Lagan Blog", 120);
  const articleSubtitle = safeText(
    searchParams.get("subtitle"),
    "Guides from lagan.health/blog",
    160,
  );

  const eyebrow =
    type === "rank" ? "GLOBAL LEADERBOARD" : type === "article" ? "LAGAN JOURNAL" : "ACHIEVEMENT UNLOCKED";
  const title = type === "rank" ? `#${rank}` : type === "article" ? articleTitle : badgeName;
  const detail =
    type === "rank" ? "All-time rank" : type === "article" ? articleSubtitle : badgeDescription;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          flexDirection: "column",
          backgroundColor: "#FAF7F2",
          color: "#171311",
          padding: pad,
          fontFamily: "Manrope",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: portrait ? 600 : 440,
            height: portrait ? 600 : 440,
            borderRadius: portrait ? 300 : 220,
            right: portrait ? -220 : -140,
            top: portrait ? -260 : -210,
            backgroundColor: `${accent}24`,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            width: portrait ? 430 : 300,
            height: portrait ? 430 : 300,
            borderRadius: portrait ? 215 : 150,
            left: portrait ? -210 : -140,
            bottom: portrait ? -220 : -170,
            backgroundColor: "#3EBB7F1F",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: portrait ? 22 : 16 }}>
          <ChainMark size={portrait ? 92 : 62} />
          <div
            style={{
              display: "flex",
              fontFamily: "Space Grotesk",
              fontWeight: 700,
              fontSize: portrait ? 44 : 32,
              letterSpacing: -1,
            }}
          >
            Lagan
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: portrait ? "column" : "row",
            alignItems: portrait ? "stretch" : "center",
            justifyContent: "center",
            marginTop: portrait ? 48 : 20,
            marginBottom: portrait ? 48 : 18,
            padding: portrait ? 70 : 54,
            borderRadius: portrait ? 54 : 36,
            border: "2px solid #E6E0D5",
            backgroundColor: "#FFFFFF",
          }}
        >
          {type === "badge" ? (
            <div
              style={{
                display: "flex",
                width: portrait ? 168 : 126,
                height: portrait ? 168 : 126,
                minWidth: portrait ? 168 : 126,
                borderRadius: portrait ? 50 : 38,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${accent}18`,
                border: `3px solid ${accent}55`,
                marginRight: portrait ? 0 : 50,
                marginBottom: portrait ? 48 : 0,
                color: accent,
                fontFamily: "Space Grotesk",
                fontWeight: 700,
                fontSize: portrait ? 62 : 46,
              }}
            >
              {badgeMonogram(badgeName)}
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
            <div
              style={{
                display: "flex",
                color: accent,
                fontSize: portrait ? 28 : 20,
                fontWeight: 700,
                letterSpacing: portrait ? 4 : 3,
                marginBottom: portrait ? 30 : 18,
              }}
            >
              {eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                color: "#171311",
                fontFamily: "Space Grotesk",
                fontWeight: 700,
                fontSize:
                  type === "rank" ? (portrait ? 190 : 112) : portrait ? 82 : type === "article" ? 58 : 64,
                lineHeight: type === "rank" ? 0.9 : 1.05,
                letterSpacing: type === "rank" ? -10 : -2,
                maxWidth: portrait ? 820 : 760,
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: "flex",
                color: "#5A554D",
                fontSize: portrait ? 31 : 23,
                lineHeight: 1.4,
                marginTop: portrait ? 28 : 18,
                maxWidth: portrait ? 790 : 720,
              }}
            >
              {detail}
            </div>
            {type === "rank" ? (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  color: "#C24E0D",
                  backgroundColor: "#FFE6CF",
                  borderRadius: 999,
                  padding: portrait ? "22px 34px" : "14px 24px",
                  marginTop: portrait ? 54 : 28,
                  fontSize: portrait ? 40 : 27,
                  fontWeight: 700,
                }}
              >
                Can you beat me?
              </div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            alignItems: portrait ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: portrait ? 20 : 44,
            borderTop: "2px solid #E6E0D5",
            paddingTop: portrait ? 34 : 22,
          }}
        >
          <div
            style={{
              display: "flex",
              maxWidth: portrait ? 820 : 850,
              color: "#5A554D",
              fontSize: portrait ? 25 : 18,
              lineHeight: 1.45,
            }}
          >
            {type === "article" ? "Practical guides for building habits that stick." : CARD_PITCH}
          </div>
          <div
            style={{
              display: "flex",
              color: "#F26B1F",
              fontSize: portrait ? 26 : 19,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {type === "article" ? "lagan.health/blog" : "lagan.health"}
          </div>
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: "Space Grotesk", data: fontDisplay, weight: 700, style: "normal" },
        { name: "Manrope", data: fontBody, weight: 400, style: "normal" },
        { name: "Manrope", data: fontBody, weight: 700, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
