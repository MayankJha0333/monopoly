import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, newPlayerPage, waitForBoard } from './helpers';

test.describe('lobby and rooms', () => {
  test('home screen refuses a one-letter nickname', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'RENT RUSH' })).toBeVisible();
    await page.getByLabel('Nickname').fill('A');
    await page.getByRole('button', { name: /PLAY/ }).click();
    await expect(page.locator('.toast')).toContainText('at least two characters');
  });

  test('a bad table code is rejected', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nickname').fill('Ada');
    await page.getByRole('button', { name: 'Play with friends' }).click();
    await page.getByLabel('Table code').fill('ZZZZZ');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.locator('.toast')).toContainText('No table with that code');
  });

  test('host creates a room and a second player joins by code', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await newPlayerPage(hostCtx);
    const guest = await newPlayerPage(guestCtx);

    const code = await createRoom(host, 'Ada');
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    await joinRoom(guest, 'Bob', code);
    await expect(host.locator('.seat', { hasText: 'Bob' })).toBeVisible();
    await expect(host.locator('.seat', { hasText: 'Ada' })).toContainText('Host');

    await hostCtx.close();
    await guestCtx.close();
  });

  test('only the host can change house rules', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await newPlayerPage(hostCtx);
    const guest = await newPlayerPage(guestCtx);

    const code = await createRoom(host, 'Ada');
    await joinRoom(guest, 'Bob', code);

    await expect(guest.getByRole('button', { name: 'Auctions' })).toBeDisabled();
    await expect(host.getByRole('button', { name: 'Auctions' })).toBeEnabled();

    await host.getByRole('button', { name: 'Beach Break pot' }).click();
    await expect(guest.getByRole('button', { name: 'Beach Break pot' })).toHaveAttribute('data-on', 'true');

    await hostCtx.close();
    await guestCtx.close();
  });

  test('the game starts once everyone is ready and reaches the board', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await newPlayerPage(hostCtx);
    const guest = await newPlayerPage(guestCtx);

    const code = await createRoom(host, 'Ada');
    await joinRoom(guest, 'Bob', code);

    await expect(host.getByRole('button', { name: /Waiting for everyone/ })).toBeVisible();
    await guest.getByRole('button', { name: "I'm ready" }).click();
    await host.getByRole('button', { name: 'Start the game' }).click();

    await waitForBoard(host);
    await waitForBoard(guest);
    await expect(host.locator('.pcard')).toHaveCount(2);

    await hostCtx.close();
    await guestCtx.close();
  });

  test('a reload puts you back in your seat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const host = await newPlayerPage(ctx);
    const code = await createRoom(host, 'Ada');

    await host.reload();
    await expect(host.locator('.code-badge .code')).toHaveText(code);
    await ctx.close();
  });
});
