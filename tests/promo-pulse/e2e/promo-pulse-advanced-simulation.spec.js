const { test, expect } = require('@playwright/test');
const {
  expectAnyVisibleText,
  findFirstVisible,
  openFirstPromoDetailsIfPresent,
  openPromoPulseSection,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

async function openSimulationFromPromo(page) {
  await openPromoPulseSection(page, 'promoOverview');

  const directSimulationNav = await findFirstVisible(page, [/^Advanced Simulation Advanced Simulation$/i, /^Advanced Simulation$/i]);
  if (directSimulationNav) {
    await directSimulationNav.click();
    await waitForPromoPulseLoad(page);
    return;
  }

  const opened = await openFirstPromoDetailsIfPresent(page);
  if (!opened) {
    throw new Error('Neither the Advanced Simulation navigation item nor a promo detail entry point was visible in the current environment.');
  }

  const runSimulationButton = await findFirstVisible(page, [/Run Simulation/i, /^Simulate$/i]);
  await expect(runSimulationButton).toBeVisible();
  await runSimulationButton.click();
  await waitForPromoPulseLoad(page);
}

test.describe('Promo Pulse - Advanced Simulation', () => {
  test('opens the simulation experience from promo detail', async ({ page }) => {
    test.setTimeout(15000);

    await openSimulationFromPromo(page);

    await expect.poll(() => page.url()).toMatch(/simulation/i);
    await expectAnyVisibleText(page, [
      'Select Promotions',
      'Budget & Objective',
      'Review & Generate',
      'Generate Scenario',
    ]);
  });
});