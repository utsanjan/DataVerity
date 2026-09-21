const { test, expect } = require('@playwright/test');
const {
  findFirstVisible,
  openPromoPulseSection,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function waitForAnyVisible(page, candidates, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const locator = await findFirstVisible(page, candidates);
    if (locator) {
      return locator;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`None of the expected surfaces became visible: ${candidates.map(String).join(', ')}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureFiltersExpanded(page) {
  const openFiltersButton = page.getByRole('button', { name: /Open filters/i }).first();
  if (await isVisible(openFiltersButton)) {
    await openFiltersButton.click();
    await waitForPromoPulseLoad(page);
  }

  await expect(page.getByRole('region', { name: /^Filters$/i })).toBeVisible();
}

async function openKpiContext(page, label, urlPattern) {
  const kpiButton = page.getByRole('complementary').first().getByRole('button', {
    name: new RegExp(`^${escapeRegExp(label)}\\b`, 'i'),
  }).first();

  await expect(kpiButton).toBeVisible();
  await kpiButton.click();
  await waitForPromoPulseLoad(page);

  if (urlPattern) {
    await expect(page).toHaveURL(urlPattern);
  }
}

test.describe('Promo Pulse - Channel Overview Story Gaps', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'channelOverview');
    await expect(page.getByText(/KPI NAVIGATOR/i).first()).toBeVisible();
  });

  test('TP-CHOV-010 TP-CHOV-042 story filter bar exposes the documented custom date range control', async ({ page }) => {
    test.fail(true, 'Channel Overview does not expose the documented custom date range control in the filter bar.');

    await openKpiContext(page, 'Total Channels', /kpi=total-channels/i);
    await ensureFiltersExpanded(page);

    const timePeriodControl = await waitForAnyVisible(page, [
      /Time Period/i,
      /Custom Date Range/i,
      /Date Range/i,
      /From Date/i,
      /To Date/i,
    ], 5000);

    await expect(timePeriodControl).toBeVisible();
  });

  test('TP-CHOV-023 TP-CHOV-024 TP-CHOV-025 story intelligence charts expose the documented radar, elasticity, and allocation views', async ({ page }) => {
    test.fail(true, 'The documented radar, elasticity, and allocation chart set is not rendered in the current Total Spend intelligence workspace.');

    await openKpiContext(page, 'Total Spend', /kpi=total-spend-co/i);
    await expect(page.getByRole('tab', { name: /^Intelligence$/i, selected: true })).toBeVisible();

    await expect(page.getByText(/Channel ROI Over Time/i).first()).toBeVisible();
    await expect(page.getByText(/Structural Strength Radar/i).first()).toBeVisible();
    await expect(page.getByText(/ROI Elasticity by Discount Band/i).first()).toBeVisible();
    await expect(page.getByText(/Allocation:\s*Spend vs Revenue Share/i).first()).toBeVisible();
  });

  test('TP-CHOV-061 TP-CHOV-063 story risk alerts expose overinvestment and margin destruction signals', async ({ page }) => {
    test.fail(true, 'The documented Risk Alert Panel and its overinvestment or margin-destruction alerts are not rendered in the current intelligence workspace.');

    await openKpiContext(page, 'Total Spend', /kpi=total-spend-co/i);
    await expect(page.getByRole('tab', { name: /^Intelligence$/i, selected: true })).toBeVisible();

    await expect(page.getByText(/Risk Alert Panel/i).first()).toBeVisible();
    await expect(page.getByText(/Overinvestment risk/i).first()).toBeVisible();
    await expect(page.getByText(/Margin destruction risk/i).first()).toBeVisible();
  });
});