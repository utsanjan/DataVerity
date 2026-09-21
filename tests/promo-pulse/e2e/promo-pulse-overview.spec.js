const { test, expect } = require('@playwright/test');
const {
  NAV_BUTTONS,
  expectAnyVisibleText,
  expectFilterControls,
  expectTextsVisible,
  openPromoPulseSection,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

test.describe('Promo Pulse - Overview', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'overview');
  });

  test('renders the overview shell, dashboard navigation, and KPI navigator', async ({ page }) => {
    await expect(page.getByRole('button', { name: NAV_BUTTONS.overview }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: NAV_BUTTONS.promoOverview }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: NAV_BUTTONS.brandOverview }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: NAV_BUTTONS.channelOverview }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: NAV_BUTTONS.customerOverview }).first()).toBeVisible();
    await expect(page.getByText('KPI NAVIGATOR')).toBeVisible();

    await expectTextsVisible(page, [
      'Total Trade Spend',
      'Incremental Revenue',
      'Average ROI',
      'Total Brands',
      'Total Channels',
      'Total Customers',
      'Volume Sold',
      'Total Insights',
      'Run Insight Engine',
    ]);
  });

  test('keeps the filter bar active and lets users switch time periods', async ({ page }) => {
    await expectFilterControls(page);
    await waitForPromoPulseLoad(page);

    const monthlyButton = page.getByRole('button', { name: 'Monthly' });
    const quarterlyButton = page.getByRole('button', { name: 'Quarterly' });
    const yearlyButton = page.getByRole('button', { name: 'Yearly' });

    await quarterlyButton.click({ force: true });
    await waitForPromoPulseLoad(page);
    await expect(page.getByRole('button', { name: 'Quarterly', pressed: true })).toBeVisible();

    await yearlyButton.click({ force: true });
    await waitForPromoPulseLoad(page);
    await expect(page.getByRole('button', { name: 'Yearly', pressed: true })).toBeVisible();

    await monthlyButton.click({ force: true });
    await waitForPromoPulseLoad(page);
    await expect(page.getByRole('button', { name: 'Monthly', pressed: true })).toBeVisible();

    await expectAnyVisibleText(page, ['Spend Trajectory', 'Channel Concentration', 'Promo Concentration']);
  });

  test('renders overview insights and chart surfaces', async ({ page }) => {
    await expectTextsVisible(page, [
      'Spend Trajectory',
      'Channel Concentration',
      'Budget Discipline',
      'Promo Concentration',
      'Spend Trend - Planned vs Actual',
      'Spend by Channel',
      'Spend by Brand',
      'Pareto - Top Promos Driving 80% Spend',
    ]);

    await expectAnyVisibleText(page, [
      'Volume Sold',
      'units across all promos',
      'Volume by Channel',
      'Volume by Brand',
    ]);
  });

  test('switches the overview insight and chart headings when KPI cards are selected', async ({ page }) => {
    await page.getByRole('button', { name: /Total Trade Spend/i }).click();
    await expect(page.getByRole('heading', { name: /INSIGHTS: TOTAL TRADE SPEND/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /CHARTS: TOTAL TRADE SPEND/i })).toBeVisible();

    await page.getByRole('button', { name: /Incremental Revenue/i }).click();
    await expect(page.getByRole('heading', { name: /INSIGHTS: INCREMENTAL REVENUE/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /CHARTS: INCREMENTAL REVENUE/i })).toBeVisible();

    await page.getByRole('button', { name: /Total Customers/i }).click();
    await expectAnyVisibleText(page, ['Customer Overview', 'customer accounts', 'Total Customers']);
  });

  test('exposes a View all entry point for deeper insight exploration', async ({ page }) => {
    const viewAllButton = page.getByRole('button', { name: /View all/i }).first();
    await expect(viewAllButton).toBeVisible();

    const previousUrl = page.url();
    await viewAllButton.click();

    await expect.poll(async () => {
      if (page.url() !== previousUrl) {
        return true;
      }

      try {
        return await page.getByRole('dialog').first().isVisible();
      } catch {
        return false;
      }
    }).toBe(true);
  });

});