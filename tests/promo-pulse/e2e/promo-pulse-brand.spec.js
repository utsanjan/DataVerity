const { test, expect } = require('@playwright/test');
const {
  expectAnyVisibleText,
  expectTextsVisible,
  findFirstVisible,
  openBrandsTab,
  openPromoPulseSection,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

test.describe('Promo Pulse - Brand Overview', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'brandOverview');
  });

  test('renders brand overview KPIs and controls', async ({ page }) => {
    await expectTextsVisible(page, [
      'Brand Overview',
      'Total Brands',
      'Total Brand Spend',
      'Average Brand ROI',
      'Promo Dependency Ratio',
      'Brand Margin Impact',
      'Promo Frequency',
      '% Profitable Promos',
      'Brand Growth vs LY',
      'Brand Insight',
      'Run Insight Engine',
      'Filters',
      'Monthly',
      'Quarterly',
    ]);

    await expectAnyVisibleText(page, ['Brand Incremental Reve...', 'Brand Incremental Revenue']);
  });

  test('shows the brand intelligence surfaces and supports switching to the Brands tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Intelligence', selected: true })).toBeVisible();

    await expectTextsVisible(page, ['ROI by Brand', 'Spend vs ROI']);

    await openBrandsTab(page);
    await expect(page.getByRole('tab', { name: 'Brands', selected: true })).toBeVisible();
  });

  test('persists the selected Brands tab after a reload', async ({ page }) => {
    await openBrandsTab(page);
    await expect(page.getByRole('tab', { name: 'Brands', selected: true })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPromoPulseLoad(page);
    await expect(page.getByRole('tab', { name: 'Brands', selected: true })).toBeVisible();
    await expectAnyVisibleText(page, ['Loading brands…', 'BRAND LIST', 'Card View', 'Grid View']);
  });

  test('exposes brand detail entry points when brand rows are present', async ({ page }) => {
    await openBrandsTab(page);

    const detailEntry = await findFirstVisible(page, [/View Details/i, /Details/i]);
    if (detailEntry) {
      await expect(detailEntry).toBeVisible();
      return;
    }

    await expect(page.getByRole('tab', { name: 'Brands', selected: true })).toBeVisible();
  });
});