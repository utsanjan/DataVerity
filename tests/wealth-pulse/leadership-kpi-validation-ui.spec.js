const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { loginToWealthPulse, openWealthPulseApp, selectEnvironment, goToLeadershipDashboard } = require('../../src/wealth-pulse/helpers/wealth-pulse-nav');
const { writeTable } = require('../../src/helpers/kpi-report-csv');


const config = require('../../config/wealth-pulse/leadership-kpi-validation.config.json');

const REPORT_PATH = path.resolve(__dirname, '../../artifacts/reports/csv/leadership-kpi-ui-values.csv');
const CONTEXT_PATH = path.resolve(__dirname, '../../artifacts/reports/json/leadership-kpi-advisor-trend-context.json');
const HEADERS = ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes'];

const MONTH_INDEX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function monthLabelToIsoDate(label) {
  const [monthName, year] = label.split(' ');
  const monthIndex = MONTH_INDEX[monthName];
  if (monthIndex === undefined || !year) return null;
  const date = new Date(Date.UTC(Number(year), monthIndex, 1));
  return date.toISOString().slice(0, 10);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractValue(text, label) {
  const normalized = (text || '').replace(/[\u2212\u2013\u2014]/g, '-');
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*(?::\\s*)?([+-]?(?:\\$)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:[KMB])?%?)`, 'i');
  const match = normalized.match(pattern);
  return match ? match[1] : null;
}

// Label text renders before its numeric value; wait for the value pattern itself.
async function waitForKpiValue(page, label, timeoutMs = 45000) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(
    (lbl) => {
      const normalized = (document.body.innerText || '').replace(/[\u2212\u2013\u2014]/g, '-');
      const escaped = lbl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`${escaped}\\s*(?::\\s*)?([+-]?(?:\\$)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?(?:[KMB])?%?)`, 'i');
      return pattern.test(normalized);
    },
    label,
    { timeout: timeoutMs },
  ).catch(() => {});
}

test.describe('Leadership KPI extraction from Wealth Pulse UI', () => {
  test('logs in, opens Wealth-Pulse via Select App, visits each Leadership dashboard, and writes UI values to a dedicated CSV', async ({ page }) => {
    // The AUM trend chart and the advisor comparison panel are chart/table widgets with
    // no scalar text in the DOM — capture their backing API responses instead so their
    // KPIs can still be computed and compared like any other value.
    let aumTrendResponse = null;
    let comparisonResponse = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (!/\/advisor-intelligence\/(aum-trend|comparison)(\?|$)/.test(url)) return;
      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('application/json')) return;
      try {
        const body = await response.json();
        if (url.includes('aum-trend')) aumTrendResponse = body;
        else if (url.includes('comparison')) comparisonResponse = body;
      } catch {
        // ignore unparsable/empty bodies
      }
    });

    const origin = new URL(config.appUrl).origin;
    await loginToWealthPulse(page, origin, process.env.TEST_USER, process.env.TEST_PASS);
    await openWealthPulseApp(page);
    await selectEnvironment(page, 'dev');

    // Iterate dashboards/KPIs in config order so row order matches the Databricks-side CSV exactly.
    const rows = [];
    for (const dashboard of config.dashboards) {
      await goToLeadershipDashboard(page, dashboard.sidebarLinkText || dashboard.name);

      // Sidebar link text matches immediately; wait for an actual KPI value to render instead.
      const firstKpi = dashboard.kpis[0];
      if (firstKpi) {
        await waitForKpiValue(page, firstKpi.uiLabel);
      } else {
        await page.waitForLoadState('networkidle').catch(() => {});
      }

      const pageText = await page.locator('body').innerText();
      for (const kpi of dashboard.kpis) {
        if (kpi.specialHandler === 'aumTrendTable') {
          if (!aumTrendResponse?.data?.aumTrend?.length) {
            rows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'N/A',
              valueFormat: kpi.valueFormat,
              status: 'UI_NOT_FOUND',
              notes: 'Could not capture the aum-trend API response.',
            });
            continue;
          }

          const aumTrend = aumTrendResponse.data.aumTrend;
          const advisorIds = aumTrend.map((advisor) => advisor.advisorId);
          const monthLabels = aumTrend[0].data.map((point) => point.month);
          const tableRows = [];
          for (const advisor of aumTrend) {
            for (const point of advisor.data) {
              // The chart API zero-fills months with no snapshot for continuity;
              // Databricks naturally has no row for those, so skip zero points
              // to avoid false MISSING/FAIL results from a charting artifact.
              if (point.aum === 0) continue;
              tableRows.push({ advisorId: advisor.advisorId, month: point.month, aum: point.aum });
            }
          }

          rows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: JSON.stringify(tableRows),
            valueFormat: kpi.valueFormat,
            status: 'UI_CAPTURED',
            notes: `${tableRows.length} data points across ${advisorIds.length} charted advisors and ${monthLabels.length} months.`,
          });

          fs.mkdirSync(path.dirname(CONTEXT_PATH), { recursive: true });
          const existingContext = fs.existsSync(CONTEXT_PATH) ? JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf8')) : {};
          fs.writeFileSync(CONTEXT_PATH, JSON.stringify({
            ...existingContext,
            advisorIds,
            monthLabels,
            monthDates: monthLabels.map(monthLabelToIsoDate),
          }, null, 2), 'utf8');
          continue;
        }

        if (kpi.specialHandler === 'top4AdvisorMetrics') {
          const advisors = comparisonResponse?.data?.advisors;
          if (!advisors) {
            rows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'N/A',
              valueFormat: kpi.valueFormat,
              status: 'UI_NOT_FOUND',
              notes: 'Could not capture the advisor-intelligence comparison API response.',
            });
            continue;
          }

          const top4 = [...advisors].sort((a, b) => (b.aum || 0) - (a.aum || 0)).slice(0, 4);
          const tableRows = top4.map((a) => ({
            advisorId: a.advisorId,
            ytdGrowthPct: a.ytdGrowthPct,
            retentionPct: a.retentionPct,
          }));

          fs.mkdirSync(path.dirname(CONTEXT_PATH), { recursive: true });
          const existingContext = fs.existsSync(CONTEXT_PATH) ? JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf8')) : {};
          fs.writeFileSync(CONTEXT_PATH, JSON.stringify({
            ...existingContext,
            top4AdvisorIds: top4.map((a) => a.advisorId),
          }, null, 2), 'utf8');

          rows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: JSON.stringify(tableRows),
            valueFormat: kpi.valueFormat,
            status: 'UI_CAPTURED',
            notes: `Top 4 by AUM: ${tableRows.map((r) => r.advisorId).join(', ')}.`,
          });
          continue;
        }

        const rawValue = extractValue(pageText, kpi.uiLabel);
        rows.push({
          dashboard: dashboard.name,
          kpi: kpi.name,
          uiLabel: kpi.uiLabel,
          value: rawValue || 'N/A',
          valueFormat: kpi.valueFormat || 'unknown',
          status: rawValue ? 'UI_CAPTURED' : 'UI_NOT_FOUND',
          notes: `Captured from Wealth Pulse UI at ${new Date().toISOString()}`,
        });
      }
    }

    const writtenPath = writeTable(REPORT_PATH, HEADERS, rows);
    console.log(`UI values written to ${writtenPath} (${rows.length} KPI rows)`);
  });
});
