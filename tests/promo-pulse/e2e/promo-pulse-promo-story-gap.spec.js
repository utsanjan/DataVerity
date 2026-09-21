const { test, expect } = require('@playwright/test');
const {
  findFirstVisible,
  openPromoPulseSection,
  openPromosTab,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function expandPromoFilters(page) {
  const openFiltersButton = page.getByRole('button', { name: /Open filters|Filters/i }).first();
  if (await openFiltersButton.isVisible()) {
    await openFiltersButton.click();
    await waitForPromoPulseLoad(page);
  }
}

test.describe('Promo Pulse - Promo Overview Story Gaps', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'promoOverview');
  });

  test('TP-POV-010 story filter bar exposes a custom date range selector', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented custom date range selector.');

    await expandPromoFilters(page);

    await expect(page.getByText(/Custom Date Range|Date Range|Custom Range/i).first()).toBeVisible();
  });

  test('TP-POV-011 story filter bar exposes a Yearly time aggregation option', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Yearly time aggregation option.');

    await expect(page.getByRole('button', { name: /^Yearly$/i }).first()).toBeVisible();
  });

  test('TP-POV-020 regular KPI intelligence exposes a View all insights control', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented View all insights control from a regular KPI intelligence panel.');

    await page.getByText(/Total Promo Spend/i).first().click();
    await waitForPromoPulseLoad(page);

    const control = await findFirstVisible(page, [/View all insights/i]);
    await expect(control).toBeVisible();
  });

  test('TP-POV-040 promos tab exposes a working calendar view', async ({ page }) => {
    await openPromosTab(page);

    const calendarButton = page.getByRole('button', { name: /Calendar/i }).first();
    await expect(calendarButton).toBeVisible();

    await calendarButton.click();
    await waitForPromoPulseLoad(page);

    await expect(calendarButton).toHaveAttribute('aria-pressed', /true/i);
  });

  test('TP-POV-021 active promos intelligence exposes the documented Promo Count by Brand chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Promo Count by Brand chart for Total Active Promos.');

    await page.getByText(/Total Active Promos/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/Promo Count by Brand/i).first()).toBeVisible();
  });

  test('TP-POV-022 active promos intelligence exposes the documented Promo Distribution by Channel chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Promo Distribution by Channel chart for Total Active Promos.');

    await page.getByText(/Total Active Promos/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/Promo Distribution by Channel/i).first()).toBeVisible();
  });

  test('TP-POV-023 active promos intelligence exposes the documented Weekly Promo Density Heatmap', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Weekly Promo Density Heatmap for Total Active Promos.');

    await page.getByText(/Total Active Promos/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/Weekly Promo Density Heatmap/i).first()).toBeVisible();
  });

  test('TP-POV-024 total promo spend intelligence exposes the documented Spend by Promo chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Spend by Promo chart for Total Promo Spend.');

    await page.getByText(/Total Promo Spend/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/Spend by Promo/i).first()).toBeVisible();
  });

  test('TP-POV-025 total promo spend intelligence exposes the documented Spend Trend chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Spend Trend chart for Total Promo Spend.');

    await page.getByText(/Total Promo Spend/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/Spend Trend/i).first()).toBeVisible();
  });

  test('TP-POV-026 total promo spend intelligence exposes the documented Spend by Channel chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented Spend by Channel chart for Total Promo Spend.');

    await page.getByText(/Total Promo Spend/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/Spend by Channel/i).first()).toBeVisible();
  });

  test('TP-POV-030 average promo ROI intelligence exposes the documented ROI vs Spend chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented ROI vs Spend chart for Average Promo ROI.');
    test.setTimeout(60000);

    await page.getByText(/Average Promo ROI/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/ROI vs Spend/i).first()).toBeVisible();
  });

  test('TP-POV-031 average promo ROI intelligence exposes the documented ROI Distribution chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented ROI Distribution chart for Average Promo ROI.');
    test.setTimeout(60000);

    await page.getByText(/Average Promo ROI/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/ROI Distribution/i).first()).toBeVisible();
  });

  test('TP-POV-032 average promo ROI intelligence exposes the documented ROI Trend Over Time chart', async ({ page }) => {
    test.fail(true, 'Promo Overview does not expose the documented ROI Trend Over Time chart for Average Promo ROI.');
    test.setTimeout(60000);

    await page.getByText(/Average Promo ROI/i).first().click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/ROI Trend Over Time/i).first()).toBeVisible();
  });
});