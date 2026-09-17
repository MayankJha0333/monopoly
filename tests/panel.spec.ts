import { devices, expect, test } from '@playwright/test';
import { createRoom, joinRoom, newPlayerPage, waitForBoard } from './helpers';

/** The chat box must sit at the foot of the panel, with no dead space under it. */
const bottomGap = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const side = document.querySelector('.side')!.getBoundingClientRect();
  const form = document.querySelector('.chat-form')!.getBoundingClientRect();
  return Math.round(side.bottom - form.bottom);
});

test('phone chat panel fills the sheet', async ({ browser }) => {
  test.slow();
  const hostCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const guestCtx = await browser.newContext();
  const host = await newPlayerPage(hostCtx);
  const guest = await newPlayerPage(guestCtx);
  const code = await createRoom(host, 'Ana');
  await joinRoom(guest, 'Bo', code);
  await guest.getByRole('button', { name: "I'm ready" }).click();
  await host.getByRole('button', { name: 'Start the game' }).click();
  await waitForBoard(host);
  await host.getByRole('button', { name: 'Chat' }).first().click();
  await host.waitForTimeout(500);
  await host.screenshot({ path: '/tmp/phone-chat.png' });

  expect(await bottomGap(host)).toBeLessThan(24);

  await hostCtx.close();
  await guestCtx.close();
});

test('the chat box sits at the foot of the panel in a quick match too', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await newPlayerPage(ctx);
  await page.goto('/');
  await page.getByLabel('Nickname').fill('Solo');
  await page.getByRole('button', { name: /PLAY/ }).first().click();
  await waitForBoard(page);
  await page.getByRole('button', { name: 'Chat' }).first().click();
  await page.waitForTimeout(300);
  // No voice bar here, so the tabs are the first row: the body still stretches.
  expect(await bottomGap(page)).toBeLessThan(24);
  await ctx.close();
});
