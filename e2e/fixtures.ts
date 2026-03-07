import { test as base, expect, type Page } from '@playwright/test';

// ─── Test data (matches demo-sp seed users) ─────────────────────────────

export const ALICE = {
  id: 'alice',
  name: 'Alice',
  email: 'alice@example.com',
  apiKey: 'demo-alice-key',
} as const;

export const BOB = {
  id: 'bob',
  name: 'Bob',
  email: 'bob@example.com',
  apiKey: 'demo-bob-key',
} as const;

export const PROFILE_IDS = [
  'github.com/humanagencyprotocol/hap-profiles/deploy-gate@0.3',
  'github.com/humanagencyprotocol/hap-profiles/payment-gate@0.3',
  'github.com/humanagencyprotocol/hap-profiles/comms-send@0.3',
] as const;

// ─── Login helper ────────────────────────────────────────────────────────

/**
 * Logs in and handles onboarding if needed.
 * After login, if the user has no groups, the AuthGuard redirects to /onboarding.
 * We handle this by selecting "Single Domain" mode to bypass onboarding.
 */
export async function loginAsAlice(page: Page) {
  await loginAs(page, ALICE.apiKey);
}

export async function loginAs(page: Page, apiKey: string) {
  await page.goto('/login');
  await page.getByPlaceholder('hap_sk_...').fill(apiKey);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15_000 });

  // Handle onboarding redirect — if user has no groups, AuthGuard sends to /onboarding
  if (page.url().includes('/onboarding')) {
    // Click "Single Domain" card to bypass onboarding
    await page.getByText('Single Domain').click();
    await page.waitForURL(url => !url.pathname.includes('/onboarding'), { timeout: 5_000 });
  }
}

export const test = base;
export { expect };
