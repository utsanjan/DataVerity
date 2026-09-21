const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loginToGovernance, goToNotebooks, goToRecommendations } = require('../../src/governance/helpers/governance-nav');
const config = require('../../config/governance/governance-validation.config.json');

const RESULT_PATH = path.resolve(__dirname, '../../artifacts/reports/csv/governance-notebook-recommendation-results.csv');

test.describe('Governance Notebook Recommendations & Cross-Page Validation', () => {
  test('validates notebook search, recommendation flags, and cross-page navigation', async ({ page }) => {
    test.setTimeout(180000);
    const user = process.env.GOVERNANCE_USER || 'admin@sparkwise.io';
    const pass = process.env.GOVERNANCE_PASS || 'admin123';

    await loginToGovernance(page, config.appUrl, user, pass);
    await goToNotebooks(page);

    const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
    if (await searchInput.count()) {
      await searchInput.fill(config.testNotebookName);
      await page.waitForTimeout(1000);
    }

    const notebookRow = page.locator('tr, [role="row"], div').filter({ hasText: new RegExp(config.testNotebookName, 'i') }).first();
    const hasNotebook = (await notebookRow.count()) > 0;

    await goToRecommendations(page);
    await page.waitForTimeout(2000);

    const recCountText = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/Recommendations\s*([\d,]+)/i) || text.match(/Open recommendations\s*([\d,]+)/i);
      return match ? match[1] : '0';
    });

    const csvLines = [
      'check_name,result,details',
      `notebook_search_test,${hasNotebook ? 'PASS' : 'FAIL'},Search for ${config.testNotebookName}`,
      `recommendations_page_count,CAPTURED,Total recommendations: ${recCountText}`,
    ];

    fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
    fs.writeFileSync(RESULT_PATH, csvLines.join('\n'), 'utf8');
    console.log(`[Notebook Validation] Results written to ${RESULT_PATH}`);
  });
});