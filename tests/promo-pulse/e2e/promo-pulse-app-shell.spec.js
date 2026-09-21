const { test, expect } = require('@playwright/test');
const {
  LANDING_URL,
  LOGIN_URL,
  NAV_BUTTONS,
  loginToPlatform,
  openPromoPulseApp,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

const EMPTY_STORAGE_STATE = { cookies: [], origins: [] };

test.describe('Promo Pulse - App Shell', () => {
  test.describe('unauthenticated entry', () => {
    test.use({ storageState: EMPTY_STORAGE_STATE });

    test('renders the login form and reaches the landing page after authentication', async ({ page }) => {
      await page.goto(LOGIN_URL);
      await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'LOGIN' })).toBeVisible();

      await loginToPlatform(page);
      await expect(page).toHaveURL(LANDING_URL);
    });
  });

  test('opens Promo Pulse from the app switcher and shows all documented dashboard modules', async ({ page }) => {
    await loginToPlatform(page);
    await openPromoPulseApp(page);

    for (const navName of Object.values(NAV_BUTTONS)) {
      await expect(page.getByRole('button', { name: navName }).first()).toBeVisible();
    }
  });

  test('lands in the current workspace shell once Promo Pulse is open', async ({ page }) => {
    await loginToPlatform(page);
    await openPromoPulseApp(page);
    await waitForPromoPulseLoad(page);

    await expect(page.getByRole('button', { name: NAV_BUTTONS.overview }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Connections Connections/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Create New Connection/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Search connections/i })).toBeVisible();
  });
});