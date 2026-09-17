import { expect, test } from '@playwright/test';
import { newPlayerPage, waitForBoard } from './helpers';

test.describe('quick play and accounts', () => {
  test('Play finds a full table and starts it', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    await page.goto('/');
    await page.getByLabel('Nickname').fill('Quinn');
    await page.getByRole('button', { name: /PLAY/ }).click();

    await expect(page.getByRole('heading', { name: /Finding players|Starting in/ })).toBeVisible();
    await expect(page.locator('.sp-seat[data-me]')).toContainText('Quinn');
    await waitForBoard(page);
    await expect(page.locator('.pcard')).toHaveCount(4);
    // Every seat reads as a player; nothing is labelled as a computer.
    await expect(page.locator('.rail')).not.toContainText(/\bbot\b/i);
    await ctx.close();
  });

  test('a guest can sign up, log out and log back in', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await newPlayerPage(ctx);
    const name = `tester${Date.now() % 100000}`;
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign up' }).click();
    await page.getByLabel('Username').fill(name);
    await page.getByLabel('Email').fill(`${name}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.sp-err')).toContainText(['Use at least 8 characters.']);

    await page.getByLabel('Password', { exact: true }).fill('sunny2026');
    await page.getByLabel('Confirm password').fill('sunny2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('.sp-me')).toContainText(name);

    await page.locator('.sp-me').click();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();

    await page.getByRole('button', { name: 'Log in' }).first().click();
    await page.getByLabel('Username or email').fill(name);
    await page.getByLabel('Password', { exact: true }).fill('wrong-pass-1');
    await page.locator('.sp-dialog').getByRole('button', { name: 'Log in', exact: true }).last().click();
    await expect(page.locator('.sp-banner')).toContainText('not right');

    await page.getByLabel('Password', { exact: true }).fill('sunny2026');
    await page.locator('form').getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.sp-me')).toContainText(name);
    await ctx.close();
  });
});
