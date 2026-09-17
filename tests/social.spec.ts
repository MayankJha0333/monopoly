import { expect, test } from '@playwright/test';
import { createRoom, joinRoom, newPlayerPage, waitForBoard } from './helpers';

/** Makes the page look like a background tab with notifications allowed. */
const backgroundTab = `
  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
  Object.defineProperty(document, 'hidden', { get: () => true });
  window.__notes = [];
  class FakeNotification {
    static permission = 'granted';
    static requestPermission() { return Promise.resolve('granted'); }
    constructor(title, opts) { window.__notes.push({ title, body: opts && opts.body, tag: opts && opts.tag }); }
    close() {}
  }
  window.Notification = FakeNotification;
  localStorage.setItem('rentrush.notify', '1');
`;

test.describe('chat, typing and voice', () => {
  test('typing shows up for the other player, and messages arrive', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await newPlayerPage(hostCtx);
    const guest = await newPlayerPage(guestCtx);

    const code = await createRoom(host, 'Ana');
    await joinRoom(guest, 'Bo', code);
    await guest.getByRole('button', { name: "I'm ready" }).click();
    await host.getByRole('button', { name: 'Start the game' }).click();
    await waitForBoard(host);
    await waitForBoard(guest);

    await host.getByRole('button', { name: 'Chat' }).first().click();
    await guest.getByRole('button', { name: 'Chat' }).first().click();

    // Ana starts typing; Bo sees it.
    await host.locator('.chat-form input').fill('hey');
    await expect(guest.locator('.typing-line')).toContainText('Ana is typing', { timeout: 5000 });

    // Ana sends it; Bo sees the message and the typing line clears.
    await host.locator('.chat-form input').press('Enter');
    await expect(guest.locator('.chat-msg')).toContainText('hey');
    await expect(guest.locator('.typing-line')).toHaveText('', { timeout: 8000 });

    // Nothing is echoed back to the person typing.
    await guest.locator('.chat-form input').fill('hello');
    await expect(host.locator('.typing-line')).toContainText('Bo is typing');
    await expect(guest.locator('.typing-line')).toHaveText('');

    await hostCtx.close();
    await guestCtx.close();
  });

  test('a player on another tab is notified about chat and their turn', async ({ browser }) => {
    const hostCtx = await browser.newContext();
    const guestCtx = await browser.newContext();
    const host = await newPlayerPage(hostCtx);
    const guest = await newPlayerPage(guestCtx);
    await guest.addInitScript(backgroundTab);

    const code = await createRoom(host, 'Ana');
    await joinRoom(guest, 'Bo', code);
    await guest.getByRole('button', { name: "I'm ready" }).click();
    await host.getByRole('button', { name: 'Start the game' }).click();
    await waitForBoard(host);
    await waitForBoard(guest);

    await host.getByRole('button', { name: 'Chat' }).first().click();
    await host.locator('.chat-form input').fill('are you there?');
    await host.locator('.chat-form input').press('Enter');

    const notes = async () => guest.evaluate(() => (window as unknown as { __notes: { title: string; body?: string; tag?: string }[] }).__notes);
    await expect.poll(notes, { timeout: 10_000 }).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: 'chat', body: 'are you there?' })]),
    );
    // The game starting is worth an interruption too.
    expect(await notes()).toEqual(expect.arrayContaining([expect.objectContaining({ tag: 'start' })]));

    await hostCtx.close();
    await guestCtx.close();
  });

  test('friends tables offer voice chat, and a failed call does not break the page', async ({ browser }) => {
    const ctx = await browser.newContext();
    const host = await newPlayerPage(ctx);
    await createRoom(host, 'Ana');

    const bar = host.locator('.lb-voice-card');
    await expect(bar).toContainText('Voice chat');
    await expect(bar.getByRole('button', { name: 'Join call' })).toBeVisible();

    // The test LiveKit address goes nowhere: the game should say so and carry on.
    await bar.getByRole('button', { name: 'Join call' }).click();
    await expect(host.locator('.vc-error')).toBeVisible({ timeout: 25_000 });
    await expect(host.locator('.lb-seats .seat').first()).toBeVisible();
    await expect(host.getByRole('button', { name: /Start the game|Waiting for players/ })).toBeVisible();

    await ctx.close();
  });

  test('quick play has no voice chat', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await page.goto('/');
    await page.getByLabel('Nickname').fill('Solo');
    await page.getByRole('button', { name: /PLAY/ }).first().click();
    await waitForBoard(page);
    await expect(page.locator('.vc-bar')).toHaveCount(0);
    await ctx.close();
  });
});
