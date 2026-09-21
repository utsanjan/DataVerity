const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginToPlatform } = require('../../src/promo-pulse/helpers/promo-pulse');

const AUTH_STATE_PATH = path.resolve(process.cwd(), 'playwright/.auth/user.json');

test('authenticate once and save the session state', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });

  await page.goto('about:blank');
  await loginToPlatform(page);
  await expect(page.getByRole('textbox', { name: /Search workspaces, pipelines, assets/i }).first()).toBeVisible();
  await page.context().storageState({ path: AUTH_STATE_PATH });
});