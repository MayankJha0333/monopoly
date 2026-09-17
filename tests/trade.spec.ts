import { expect, test, type Page } from '@playwright/test';
import { createRoom, joinRoom, newPlayerPage, waitForBoard } from './helpers';

/** Plays turns for whoever is up until `owner` holds at least `count` properties. */
async function playUntilOwned(pages: Page[], owner: Page, count: number) {
  for (let step = 0; step < 90; step++) {
    const chips = await owner.locator('.pcard[data-me="true"] .chip').count();
    if (chips >= count) return;

    for (const page of pages) {
      const click = async (locator: ReturnType<Page['locator']>) => {
        try { await locator.first().click({ timeout: 1000 }); return true; } catch { return false; }
      };
      if (await click(page.locator('.modal .btn', { hasText: 'Buy for' }))) continue;
      if (await click(page.locator('.modal .btn', { hasText: 'Pass' }))) continue;
      await click(page.getByRole('button', { name: /Roll the dice|Roll again/ }));
    }
    // The board plays the throw and the walk before the next prompt lands.
    await pages[0]!.waitForTimeout(1400);
  }
  throw new Error('nobody accumulated property in time');
}

test('a trade offer names its properties and moves them when accepted', async ({ browser }) => {
  // Each turn now plays a dice throw and a walk, so the run-up takes a while.
  test.slow();
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await newPlayerPage(hostCtx, '2d');
  const guest = await newPlayerPage(guestCtx, '2d');

  const code = await createRoom(host, 'Ada');
  await joinRoom(guest, 'Bob', code);
  await guest.getByRole('button', { name: "I'm ready" }).click();
  await host.getByRole('button', { name: 'Start the game' }).click();
  await waitForBoard(host);
  await waitForBoard(guest);

  await playUntilOwned([host, guest], host, 1);

  // Host offers a property; the picker mirrors the selection on the board.
  await host.getByRole('button', { name: 'Trade', exact: true }).first().click();
  const firstProperty = host.locator('.trade-col').first().locator('.prop-item').first();
  const propertyName = (await firstProperty.locator('.nm').textContent())!.trim();
  await firstProperty.click();
  await expect(firstProperty).toHaveAttribute('data-on', 'true');

  await host.locator('.trade-col').nth(1).locator('input[type="number"]').first().fill('120');
  await host.getByRole('button', { name: 'Send offer' }).click();

  // The recipient is pulled to the Trades tab with the offer spelled out.
  await expect(guest.locator('.tab[data-on="true"]')).toContainText('Trades');
  const offer = guest.locator('.offer').first();
  await expect(offer).toContainText(propertyName);
  await expect(offer).toContainText('$120');

  const guestChipsBefore = await guest.locator('.pcard[data-me="true"] .chip').count();
  await offer.getByRole('button', { name: 'Accept' }).click();

  await expect(guest.locator('.pcard[data-me="true"] .chip')).toHaveCount(guestChipsBefore + 1);
  // With no offers left the panel falls back to the log on its own.
  await expect(guest.locator('.tab[data-on="true"]')).toContainText('Log');
  await expect(guest.locator('.log-line', { hasText: 'agreed a trade' })).toBeVisible();

  await hostCtx.close();
  await guestCtx.close();
});

test('a trade cannot be sent empty and can be withdrawn', async ({ browser }) => {
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const host = await newPlayerPage(hostCtx, '2d');
  const guest = await newPlayerPage(guestCtx, '2d');

  const code = await createRoom(host, 'Ada');
  await joinRoom(guest, 'Bob', code);
  await guest.getByRole('button', { name: "I'm ready" }).click();
  await host.getByRole('button', { name: 'Start the game' }).click();
  await waitForBoard(host);

  await host.getByRole('button', { name: 'Trade', exact: true }).first().click();
  await expect(host.getByRole('button', { name: 'Send offer' })).toBeDisabled();

  await host.locator('.trade-col').first().locator('input[type="number"]').first().fill('50');
  await host.getByRole('button', { name: 'Send offer' }).click();

  await expect(guest.locator('.offer')).toContainText('$50');
  await host.getByRole('button', { name: 'Withdraw' }).click();
  await expect(guest.locator('.offer')).toHaveCount(0);

  await hostCtx.close();
  await guestCtx.close();
});
