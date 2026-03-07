import { test, expect, loginAsAlice, PROFILE_IDS } from './fixtures';

test.describe('Profiles UI', () => {
  test('login as alice succeeds', async ({ page }) => {
    await loginAsAlice(page);
    expect(page.url()).not.toContain('/login');
    expect(page.url()).not.toContain('/onboarding');
  });

  test('profiles load on /agent/new with URI-based IDs', async ({ page }) => {
    await loginAsAlice(page);

    // Navigate via SPA link (page.goto destroys React auth state)
    await page.getByText('New Agent Authorization').first().click();
    await page.waitForURL('**/agent/new');

    // Wait for "Loading profiles..." to disappear
    await expect(page.getByText('Loading profiles...')).toBeHidden({ timeout: 15_000 });

    // Scope to the profile section (the .card containing "Choose Profile")
    const profileSection = page.locator('.card').filter({ hasText: 'Choose Profile' });
    const profileCards = profileSection.locator('.selection-card');
    await expect(profileCards.first()).toBeVisible({ timeout: 5_000 });
    const count = await profileCards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Check that URI-based profile IDs appear
    const sectionText = await profileSection.textContent();
    for (const id of PROFILE_IDS) {
      expect(sectionText).toContain(id);
    }
  });

  test('clicking a profile card shows path dropdown', async ({ page }) => {
    await loginAsAlice(page);

    await page.getByText('New Agent Authorization').first().click();
    await page.waitForURL('**/agent/new');
    await expect(page.getByText('Loading profiles...')).toBeHidden({ timeout: 15_000 });

    // Target profile cards within the profile section
    const profileSection = page.locator('.card').filter({ hasText: 'Choose Profile' });
    const firstCard = profileSection.locator('.selection-card').first();
    await expect(firstCard).toBeVisible({ timeout: 5_000 });
    await firstCard.click();

    // Card should have selected state
    await expect(firstCard).toHaveClass(/selected/);

    // Path dropdown should appear
    await expect(profileSection.locator('.form-select')).toBeVisible();
  });
});
