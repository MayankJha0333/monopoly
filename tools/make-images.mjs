// Regenerates the share image and app icons from tools/share-card.html and
// client/public/favicon.svg. Run after changing the brand:
//   node tools/make-images.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : { channel: 'chrome' },
);

const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.goto(`file://${root}tools/share-card.html`);
await card.waitForTimeout(2000); // let the web fonts land
await card.screenshot({ path: `${root}client/public/og.png` });

for (const size of [180, 192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(`file://${root}client/public/favicon.svg`);
  await page.screenshot({ path: `${root}client/public/icon-${size}.png`, omitBackground: true });
  await page.close();
}

await browser.close();
console.log('wrote client/public/og.png and icon-180/192/512.png');
