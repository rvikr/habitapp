import sharp from "sharp";
import { copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Chain-L mark — mirrored from components/logo-chain-l.tsx
function chainLMark(primaryColor = "#F26B1F", accentColor = "#C24E0D") {
  return `
    <rect x="18" y="10" width="32" height="56" rx="16" stroke="${primaryColor}" stroke-width="8" fill="none"/>
    <rect x="34" y="42" width="56" height="32" rx="16" stroke="${accentColor}" stroke-width="8" fill="none"/>
    <path d="M42 50 L42 66" stroke="${primaryColor}" stroke-width="8" stroke-linecap="round"/>`;
}

function makeSvg({ width, height, bgColor = null, logoSize, primaryColor, accentColor }) {
  const offsetX = Math.round((width - logoSize) / 2);
  const offsetY = Math.round((height - logoSize) / 2);
  const bg = bgColor ? `<rect width="${width}" height="${height}" fill="${bgColor}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  ${bg}
  <svg x="${offsetX}" y="${offsetY}" width="${logoSize}" height="${logoSize}" viewBox="0 0 100 100" fill="none">
    ${chainLMark(primaryColor, accentColor)}
  </svg>
</svg>`;
}

async function gen(svgString, outPath) {
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log(`Generated: ${outPath.replace(ROOT, "")}`);
}

const PURPLE = "#451ebb";
const ORANGE = "#F26B1F";
const DARK_ORANGE = "#C24E0D";
const WHITE = "#ffffff";

const assets = [
  // iOS app icon — logo on brand bg
  {
    file: "assets/icon.png",
    svg: makeSvg({ width: 1024, height: 1024, bgColor: PURPLE, logoSize: 640, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
  // Android adaptive icon foreground — transparent bg, logo in safe zone center
  {
    file: "assets/adaptive-icon.png",
    svg: makeSvg({ width: 1024, height: 1024, bgColor: null, logoSize: 512, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
  // Splash screen
  {
    file: "assets/splash.png",
    svg: makeSvg({ width: 1284, height: 2778, bgColor: PURPLE, logoSize: 400, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
  // Favicon
  {
    file: "assets/favicon.png",
    svg: makeSvg({ width: 64, height: 64, bgColor: PURPLE, logoSize: 52, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
  // Android notification icon — white monochrome on transparent
  {
    file: "assets/notification-icon.png",
    svg: makeSvg({ width: 96, height: 96, bgColor: null, logoSize: 80, primaryColor: WHITE, accentColor: WHITE }),
  },
  // OG / social sharing image
  {
    file: "assets/og-image.png",
    svg: makeSvg({ width: 1200, height: 630, bgColor: PURPLE, logoSize: 380, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
  // PWA icons
  {
    file: "public/icon-192.png",
    svg: makeSvg({ width: 192, height: 192, bgColor: PURPLE, logoSize: 130, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
  {
    file: "public/icon-512.png",
    svg: makeSvg({ width: 512, height: 512, bgColor: PURPLE, logoSize: 340, primaryColor: ORANGE, accentColor: DARK_ORANGE }),
  },
];

for (const { file, svg } of assets) {
  await gen(svg, join(ROOT, file));
}

// public copies share the same file as assets
copyFileSync(join(ROOT, "assets/favicon.png"), join(ROOT, "public/favicon.png"));
console.log("Generated: /public/favicon.png (copy)");

copyFileSync(join(ROOT, "assets/og-image.png"), join(ROOT, "public/og-image.png"));
console.log("Generated: /public/og-image.png (copy)");

console.log("\nDone. All 10 assets written.");
