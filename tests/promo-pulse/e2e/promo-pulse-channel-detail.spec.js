const { test, expect } = require('@playwright/test');
const {
  expectAnyVisibleText,
  expectTextsVisible,
  openFirstChannelDetailsIfPresent,
  openPromoPulseSection,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function openChannelDetailOrAssertChannelTab(page) {
  const opened = await openFirstChannelDetailsIfPresent(page);
  if (!opened) {
    await expect(page.getByRole('tab', { name: 'Channels' })).toBeVisible();
    await expectAnyVisibleText(page, ['Channel Overview', 'Key Insights']);
  }

  return opened;
}

test.describe('Promo Pulse - Channel Detail', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'channelOverview');
  });

  test('opens a channel detail route when channel rows are available', async ({ page }) => {
    const opened = await openChannelDetailOrAssertChannelTab(page);
    if (!opened) {
      return;
    }

    await expect.poll(() => page.url()).toMatch(/channel-details|channel/i);
  });

  test('renders the documented channel detail widgets when a channel is available', async ({ page }) => {
    const opened = await openChannelDetailOrAssertChannelTab(page);
    if (!opened) {
      return;
    }

    await expectTextsVisible(page, [
      'Total Spend',
      'Incr. Revenue',
      'Avg ROI',
      'Margin Impact',
      'ELASTICITY & DISCOUNT DIAGNOSTICS',
      'Elasticity Diagnostic',
    ]);

    await expectAnyVisibleText(page, ['High Sensitivity', 'Moderate', 'Low']);
    await expectAnyVisibleText(page, ['Peak ROI bucket', 'Over-Discounting Detected', 'Discount Depth On Target']);

    await expectTextsVisible(page, [
      'Brand',
      'ROI',
      'Spend',
      'Inc. Revenue',
      'Status',
    ]);

    await expectAnyVisibleText(page, ['Overinvested', 'Ontrack', 'Brand Efficiency Matrix', 'Run Simulation']);
  });
});