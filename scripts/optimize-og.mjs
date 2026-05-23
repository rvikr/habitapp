import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const targets = ["public/og-image.png", "website/public/og-image.png"];

const root = process.cwd();
const source = path.join(root, "public/og-image.png");
const buf = await fs.readFile(source);

const pngOptimized = await sharp(buf)
  .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
  .toBuffer();

const jpgOptimized = await sharp(buf)
  .flatten({ background: "#1a0e08" })
  .jpeg({ quality: 88, mozjpeg: true, progressive: true })
  .toBuffer();

console.log(`source PNG:    ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`optimized PNG: ${(pngOptimized.length / 1024).toFixed(1)} KB`);
console.log(`optimized JPG: ${(jpgOptimized.length / 1024).toFixed(1)} KB`);

const pickPng = pngOptimized.length < 250 * 1024;
const chosen = pickPng ? pngOptimized : jpgOptimized;
const ext = pickPng ? "png" : "jpg";

for (const rel of targets) {
  const dest = path.join(root, rel.replace(/\.png$/, `.${ext}`));
  await fs.writeFile(dest, chosen);
  console.log(`wrote ${dest} (${(chosen.length / 1024).toFixed(1)} KB)`);
}

console.log(`\nformat chosen: ${ext.toUpperCase()}`);
