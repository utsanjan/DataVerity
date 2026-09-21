const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { loginToWealthPulse, openWealthPulseApp, selectEnvironment, goToAdvisorDashboard } = require('../../src/wealth-pulse/helpers/wealth-pulse-nav');
const { writeTable } = require('../../src/helpers/kpi-report-csv');

const config = require('../../config/wealth-pulse/advisor-kpi-validation.config.json');

const REPORT_PATH = path.resolve(__dirname, '../../artifacts/reports/csv/advisor-kpi-ui-values.csv');
const HEADERS = ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes'];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractValue(text, label) {
  const normalized = (text || '').replace(/[\u2212\u2013\u2014]/g, '-').replace(/[\r\n]+/g, ' ');
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?::\\s*)?([+-]?(?:\\$)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:[KMB])?%?)`, 'i');
  const match = normalized.match(pattern);
  return match ? match[1] : null;
}

async function extractFromDomCard(page, uiLabel) {
  return await page.evaluate((lbl) => {
    const escaped = lbl.toLowerCase();
    const allDivs = Array.from(document.querySelectorAll('div, section, article, [class*="card"], [class*="Card"], [class*="tile"], [class*="Tile"], [class*="kpi"], [class*="Kpi"]'));

    for (const el of allDivs) {
      const directText = (el.innerText || '').replace(/[\u2212\u2013\u2014]/g, '-').replace(/[\r\n]+/g, ' ').trim();
      if (directText.toLowerCase().includes(escaped)) {
        const valueMatch = directText.match(/([+-]?(?:\$)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[KMB])?%?)/);
        if (valueMatch) {
          const val = valueMatch[1];
          if (val.toLowerCase() !== escaped) return val;
        }
      }
    }
    return null;
  }, uiLabel).catch(() => null);
}

async function waitForKpiValue(page, label, timeoutMs = 10000) {
  await page.waitForFunction(
    (lbl) => {
      const text = (document.body.innerText || '').replace(/[\u2212\u2013\u2014]/g, '-').replace(/[\r\n]+/g, ' ');
      const escaped = lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${escaped}\\s*(?::\\s*)?([+-]?(?:\\$)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:[KMB])?%?)`, 'i');
      return pattern.test(text);
    },
    label,
    { timeout: timeoutMs },
  ).catch(() => {});
}

test.describe('Advisor KPI extraction from Wealth Pulse UI', () => {
  test('logs in, opens Wealth-Pulse via Select App, visits each Advisor dashboard, and writes UI values to a dedicated CSV', async ({ page }) => {
    test.setTimeout(180000);
    const capturedRows = [];

    let chartsResponse = null;
    let householdsResponse = null;
    let exposureResponse = null;

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/v1/advisor/dashboard/charts')) {
        chartsResponse = await response.json().catch(() => null);
      } else if (url.includes('/api/v1/advisor/households')) {
        householdsResponse = await response.json().catch(() => null);
      } else if (url.includes('/api/v1/advisor/portfolio-analytics/exposure')) {
        exposureResponse = await response.json().catch(() => null);
      }
    });

    const baseUrl = process.env.BASE_URL || 'https://dev.1platform.tech';
    const user = process.env.TEST_USER || 'user@polestaranalytics.com';
    const pass = process.env.TEST_PASS || 'SecurePassword123!';

    console.log(`[UI] Logging into ${baseUrl}...`);
    await loginToWealthPulse(page, baseUrl, user, pass);
    await openWealthPulseApp(page);
    await selectEnvironment(page, 'dev');

    for (let index = 0; index < config.dashboards.length; index += 1) {
      const dashboard = config.dashboards[index];
      console.log(`[UI] Navigating to Advisor dashboard: ${dashboard.name}`);

      if (index > 0 && dashboard.sidebarLinkText) {
        await goToAdvisorDashboard(page, dashboard.sidebarLinkText);
      }

      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(4000);

      const pageText = await page.evaluate(() => document.body.innerText);

      for (const kpi of dashboard.kpis) {
        if (kpi.valueFormat === 'table') {
          let tableRows = [];
          let captureNote = `Captured UI table rows at ${new Date().toISOString()}`;

          if (kpi.specialHandler === 'aumTrendTable') {
            const trend = chartsResponse?.data?.charts?.aumTrend;
            if (Array.isArray(trend)) {
              tableRows = trend.map((pt) => ({ advisorId: 'ADVISOR', month: pt.month, aum: pt.aum }));
            }
          } else if (kpi.specialHandler === 'householdTable') {
            let pagesLoaded = 0;
            while (pagesLoaded < 50) {
              const loadMore = page.getByText(/^Load more households(?:\s*\(\d+ remaining\))?$/i).first();
              if (!await loadMore.isVisible().catch(() => false) || await loadMore.isDisabled().catch(() => false)) break;

              const rowCountBefore = await page.locator('table tr').count();
              await loadMore.click();
              await page.waitForFunction(
                (previousCount) => document.querySelectorAll('table tr').length > previousCount
                  || !Array.from(document.querySelectorAll('button, [role="button"]')).some((element) =>
                    /^Load more households(?:\s*\(\d+ remaining\))?$/i.test((element.textContent || '').trim())),
                rowCountBefore,
                { timeout: 10000 },
              ).catch(() => {});
              pagesLoaded += 1;
            }

            const hhs = householdsResponse?.data?.households || householdsResponse?.data;
            if (Array.isArray(hhs)) {
              tableRows = hhs.map((h) => ({
                householdName: h.name || h.house_hold_name || h.householdName,
                segment: h.segment || 'N/A',
                aum: h.aum || h.marketValue || 0,
                accounts: Array.isArray(h.accounts) ? h.accounts.length : (h.accounts || h.accountCount || 0),
                cashPct: h.cashPct || h.cash_pct || 0,
              }));
            }
            const renderedRows = await page.evaluate(() => {
              const parseCompactNumber = (value) => {
                const match = String(value || '').replace(/,/g, '').match(/([+-]?\d+(?:\.\d+)?)\s*([KMB])?/i);
                if (!match) return null;
                const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[(match[2] || '').toUpperCase()] || 1;
                return Number(match[1]) * multiplier;
              };

              const rows = Array.from(document.querySelectorAll('table tr')).slice(1);
              return rows.map((r) => {
                const cells = Array.from(r.querySelectorAll('td, th')).map((c) => c.innerText.trim());
                if (cells.length < 4) return null;
                const nameParts = cells[0].split('\n');
                const aum = parseCompactNumber(cells[2]);
                const accounts = parseCompactNumber(cells[3]);
                if (!nameParts[0] || aum === null || accounts === null) return null;
                return {
                  householdName: nameParts[0],
                  segment: cells[1] || 'N/A',
                  aum,
                  accounts,
                  cashPct: parseCompactNumber(cells[4]) || 0,
                };
              }).filter(Boolean);
            }).catch(() => []);

            if (renderedRows.length) {
              tableRows = renderedRows;
            }
            captureNote = `Captured ${tableRows.length} rendered UI rows after loading ${pagesLoaded} additional page(s) at ${new Date().toISOString()}`;
          } else if (kpi.specialHandler === 'assetAllocationTable') {
            const exp = exposureResponse?.data?.exposure || exposureResponse?.data;
            if (Array.isArray(exp)) {
              tableRows = exp.map((e) => ({
                assetClass: e.ticker || e.security || e.assetClass,
                currentPct: e.pctOfBook || e.currentPct || 0,
              }));
            }
            if (!tableRows.length) {
              tableRows = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('table tr')).slice(1);
                return rows.map((r) => {
                  const cells = Array.from(r.querySelectorAll('td, th')).map((c) => c.innerText.trim());
                  if (cells.length < 4) return null;
                  return {
                    assetClass: cells[1] || cells[2] || 'Security',
                    currentPct: parseFloat((cells[4] || '').replace(/[^0-9.]/g, '')) || 0,
                  };
                }).filter(Boolean);
              }).catch(() => []);
            }
          }

          if (tableRows.length > 0) {
            console.log(`[UI] Extracted ${dashboard.name} -> ${kpi.name}: ${tableRows.length} rows`);
            capturedRows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: JSON.stringify(tableRows),
              valueFormat: kpi.valueFormat,
              status: 'UI_CAPTURED',
              notes: captureNote,
            });
          } else {
            console.warn(`[UI] Warning: Could not find table rows for ${dashboard.name} -> ${kpi.name}`);
            capturedRows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'N/A',
              valueFormat: kpi.valueFormat,
              status: 'UI_NOT_FOUND',
              notes: 'Table data or API response not found.',
            });
          }
          continue;
        }

        await waitForKpiValue(page, kpi.uiLabel, 8000);
        const textAfterWait = await page.evaluate(() => document.body.innerText);
        let extracted = extractValue(textAfterWait, kpi.uiLabel) || extractValue(pageText, kpi.uiLabel);

        if (!extracted) {
          extracted = await extractFromDomCard(page, kpi.uiLabel);
        }

        if (extracted) {
          console.log(`[UI] Extracted ${dashboard.name} -> ${kpi.name}: ${extracted}`);
          capturedRows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: extracted,
            valueFormat: kpi.valueFormat || 'string',
            status: 'UI_CAPTURED',
            notes: `Captured from Wealth Pulse UI at ${new Date().toISOString()}`,
          });
        } else {
          console.warn(`[UI] Warning: Could not find value for ${dashboard.name} -> ${kpi.name}`);
          capturedRows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: 'N/A',
            valueFormat: kpi.valueFormat || 'string',
            status: 'UI_NOT_FOUND',
            notes: 'Label or numeric pattern not found in page DOM body.',
          });
        }
      }
    }

    writeTable(REPORT_PATH, HEADERS, capturedRows);
    console.log(`[UI] Written ${capturedRows.length} UI KPI rows to ${REPORT_PATH}`);
  });
});
