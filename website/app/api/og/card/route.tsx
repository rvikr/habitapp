import { ImageResponse } from "next/og";
import { getBadgeShareMessage, getRankShareMessage } from "@/lib/share-messages";
import fs from "fs";
import path from "path";

type Tone = "yellow" | "orange" | "purple" | "teal" | "indigo" | "red";

// Ember & Midnight brand gradients — aligned with the achievements TONE_MAP
// (purple → read accent, indigo → meditate accent, teal → secondary green).
const TONE_GRADIENT: Record<Tone, [string, string]> = {
  yellow: ["#E5A84A", "#FFC56B"],
  orange: ["#F26B1F", "#FFC56B"],
  purple: ["#9A7BD8", "#C7A7FF"],
  teal:   ["#3EBB7F", "#8BE0B8"],
  indigo: ["#5E8FD8", "#8EC5FF"],
  red:    ["#FF5A5A", "#FF9999"],
};

function rankAccent(pct: number): [string, string] {
  if (pct <= 1)  return TONE_GRADIENT.orange;
  if (pct <= 5)  return TONE_GRADIENT.yellow;
  if (pct <= 10) return TONE_GRADIENT.teal;
  return TONE_GRADIENT.indigo;
}

const fontsDir = path.join(process.cwd(), "public", "fonts");
const fontDisplay = fs.readFileSync(path.join(fontsDir, "SpaceGrotesk-Bold.ttf"));
const fontBody    = fs.readFileSync(path.join(fontsDir, "Manrope-Regular.ttf"));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const type    = searchParams.get("type") ?? "badge";
  const ratio   = searchParams.get("ratio") === "portrait" ? "portrait" : "wide";
  const width   = ratio === "portrait" ? 1080 : 1200;
  const height  = ratio === "portrait" ? 1350 : 630;

  const taglineSz  = ratio === "portrait" ? 80  : 64;
  const subtitleSz = ratio === "portrait" ? 32  : 28;
  const attrSz     = ratio === "portrait" ? 20  : 18;
  const padX       = ratio === "portrait" ? 100 : 100;
  const padY       = ratio === "portrait" ? 120 : 80;

  let tagline: string;
  let subtitle: string;
  let accent: [string, string];

  if (type === "article") {
    // Blog post share card: title + optional subtitle, brand-orange accent.
    tagline = (searchParams.get("title") ?? "Lagan Blog").slice(0, 120);
    subtitle = (searchParams.get("subtitle") ?? "Guides from lagan.health/blog").slice(0, 160);
    accent = TONE_GRADIENT.orange;
  } else if (type === "rank") {
    const rank   = parseInt(searchParams.get("rank")   ?? "1",  10);
    const streak = parseInt(searchParams.get("streak") ?? "0",  10);
    const pct    = parseInt(searchParams.get("pct")    ?? "50", 10);
    const msg = getRankShareMessage({ rank, streak, topPct: pct });
    tagline  = msg.tagline;
    subtitle = msg.subtitle;
    accent   = rankAccent(pct);
  } else {
    const id      = searchParams.get("id")   ?? "";
    const name    = searchParams.get("name") ?? "Badge";
    const tone    = (searchParams.get("tone") ?? "indigo") as Tone;
    const msg = getBadgeShareMessage(id, name);
    tagline  = msg.tagline;
    subtitle = msg.subtitle;
    accent   = TONE_GRADIENT[tone] ?? TONE_GRADIENT.indigo;
  }

  const markTile = ratio === "portrait" ? 16 : 14;
  const markGap = 3;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#0B0B0E",
          backgroundImage: `radial-gradient(circle at 0% 0%, ${accent[0]}26, transparent 55%)`,
          position: "relative",
          flexDirection: "column",
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: `linear-gradient(to right, ${accent[0]}, ${accent[1]})`,
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: `${padY}px ${padX}px`,
            gap: 20,
          }}
        >
          <div
            style={{
              fontSize: taglineSz,
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1.1,
              letterSpacing: -2,
              fontFamily: "Space Grotesk",
              maxWidth: ratio === "portrait" ? 800 : 900,
            }}
          >
            {tagline}
          </div>
          <div
            style={{
              fontSize: subtitleSz,
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              fontFamily: "Manrope",
            }}
          >
            {subtitle}
          </div>
        </div>

        {/* Brand mark */}
        <div
          style={{
            position: "absolute",
            bottom: 36,
            left: padX,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              width: markTile * 2 + markGap,
              height: markTile * 2 + markGap,
              gap: markGap,
            }}
          >
            <div style={{ width: markTile, height: markTile, borderRadius: 4, backgroundColor: "#F26B1F" }} />
            <div style={{ width: markTile, height: markTile, borderRadius: 4, backgroundColor: "#FFC56B", opacity: 0.75 }} />
            <div style={{ width: markTile, height: markTile, borderRadius: 4, backgroundColor: "#FFC56B", opacity: 0.5 }} />
            <div style={{ width: markTile, height: markTile, borderRadius: 4, backgroundColor: "#F26B1F", opacity: 0.8 }} />
          </div>
          <div
            style={{
              fontSize: attrSz + 6,
              color: "rgba(255,255,255,0.85)",
              fontWeight: 700,
              fontFamily: "Space Grotesk",
              letterSpacing: -0.5,
            }}
          >
            Lagan
          </div>
        </div>

        {/* Attribution */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            right: 60,
            fontSize: attrSz,
            color: "rgba(255,255,255,0.3)",
            fontWeight: 400,
            fontFamily: "Manrope",
          }}
        >
          lagan.health
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: "Space Grotesk", data: fontDisplay, weight: 700, style: "normal" },
        { name: "Manrope",       data: fontBody,    weight: 400, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
