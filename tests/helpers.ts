import type { BrowserContext, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Sets a nickname on the home screen. */
export async function setNickname(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Nickname').fill(name);
}

/** Creates a private table from the home screen, returning its code. */
export async function createRoom(page: Page, name: string): Promise<string> {
  await setNickname(page, name);
  await page.getByRole('button', { name: 'Play with friends' }).click();
  await page.getByRole('button', { name: 'Create table' }).click();
  const code = page.locator('.code-badge .code');
  await expect(code).toBeVisible();
  return (await code.textContent())!.trim();
}

/** Joins an existing table by code from a fresh page. */
export async function joinRoom(page: Page, name: string, code: string) {
  await setNickname(page, name);
  await page.getByRole('button', { name: 'Play with friends' }).click();
  await page.getByLabel('Table code').fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  // Match the seat's name exactly: character names like "Turbo" contain other
  // players' names, and a loose match then finds two seats.
  await expect(page.locator('.lb-seat .nm', { hasText: new RegExp(`^${name}$`) })).toBeVisible();
}

export async function newPlayerPage(context: BrowserContext, view: '3d' | '2d' = '2d'): Promise<Page> {
  const page = await context.newPage();
  // Tests run on software WebGL, which is slow, so rule and flow tests use the
  // 2D board; the tests about the 3D view ask for it explicitly.
  await page.addInitScript((v) => {
    localStorage.setItem('rentrush.prefs', JSON.stringify({ view: v, quality: 'low' }));
    // Most tests read the log, so start with the side panel open.
    if (!localStorage.getItem('rentrush.panel')) localStorage.setItem('rentrush.panel', 'open');
  }, view);
  page.on('pageerror', (e) => { throw new Error(`page error: ${e.message}`); });
  return page;
}

/** Waits until the table (3D or 2D) and the HUD are up. */
export async function waitForBoard(page: Page) {
  await expect(page.locator('.game canvas').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.action-pill')).toBeVisible();
}

/** Clicks whatever action is available, to push the game forward one step. */
export async function advanceTurn(page: Page) {
  const buy = page.locator('.modal .btn', { hasText: 'Buy for' });
  if (await buy.count()) { await buy.first().click(); return 'buy'; }
  const roll = page.locator('.action-pill .btn', { hasText: /Roll/ });
  if (await roll.count()) { await roll.first().click(); return 'roll'; }
  const end = page.locator('.action-pill .btn', { hasText: 'End turn' });
  if (await end.count()) { await end.first().click(); return 'end'; }
  return 'none';
}
