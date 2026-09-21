const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { loginToWealthPulse, openWealthPulseApp, selectEnvironment, goToLeadershipDashboard } = require('../../../src/wealth-pulse/helpers/wealth-pulse-nav');

const REPORT_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/leadership-kpi-validation-report.csv');
const DEFAULT_KPI_CONFIG = require('../../../config/wealth-pulse/leadership-kpi-validation.config.json');

function normalizeRuntimeConfig(config) {
  return {
    appUrl: process.env.LEADERSHIP_APP_URL || config.appUrl,
    startDate: process.env.DATABRICKS_START_DATE || config.startDate,
    endDate: process.env.DATABRICKS_END_DATE || config.endDate,
    workspaceId: process.env.DATABRICKS_WORKSPACE_ID || config.workspaceId,
    databricksHost: process.env.DATABRICKS_HOST || config.databricksHost,
    databricksToken: process.env.DATABRICKS_TOKEN || config.databricksToken,
    warehouseId: process.env.DATABRICKS_WAREHOUSE_ID || config.warehouseId,
    httpPath: process.env.DATABRICKS_HTTP_PATH || config.httpPath,
    tolerancePercent: Number(process.env.KPI_TOLERANCE_PERCENT || config.tolerancePercent || 0.5),
    dashboards: config.dashboards || [],
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;

  const normalized = String(value)
    .replace(/[$,%\s]/g, '')
    .replace(/,/g, '')
    .trim();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNumbers(uiValue, dbValue, tolerancePercent = 0.5) {
  const left = toNumber(uiValue);
  const right = toNumber(dbValue);

  if (left === null || right === null) return false;

  if (right === 0) {
    return Math.abs(left) <= tolerancePercent;
  }

  const deltaPercent = (Math.abs(left - right) / Math.abs(right)) * 100;
  return deltaPercent <= tolerancePercent;
}

function fillTemplate(template, values) {
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key];
    }
    return '';
  });
}

async function queryDatabricks(sqlTemplate, runtimeConfig) {
  const sql = fillTemplate(sqlTemplate, {
    startDate: runtimeConfig.startDate,
    endDate: runtimeConfig.endDate,
    workspaceId: runtimeConfig.workspaceId,
  });

  if (!runtimeConfig.databricksHost || !runtimeConfig.databricksToken) {
    throw new Error('Missing Databricks environment variables: DATABRICKS_HOST and DATABRICKS_TOKEN are required.');
  }

  const payload = {
    statement: sql,
    warehouse_id: runtimeConfig.warehouseId,
    wait_timeout: '30s',
    on_wait_timeout: 'CONTINUE',
    disposition: 'INLINE',
    format: 'JSON_ARRAY',
  };

  const response = await fetch(`https://${runtimeConfig.databricksHost}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${runtimeConfig.databricksToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Databricks query failed (${response.status}): ${text}`);
  }

  const created = await response.json();
  let statement = created;

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const statusResponse = await fetch(`https://${runtimeConfig.databricksHost}/api/2.0/sql/statements/${created.statement_id}`, {
      headers: {
        'Authorization': `Bearer ${runtimeConfig.databricksToken}`,
      },
    });

    if (!statusResponse.ok) {
      throw new Error(`Databricks status check failed: ${statusResponse.status}`);
    }

    statement = await statusResponse.json();

    if (statement.status && ['FINISHED', 'FAILED', 'CANCELED'].includes(statement.status.state)) {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!statement.result || !statement.result.data_array) {
    throw new Error('Databricks query returned no result rows.');
  }

  if (!statement.result.data_array || statement.result.data_array.length === 0) {
    return null;
  }

  const row = statement.result.data_array[0];
  const value = row.length > 0 ? row[0] : null;
  return value;
}

async function extractUiKpiValue(page, kpi) {
  const pageText = await page.locator('body').innerText();
  const labelToken = escapeRegExp(kpi.uiLabel);

  const regexes = [
    new RegExp(`${labelToken}\\s*[:\-]?\\s*([+-]?(?:\\$)?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?%?)`, 'i'),
    new RegExp(`${labelToken}\\s+([+-]?(?:\\$)?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?%?)`, 'i'),
    new RegExp(`${labelToken}\\s*(?:\\n|\\r|\\s)+([+-]?(?:\\$)?\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?%?)`, 'i'),
  ];

  for (const regex of regexes) {
    const match = pageText.match(regex);
    if (match) {
      return match[1];
    }
  }

  const fallback = page.getByText(new RegExp(labelToken, 'i')).first();
  if (await fallback.count()) {
    const text = await fallback.textContent();
    const fallbackMatch = text && text.match(/([+-]?(?:\$)?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?)/);
    if (fallbackMatch) {
      return fallbackMatch[1];
    }
  }

  return null;
}

async function writeCsv(results) {
  const header = ['dashboard', 'kpi', 'uiLabel', 'uiValue', 'databricksValue', 'status', 'pctDifference', 'tolerancePercent', 'notes'];
  const rows = results.map(result => [
    result.dashboard,
    result.kpi,
    result.uiLabel ?? '',
    result.uiValue ?? '',
    result.databricksValue ?? '',
    result.status,
    result.pctDifference ?? '',
    String(result.tolerancePercent),
    result.notes ?? '',
  ]);

  const content = [header, ...rows]
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${content}\n`, 'utf8');
}

test.describe('Leadership KPI validation against Databricks', () => {
  test('compares UI KPI values with Databricks SQL results for each dashboard', async ({ page }) => {
    const runtimeConfig = normalizeRuntimeConfig(DEFAULT_KPI_CONFIG);
    const results = [];

    expect(runtimeConfig.databricksHost && runtimeConfig.databricksToken, 'Databricks host/token must be configured via DATABRICKS_HOST and DATABRICKS_TOKEN.').toBeTruthy();

    // Use the proper Wealth Pulse nav flow (login → Select App → sidebar) so dashboards render correctly.
    const origin = new URL(runtimeConfig.appUrl).origin;
    await loginToWealthPulse(page, origin, process.env.TEST_USER, process.env.TEST_PASS);
    await openWealthPulseApp(page);
    await selectEnvironment(page, 'dev');

    for (const dashboard of runtimeConfig.dashboards) {
      await goToLeadershipDashboard(page, dashboard.sidebarLinkText || dashboard.name);
      // Wait for React to finish rendering KPI values.
      await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

      for (const kpi of dashboard.kpis) {
        const uiValue = await extractUiKpiValue(page, kpi);

        // Skip Databricks query if none is mapped for this KPI.
        if (!kpi.dbQuery) {
          results.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            uiValue: uiValue ?? 'N/A',
            databricksValue: 'N/A',
            status: 'NO_QUERY_MAPPED',
            pctDifference: '',
            tolerancePercent: kpi.tolerancePercent ?? runtimeConfig.tolerancePercent,
            notes: 'No Databricks query mapped for this KPI.',
          });
          continue;
        }

        const dbValue = await queryDatabricks(kpi.dbQuery, runtimeConfig);
        const passed = compareNumbers(uiValue, dbValue, kpi.tolerancePercent ?? runtimeConfig.tolerancePercent);

        const left = toNumber(uiValue);
        const right = toNumber(dbValue);
        let pctDifference = '';
        if (left !== null && right !== null && right !== 0) {
          pctDifference = String(((Math.abs(left - right) / Math.abs(right)) * 100).toFixed(2));
        }

        results.push({
          dashboard: dashboard.name,
          kpi: kpi.name,
          uiLabel: kpi.uiLabel,
          uiValue: uiValue ?? 'N/A',
          databricksValue: dbValue ?? 'N/A',
          status: passed ? 'PASS' : 'FAIL',
          pctDifference,
          tolerancePercent: kpi.tolerancePercent ?? runtimeConfig.tolerancePercent,
          notes: passed ? 'Within tolerance' : 'Outside tolerance',
        });
      }
    }

    await writeCsv(results);

    const failed = results.filter(result => result.status === 'FAIL');
    if (failed.length > 0) {
      console.table(failed);
      throw new Error(`KPI validation failed for ${failed.length} metric(s). See ${REPORT_PATH}`);
    }

    console.table(results);
    expect(results.length).toBeGreaterThan(0);
    expect(failed).toHaveLength(0);
  });
});
