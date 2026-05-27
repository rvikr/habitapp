const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = 'http://localhost:3000';

  // Landing hero
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/rk/AppData/Local/Temp/fix-hero.png' });
  console.log('hero done');

  // CTA section
  const cta = page.locator('text=Start your streak');
  if (await cta.count()) {
    await cta.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'C:/Users/rk/AppData/Local/Temp/fix-cta.png' });
    console.log('cta done');
  }

  // Mobile view of settings bottom nav issue
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'C:/Users/rk/AppData/Local/Temp/fix-mobile-login.png' });
  console.log('mobile done');

  await browser.close();
  console.log('Done');
})();
