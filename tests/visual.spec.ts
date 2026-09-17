import { expect, test, type Page } from '@playwright/test';
import { createRoom, newPlayerPage, waitForBoard } from './helpers';

const OUT = 'shots';

/** Clicks only if the control is still there — prompts can resolve mid-check. */
async function tryClick(page: Page, locator: ReturnType<Page['locator']>) {
  try {
    await locator.first().click({ timeout: 1200 });
    return true;
  } catch {
    return false;
  }
}

/** Drives turns for a solo game so the board has something to look at. */
async function playRounds(page: Page, seconds: number) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (await tryClick(page, page.locator('.modal .btn', { hasText: 'Buy for' }))) continue;
    if (await tryClick(page, page.locator('.modal .btn', { hasText: 'Pass' }))) continue;
    await tryClick(page, page.getByRole('button', { name: /Roll the dice|Roll again/ }));
    await page.waitForTimeout(400);
  }
}

test('captures the screens', async ({ browser }) => {
  test.slow();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'RENT RUSH' })).toBeVisible();
  await page.getByLabel('Nickname').fill('Ada');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/1-home.png` });

  await page.getByRole('button', { name: 'Play with friends' }).click();
  await page.getByRole('button', { name: 'Create table' }).click();
  await expect(page.locator('.code-badge .code')).toBeVisible();
  await page.getByRole('button', { name: '+ Fill a seat' }).click();
  await page.getByRole('button', { name: '+ Fill a seat' }).click();
  await page.screenshot({ path: `${OUT}/2-lobby.png` });

  await page.getByRole('button', { name: 'Start the game' }).click();
  await waitForBoard(page);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/3-board.png` });

  await playRounds(page, 34);

  // Clear any prompt still on screen before shooting the rest.
  for (let i = 0; i < 8 && await page.locator('.scrim').isVisible().catch(() => false); i++) {
    if (await tryClick(page, page.locator('.modal .btn', { hasText: 'Buy for' }))) continue;
    if (await tryClick(page, page.locator('.modal .btn', { hasText: 'Pass' }))) continue;
    if (await tryClick(page, page.locator('.modal .btn', { hasText: 'Send to auction' }))) continue;
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/4-in-play.png` });

  // Trade picker, with the chosen properties lit up on the board.
  await page.getByRole('button', { name: 'Trade', exact: true }).first().click();
  const picks = page.locator('.trade-col').first().locator('.prop-item');
  const count = Math.min(2, await picks.count());
  for (let i = 0; i < count; i++) await picks.nth(i).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/5-trade.png` });
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Hovering a player card lights up everything they own.
  await page.locator('.pcard').nth(1).hover();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/6-holdings.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/7-mobile.png` });

  await ctx.close();
});
