import { expect, test, type Page } from '@playwright/test';
import { createRoom, newPlayerPage, waitForBoard } from './helpers';

/** Starts a solo game against one bot, with auctions off to keep flows short. */
async function soloGame(page: Page) {
  await createRoom(page, 'Ada');
  await page.getByRole('button', { name: 'Auctions' }).click();
  await expect(page.getByRole('button', { name: 'Auctions' })).toHaveAttribute('data-on', 'false');
  await page.getByRole('button', { name: '+ Fill a seat' }).click();
  await expect(page.locator('.seat')).toHaveCount(2);
  await page.getByRole('button', { name: 'Start the game' }).click();
  await waitForBoard(page);
}

/**
 * Rolls until the turn reaches its settled state, clearing buy prompts and
 * re-rolling on doubles.
 */
async function rollAndSettle(page: Page) {
  const endTurn = page.getByRole('button', { name: /End turn/ });
  for (let attempt = 0; attempt < 6; attempt++) {
    const roll = page.getByRole('button', { name: /Roll the dice|Roll again/ });
    await expect(roll.or(endTurn).first()).toBeVisible({ timeout: 30_000 });
    if (await roll.isVisible()) await roll.click();

    // The board plays the throw and the walk before any prompt appears, so
    // wait for whichever lands first rather than for a fixed beat.
    const prompt = page.locator('.modal .btn').first();
    await Promise.race([
      prompt.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined),
      endTurn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined),
    ]);
    await page.waitForTimeout(250);
    const pass = page.locator('.modal .btn', { hasText: /^Pass$/ });
    if (await pass.isVisible()) await pass.click();
    if (await endTurn.isVisible()) return;
  }
  throw new Error('turn never settled');
}

test.describe('playing a turn', () => {
  test('a finished turn passes on by itself, with a visible countdown', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await soloGame(page);
    await rollAndSettle(page);

    const endTurn = page.getByRole('button', { name: /End turn/ });
    await expect(endTurn).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.countdown')).toBeVisible();

    // No click: the turn should hand over on its own.
    await expect(endTurn).toBeHidden({ timeout: 15_000 });
    await ctx.close();
  });

  test('"Stay" holds the turn open', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await soloGame(page);
    await rollAndSettle(page);

    const endTurn = page.getByRole('button', { name: /End turn/ });
    await expect(endTurn).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Stay' }).click();
    await expect(page.locator('.countdown')).toHaveCount(0);

    await page.waitForTimeout(9000);
    await expect(endTurn).toBeVisible();
    await ctx.close();
  });

  test('an open dialog holds the countdown', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await soloGame(page);
    await rollAndSettle(page);

    await expect(page.getByRole('button', { name: /End turn/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.locator('.manage-list, .empty')).toBeVisible();

    await page.waitForTimeout(8000);
    await expect(page.locator('.modal h3', { hasText: 'Your properties' })).toBeVisible();
    await ctx.close();
  });

  test('R rolls the dice from the keyboard', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await soloGame(page);

    await expect(page.getByRole('button', { name: /Roll the dice/ })).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('r');
    await expect(page.locator('.log-line', { hasText: /Ada rolled/ })).toBeVisible({ timeout: 10_000 });
    await ctx.close();
  });

  test('camera controls stay stable', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await soloGame(page);

    for (const title of ['Zoom in', 'Zoom in', 'Zoom out', 'Reset the view']) {
      await page.getByTitle(title).click();
      await page.waitForTimeout(120);
    }
    await expect(page.locator('canvas')).toBeVisible();
    await ctx.close();
  });

  test('the board and controls fit a phone screen', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await newPlayerPage(ctx);
    await soloGame(page);
    await page.waitForTimeout(1500);

    await expect(page.locator('.action-pill')).toBeInViewport();
    await expect(page.locator('.rail .pcard').first()).toBeInViewport();

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);

    // The log panel can be folded away to give the board room.
    await page.getByLabel('Collapse panel').click();
    await expect(page.locator('.side .panel-body')).toBeHidden();
    await ctx.close();
  });
});
