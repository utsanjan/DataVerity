const { test, expect } = require('@playwright/test');
const {
  expectAnyVisibleText,
  expectTextsVisible,
  openFirstBrandDetailsIfPresent,
  openPromoPulseSection,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function openBrandDetailOrAssertBrandTab(page) {
  const opened = await openFirstBrandDetailsIfPresent(page);
  if (!opened) {
    await expect(page.getByRole('tab', { name: 'Brands', selected: true })).toBeVisible();
  }

  return opened;
}

test.describe('Promo Pulse - Brand Detail', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'brandOverview');
  });

  test('opens a brand detail route when brand rows are available', async ({ page }) => {
    const opened = await openBrandDetailOrAssertBrandTab(page);
    if (!opened) {
      return;
    }

    await expect.poll(() => page.url()).toMatch(/brand-details|brand/i);
    await expectAnyVisibleText(page, ['Baseline Rev', 'Promo Rev', 'Promo Dep.']);
  });

  test('renders the documented brand detail widgets when a brand is available', async ({ page }) => {
    const opened = await openBrandDetailOrAssertBrandTab(page);
    if (!opened) {
      return;
    }

    await expectAnyVisibleText(page, ['Efficient Growth Brand', 'Discount Addicted', 'Balanced']);
    await expectAnyVisibleText(page, ['High Dependency', 'Moderate', 'Healthy']);

    await expectTextsVisible(page, [
      'Baseline Rev',
      'Promo Rev',
      'Promo Dep.',
      'Avg ROI',
      'Avg Discount',
      'Elasticity Score',
      'Margin Trend',
    ]);

    await expectTextsVisible(page, [
      'Total Promos',
      'Avg Duration',
      '% Profitable',
      'Channel',
      'Spend %',
      'Incr. Rev',
      'Elasticity',
      'Flag',
    ]);

    await expectAnyVisibleText(page, ['High Concentration Risk', 'Overweight', 'Revenue', 'Margin', 'ROI']);
  });
});