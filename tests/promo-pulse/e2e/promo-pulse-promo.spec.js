const { test, expect } = require('@playwright/test');
const {
  expectAnyVisibleText,
  expectTextsVisible,
  findFirstVisible,
  openPromoPulseSection,
  openPromosTab,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function expandPromoFilters(page) {
  const openFiltersButton = page.getByRole('button', { name: /Open filters/i }).first();
  if (await openFiltersButton.isVisible()) {
    await openFiltersButton.click();
    await waitForPromoPulseLoad(page);
  }

  await expect(page.getByRole('button', { name: /Close filters/i }).first()).toBeVisible();
}

async function readPromoCount(page) {
  const countText = await page
    .getByRole('region', { name: 'Filters' })
    .getByText(/\d+ promos/i)
    .first()
    .textContent();

  const countMatch = countText?.match(/\d+/);
  if (!countMatch) {
    throw new Error(`Could not parse promo count from: ${countText}`);
  }

  return Number(countMatch[0]);
}

test.describe('Promo Pulse - Promo Overview', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'promoOverview');
  });

  test('renders promo overview KPIs, insight labels, and filter controls', async ({ page }) => {
    await expectTextsVisible(page, [
      'Promo Overview',
      'Promo Insights',
      'Total Active Promos',
      'Total Promo Spend',
      'Average Promo ROI',
      '% Negative ROI Promos',
      '% Scalable Promos',
      '% Optimize Candidates',
      '% Stop Candidates',
      'Avg Discount Depth',
      'Average Uplift %',
      'Planned vs Unplanned',
      'Filters',
      'Monthly',
      'Quarterly',
    ]);
  });

  test('shows the Promos tab workspace and lets users switch views', async ({ page }) => {
    await openPromosTab(page);

    await expectTextsVisible(page, [
      'PROMO LIST',
      'Grid View',
      'Card View',
      'Calendar',
    ]);

    await expectAnyVisibleText(page, ['0 promos', '0 · KPI: Average Promo ROI', 'View Details']);

    await page.getByRole('button', { name: 'Grid View' }).click();
    await expect(page.getByRole('button', { name: 'Grid View', pressed: true })).toBeVisible();

    await page.getByRole('button', { name: 'Card View' }).click();
    await expect(page.getByRole('button', { name: 'Card View', pressed: true })).toBeVisible();
  });

  test('shows the all-promo insights workspace with cross-kpi insight cards', async ({ page }) => {
    await page.getByRole('tab', { name: 'Intelligence' }).click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByRole('tab', { name: 'Intelligence', selected: true })).toBeVisible();
    await expectAnyVisibleText(page, [/ALL PROMO INSIGHTS/i, /insights across all KPIs/i]);

    await expectTextsVisible(page, [
      'Average ROI',
      'Promo Dependency',
      'Total Promo Spend',
      'Incremental Revenue',
    ]);

    await expectAnyVisibleText(page, [
      'Margin Impact',
      'Active Promos',
      'ROI Dispersion',
      'Avg Discount',
      'High ROI Share',
      'Uplift Rate',
    ]);
  });

  test('expands the promo filters and narrows the visible promo count', async ({ page }) => {
    await openPromosTab(page);

    const initialPromoCount = await readPromoCount(page);
    await expandPromoFilters(page);

    await expectTextsVisible(page, ['Brand', 'Region', 'Promo Status', 'ROI Band']);
    await expectAnyVisibleText(page, ['DailyRoots', 'FreshBurst', 'PureBasket', 'UrbanHarvest']);
    await expectAnyVisibleText(page, ['Midwest', 'Northeast', 'South', 'West']);
    await expectAnyVisibleText(page, ['Scale', 'Optimize', 'Experiment', 'Stop']);
    await expectAnyVisibleText(page, ['High (≥2x)', 'Medium (1-2x)', 'Low (<1x)']);

    await page.getByRole('button', { name: 'West', exact: true }).click();
    await waitForPromoPulseLoad(page);

    await expect.poll(async () => readPromoCount(page)).toBeLessThan(initialPromoCount);
  });

  test('supports promo card pagination and per-page sizing in card view', async ({ page }) => {
    await openPromosTab(page);

    await page.getByRole('button', { name: 'Card View', exact: true }).click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByRole('button', { name: 'Card View', pressed: true })).toBeVisible();
    await expect(page.getByText(/1[–-]12 of \d+ promos/i)).toBeVisible();
    await expect(page.getByText(/Page 1 of \d+/i)).toBeVisible();

    await page.getByRole('button', { name: '24', exact: true }).click();
    await waitForPromoPulseLoad(page);
    await expect(page.getByText(/1[–-]24 of \d+ promos/i)).toBeVisible();

    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await waitForPromoPulseLoad(page);
    await expect(page.getByText(/Page 2 of \d+/i)).toBeVisible();
  });

  test('exposes promo row actions when data is present, otherwise keeps the empty state stable', async ({ page }) => {
    await openPromosTab(page);

    const actionEntry = await findFirstVisible(page, [
      /View Details/i,
      /Simulate/i,
      /Scale/i,
      /Optimize/i,
      /Experiment/i,
      /Stop/i,
    ]);

    if (actionEntry) {
      await expect(actionEntry).toBeVisible();
      return;
    }

    await expectAnyVisibleText(page, ['0 promos', 'PROMO LIST', 'Average Promo ROI']);
  });

  test('persists the selected Promos tab and grid view mode after a reload', async ({ page }) => {
    await openPromosTab(page);
    await expect(page.getByRole('tab', { name: 'Promos', selected: true })).toBeVisible();

    await page.getByRole('button', { name: 'Grid View' }).click();
    await expect(page.getByRole('button', { name: 'Grid View', pressed: true })).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPromoPulseLoad(page);

    await expect(page.getByRole('tab', { name: 'Promos', selected: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grid View', pressed: true })).toBeVisible();
  });
});