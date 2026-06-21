const sharp = require('sharp');
const { Buffer } = require('buffer');

const groups = {
  auth: [
    'first-run-auth-login.png',
    'first-run-auth-forgot-password.png',
    'first-run-auth-forgot-password-required.png',
    'first-run-auth-forgot-password-invalid.png',
    'first-run-auth-forgot-password-success.png',
    'first-run-auth-signup.png',
    'first-run-auth-signup-validation.png',
    'first-run-auth-hindi-required-validation.png',
    'first-run-auth-hindi-password-validation.png',
    'first-run-auth-hindi-signup-success.png',
  ],
  mobile: [
    'first-run-smoke-wizard-review-current.png',
    'first-run-smoke-wizard-created-current.png',
    'first-run-post-confirm.png',
    'first-run-post-after-begin.png',
    'first-run-post-after-complete.png',
    'first-run-manual-dashboard-empty.png',
    'first-run-manual-catalog.png',
    'first-run-manual-form.png',
    'first-run-manual-dashboard-created.png',
    'first-run-detail-dashboard.png',
    'first-run-detail-detail-before-log.png',
    'first-run-detail-detail-after-log.png',
  ],
  desktop: [
    'first-run-desktop-login.png',
    'first-run-desktop-signup.png',
    'first-run-desktop-dashboard-empty.png',
    'first-run-desktop-catalog.png',
    'first-run-desktop-form.png',
    'first-run-desktop-dashboard-created.png',
  ],
};

function escapeXml(value) {
  return value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

async function panelFor(file, cellW, labelH) {
  const path = `tmp/${file}`;
  const meta = await sharp(path).metadata();
  const height = Math.round(((meta.height || cellW) / (meta.width || cellW)) * cellW);
  const image = await sharp(path).resize({ width: cellW }).png().toBuffer();
  const labelText = escapeXml(file.replace('first-run-', '').replace('.png', ''));
  const label = await sharp(Buffer.from(`
    <svg width="${cellW}" height="${labelH}">
      <rect width="100%" height="100%" fill="#111"/>
      <text x="8" y="22" font-size="13" fill="#fff" font-family="Arial">${labelText}</text>
    </svg>
  `)).png().toBuffer();
  const panel = await sharp({
    create: { width: cellW, height: labelH + height, channels: 4, background: '#222' },
  })
    .composite([
      { input: label, left: 0, top: 0 },
      { input: image, left: 0, top: labelH },
    ])
    .png()
    .toBuffer();
  return { input: panel, width: cellW, height: labelH + height };
}

async function makeSheet(name, files) {
  const cellW = name === 'desktop' ? 360 : 220;
  const cols = name === 'desktop' ? 2 : 3;
  const labelH = 34;
  const pad = 12;
  const panels = [];
  for (const file of files) panels.push(await panelFor(file, cellW, labelH));
  const rows = Math.ceil(panels.length / cols);
  const rowHeights = [];
  for (let row = 0; row < rows; row += 1) {
    rowHeights[row] = Math.max(...panels.slice(row * cols, row * cols + cols).map(panel => panel.height));
  }
  const width = cols * cellW + (cols + 1) * pad;
  const height = rowHeights.reduce((sum, rowH) => sum + rowH, 0) + (rows + 1) * pad;
  const composite = [];
  let top = pad;
  for (let row = 0; row < rows; row += 1) {
    let left = pad;
    for (let col = 0; col < cols; col += 1) {
      const panel = panels[row * cols + col];
      if (panel) composite.push({ input: panel.input, left, top });
      left += cellW + pad;
    }
    top += rowHeights[row] + pad;
  }
  const out = `tmp/first-run-review-${name}.png`;
  await sharp({ create: { width, height, channels: 4, background: '#0b0b0b' } })
    .composite(composite)
    .png()
    .toFile(out);
  console.log(`${out} ${width}x${height}`);
}

(async () => {
  for (const [name, files] of Object.entries(groups)) await makeSheet(name, files);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
