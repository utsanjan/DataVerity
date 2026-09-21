const { test, expect } = require('@playwright/test');
const {
  NAV_BUTTONS,
  expectAnyVisibleText,
  openPromoPulseSection,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

test.describe('Promo Pulse - Customer Overview', () => {
  test('opens the customer overview section from the dashboard navigation', async ({ page }) => {
    await openPromoPulseSection(page, 'customerOverview');

    await expect(page.getByRole('button', { name: NAV_BUTTONS.customerOverview }).first()).toBeVisible();
    await expectAnyVisibleText(page, ['Customer Overview', 'Total Customers', 'customer accounts']);
    await expectAnyVisibleText(page, ['Filters', 'Monthly', 'Quarterly', 'Yearly']);
  });

  test('keeps customer-focused KPI and portfolio content visible on the overview dashboard', async ({ page }) => {
    await openPromoPulseSection(page, 'overview');
    await waitForPromoPulseLoad(page);

    await expectAnyVisibleText(page, ['INSIGHTS: TOTAL TRADE SPEND', 'CHARTS: TOTAL TRADE SPEND', 'Pareto - Top Promos Driving 80% Spend']);
    await expectAnyVisibleText(page, ['Spend by Channel', 'Spend by Brand', 'Spend Trend - Planned vs Actual']);
    await expectAnyVisibleText(page, ['Filters', 'Monthly', 'Quarterly']);
  });

  test('uses the Total Customers KPI as a customer drill-down entry point', async ({ page }) => {
    await openPromoPulseSection(page, 'overview');

    await page.getByRole('button', { name: /Total Customers/i }).click();

    await expect.poll(async () => {
      await waitForPromoPulseLoad(page);

      if (/customer/i.test(page.url())) {
        return true;
      }

      try {
        const navVisible = await page.getByRole('button', { name: NAV_BUTTONS.customerOverview }).first().isVisible();
        const contentVisible = await page.getByText(/customer accounts|Customer Overview|Total Customers/i).first().isVisible();
        return navVisible && contentVisible;
      } catch {
        return false;
      }
    }).toBe(true);
  });
});