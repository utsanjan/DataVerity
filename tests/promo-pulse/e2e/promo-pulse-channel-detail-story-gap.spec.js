const { test, expect } = require('@playwright/test');
const {
  expectTextsVisible,
  openFirstChannelDetailsIfPresent,
  openPromoPulseSection,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function openChannelDetailOrSkip(page) {
  const opened = await openFirstChannelDetailsIfPresent(page);
  test.skip(!opened, 'No channel detail entry point was visible in the current environment.');
}

test.describe('Promo Pulse - Channel Detail Story Gaps', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'channelOverview');
  });

  test('story detail KPI snapshot exposes the documented Elasticity Index metric', async ({ page }) => {
    test.fail(true, 'Channel Detail does not render the documented Elasticity Index metric in the KPI snapshot.');

    await openChannelDetailOrSkip(page);

    await expect(page.getByText('Elasticity Index').first()).toBeVisible({ timeout: 1000 });
  });

  test('story detail exposes the documented Seasonal Performance layer', async ({ page }) => {
    test.fail(true, 'Channel Detail does not render the documented Seasonal Performance layer.');

    await openChannelDetailOrSkip(page);

    await expect(page.getByText(/Seasonal Performance/i).first()).toBeVisible({ timeout: 1000 });
  });

  test('story detail exposes the documented AI recommendations panel', async ({ page }) => {
    test.fail(true, 'Channel Detail does not render the documented AI recommendations panel.');

    await openChannelDetailOrSkip(page);

    await expect(page.getByText(/AI Recommendations/i).first()).toBeVisible({ timeout: 1000 });
  });
});