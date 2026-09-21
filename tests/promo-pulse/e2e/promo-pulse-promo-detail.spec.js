const { test, expect } = require('@playwright/test');
const {
  expectAnyVisibleText,
  expectTextsVisible,
  openFirstPromoDetailsIfPresent,
  openPromoPulseSection,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function openPromoDetailOrAssertEmptyState(page) {
  const opened = await openFirstPromoDetailsIfPresent(page);
  if (!opened) {
    await expectAnyVisibleText(page, ['0 promos', 'PROMO LIST', 'Average Promo ROI']);
  }

  return opened;
}

test.describe('Promo Pulse - Promo Detail', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'promoOverview');
  });

  test('opens a promo detail route when promo rows are available', async ({ page }) => {
    const opened = await openPromoDetailOrAssertEmptyState(page);
    if (!opened) {
      return;
    }

    await expect.poll(() => page.url()).toMatch(/promo-details|promotion|promo-overview\?type=view&id=/i);
  });

  test('renders the documented promo detail widgets when a promo is available', async ({ page }) => {
    const opened = await openPromoDetailOrAssertEmptyState(page);
    if (!opened) {
      return;
    }

    await expectTextsVisible(page, [
      'Uplift Decomposition',
      'Total Uplift',
      'Uplift %',
      'Post-Promo Dip',
      'Pull-Forward %',
      'Financial Breakdown',
      'Gross Margin %',
      'EBITDA Impact',
      'Margin Impact',
      'Driver Attribution',
      'Cannibalization Analysis',
      'Benchmark vs Similar Promos',
      'Run Simulation',
    ]);

    await expectAnyVisibleText(page, ['Discount Impact', 'Duration Impact', 'Channel Strength']);
  });
});