const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { DatabricksUtil } = require('../../src/helpers/databricks-util');
const { writeTable } = require('../../src/helpers/kpi-report-csv');
const { formatByType } = require('../../src/helpers/kpi-value-format');

const config = require('../../config/wealth-pulse/leadership-kpi-validation.config.json');

const REPORT_PATH = path.resolve(__dirname, '../../artifacts/reports/csv/leadership-kpi-databricks-values.csv');
const CONTEXT_PATH = path.resolve(__dirname, '../../artifacts/reports/json/leadership-kpi-advisor-trend-context.json');
const HEADERS = ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes'];

function readAdvisorTrendContext() {
  if (!fs.existsSync(CONTEXT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONTEXT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function buildAumTrendTableQuery(context) {
  const ids = context.advisorIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
  return `WITH latest_snapshot AS (
    SELECT MAX(snapshot_date) AS max_snapshot_date
    FROM wealth_pulse.gold.positions
),
monthly_last_snapshot AS (
    SELECT
        DATE(date_trunc('month', p.snapshot_date)) AS month,
        MAX(p.snapshot_date) AS last_snapshot_date
    FROM wealth_pulse.gold.positions p
    CROSS JOIN latest_snapshot l
    WHERE p.snapshot_date >= add_months(DATE(date_trunc('month', l.max_snapshot_date)), -11)
    GROUP BY DATE(date_trunc('month', p.snapshot_date))
)
SELECT
    m.month,
    fa.investment_professional_number AS advisor_id,
    SUM(ABS(fp.amount)) AS aum
FROM monthly_last_snapshot m
JOIN wealth_pulse.gold.positions fp
    ON fp.snapshot_date = m.last_snapshot_date
JOIN wealth_pulse.gold.financial_account fa
    ON fp.financial_account_id = fa.financial_account_id
WHERE fa.account_status_indicator = 'O'
  AND fa.is_active = 1
  AND fa.investment_professional_number IN (${ids})
GROUP BY m.month, fa.investment_professional_number`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toMonthLabel(dateValue) {
  const date = new Date(dateValue);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function buildTop4AdvisorGrowthQuery(context) {
  const ids = context.top4AdvisorIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
  return `WITH latest_snapshot AS (
    SELECT MAX(snapshot_date) AS end_date
    FROM wealth_pulse.gold.positions
),
earliest_snapshot AS (
    SELECT MIN(snapshot_date) AS start_date
    FROM wealth_pulse.gold.positions
),
current_aum AS (
    SELECT fa.investment_professional_number, SUM(p.amount) AS aum
    FROM wealth_pulse.gold.positions p
    JOIN wealth_pulse.gold.financial_account fa
        ON p.financial_account_id = fa.financial_account_id
    CROSS JOIN latest_snapshot ls
    WHERE p.snapshot_date = ls.end_date
      AND fa.investment_professional_number IN (${ids})
    GROUP BY fa.investment_professional_number
),
prior_aum AS (
    SELECT fa.investment_professional_number, SUM(p.amount) AS aum
    FROM wealth_pulse.gold.positions p
    JOIN wealth_pulse.gold.financial_account fa
        ON p.financial_account_id = fa.financial_account_id
    CROSS JOIN earliest_snapshot es
    WHERE p.snapshot_date = es.start_date
      AND fa.investment_professional_number IN (${ids})
    GROUP BY fa.investment_professional_number
)
SELECT
    c.investment_professional_number AS advisor_id,
    ROUND((c.aum - COALESCE(p.aum, 0)) / NULLIF(p.aum, 0) * 100, 2) AS ytd_growth_pct
FROM current_aum c
LEFT JOIN prior_aum p
    ON c.investment_professional_number = p.investment_professional_number`;
}

function buildTop4AdvisorRetentionQuery(context) {
  const ids = context.top4AdvisorIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(', ');
  return `WITH latest_snapshot AS (
    SELECT MAX(snapshot_date) AS end_date
    FROM wealth_pulse.gold.positions
),
beginning_snapshot AS (
    SELECT MAX(snapshot_date) AS start_date
    FROM wealth_pulse.gold.positions
    WHERE snapshot_date < (SELECT DATE_TRUNC('quarter', end_date) FROM latest_snapshot)
),
beginning_aum AS (
    SELECT fa.investment_professional_number, SUM(p.amount) AS beginning_aum
    FROM wealth_pulse.gold.positions p
    JOIN wealth_pulse.gold.financial_account fa
        ON p.financial_account_id = fa.financial_account_id
    CROSS JOIN beginning_snapshot bs
    WHERE p.snapshot_date = bs.start_date
      AND fa.investment_professional_number IN (${ids})
    GROUP BY fa.investment_professional_number
),
outflows AS (
    SELECT fa.investment_professional_number, SUM(ABS(t.amount)) AS outflow_amount
    FROM wealth_pulse.gold.transactions t
    JOIN wealth_pulse.gold.financial_account fa
        ON t.financial_account_id = fa.financial_account_id
    CROSS JOIN latest_snapshot ls
    CROSS JOIN beginning_snapshot bs
    WHERE CAST(t.transaction_date AS DATE) BETWEEN bs.start_date AND ls.end_date
      AND t.transaction_code IN ('DISTRIBUTION', 'TRANSFER_OUT', 'SFF', 'PCC')
      AND fa.investment_professional_number IN (${ids})
    GROUP BY fa.investment_professional_number
)
SELECT
    ba.investment_professional_number AS advisor_id,
    ROUND((ba.beginning_aum - COALESCE(o.outflow_amount, 0)) / NULLIF(ba.beginning_aum, 0) * 100, 2) AS retention_pct
FROM beginning_aum ba
LEFT JOIN outflows o
    ON ba.investment_professional_number = o.investment_professional_number`;
}

function sanitizeMessage(value, maxLen = 300) {
  const withoutSqlBody = String(value ?? '').split('== SQL ==')[0];
  const compact = withoutSqlBody.replace(/\s+/g, ' ').trim();
  return compact.length <= maxLen ? compact : `${compact.slice(0, maxLen)} ...`;
}

function extractScalar(rows, kpi) {
  if (!rows || rows.length === 0) return null;

  if (kpi.aggregate === 'sum' && kpi.resultField) {
    const total = rows.reduce((sum, row) => sum + (Number(row[kpi.resultField]) || 0), 0);
    return total;
  }

  const firstRow = rows[0];
  if (kpi.resultField) {
    const raw = firstRow[kpi.resultField];
    return raw === null || raw === undefined ? null : Number(raw);
  }

  const keys = Object.keys(firstRow);
  if (keys.length === 1) {
    const raw = firstRow[keys[0]];
    return raw === null || raw === undefined ? null : Number(raw);
  }

  return null;
}

test.describe('Leadership KPI extraction from Databricks API', () => {
  test('runs each configured KPI query and writes Databricks values to a dedicated CSV', async () => {
    // Allow enough time for the SQL warehouse cold-start plus all queries.
    test.setTimeout(600000);

    expect(process.env.DATABRICKS_HOST, 'Set DATABRICKS_HOST in .env').toBeTruthy();
    expect(process.env.DATABRICKS_PATH, 'Set DATABRICKS_PATH in .env').toBeTruthy();
    expect(process.env.DATABRICKS_TOKEN, 'Set DATABRICKS_TOKEN in .env').toBeTruthy();

    const db = new DatabricksUtil();
    const rows = [];

    try {
      console.log(`[DB] Connecting to ${process.env.DATABRICKS_HOST}${process.env.DATABRICKS_PATH}...`);
      await db.connect();
      await db.executeQuery('SELECT 1'); // warm up the warehouse
      console.log('[DB] Connected and warehouse warm.');

      // Iterate dashboards/KPIs in the same config order as the UI script so rows align 1:1.
      for (const dashboard of config.dashboards) {
        for (const kpi of dashboard.kpis) {
          if (kpi.specialHandler === 'aumTrendTable') {
            const context = readAdvisorTrendContext();
            if (!context?.advisorIds?.length || !context?.monthLabels?.length) {
              rows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: 'N/A',
                valueFormat: kpi.valueFormat,
                status: 'DB_CONTEXT_MISSING',
                notes: 'Run the UI extraction script first to capture the charted advisor list and months.',
              });
              continue;
            }

            console.log(`[DB] Running: [${dashboard.name}] ${kpi.name} (scoped to ${context.advisorIds.length} advisors, ${context.monthLabels.length} months)`);
            try {
              const queryRows = await db.executeQuery(buildAumTrendTableQuery(context));
              const monthLabelSet = new Set(context.monthLabels);
              const tableRows = queryRows
                .map((row) => ({
                  advisorId: row.advisor_id,
                  month: toMonthLabel(row.month),
                  aum: Number(row.aum),
                }))
                .filter((row) => monthLabelSet.has(row.month) && context.advisorIds.includes(row.advisorId));

              rows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: JSON.stringify(tableRows),
                valueFormat: kpi.valueFormat,
                status: 'DB_CAPTURED',
                notes: `${tableRows.length} data points for the same ${context.advisorIds.length} advisors and ${context.monthLabels.length} months as the UI.`,
              });
            } catch (err) {
              console.error(`[DB] ERROR on "${kpi.name}": ${err.message}`);
              rows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: 'N/A',
                valueFormat: kpi.valueFormat,
                status: 'DB_ERROR',
                notes: `ERROR: ${sanitizeMessage(err.message)}`,
              });
            }
            continue;
          }

          if (kpi.specialHandler === 'top4AdvisorMetrics') {
            const context = readAdvisorTrendContext();
            if (!context?.top4AdvisorIds?.length) {
              rows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: 'N/A',
                valueFormat: kpi.valueFormat,
                status: 'DB_CONTEXT_MISSING',
                notes: 'No advisor cohort captured from UI (top4AdvisorIds is empty).',
              });
              continue;
            }

            console.log(`[DB] Running: [${dashboard.name}] ${kpi.name} (scoped to ${context.top4AdvisorIds.length} advisors)`);
            try {
              const [growthRows, retentionRows] = await Promise.all([
                db.executeQuery(buildTop4AdvisorGrowthQuery(context)),
                db.executeQuery(buildTop4AdvisorRetentionQuery(context)),
              ]);
              const retentionById = new Map(retentionRows.map((r) => [r.advisor_id, Number(r.retention_pct)]));
              const tableRows = growthRows.map((r) => ({
                advisorId: r.advisor_id,
                ytdGrowthPct: r.ytd_growth_pct === null ? null : Number(r.ytd_growth_pct),
                retentionPct: retentionById.has(r.advisor_id) ? retentionById.get(r.advisor_id) : null,
              }));

              rows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: JSON.stringify(tableRows),
                valueFormat: kpi.valueFormat,
                status: 'DB_CAPTURED',
                notes: `${tableRows.length} advisors matching the UI's Top 4 by AUM cohort.`,
              });
            } catch (err) {
              console.error(`[DB] ERROR on "${kpi.name}": ${err.message}`);
              rows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: 'N/A',
                valueFormat: kpi.valueFormat,
                status: 'DB_ERROR',
                notes: `ERROR: ${sanitizeMessage(err.message)}`,
              });
            }
            continue;
          }

          if (kpi.isChartSection || !kpi.dbQuery) {
            rows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'N/A',
              valueFormat: kpi.valueFormat || 'chart',
              status: kpi.isChartSection ? 'DB_NOT_APPLICABLE' : 'NO_QUERY_MAPPED',
              notes: kpi.isChartSection
                ? 'Chart/table KPI — not a single comparable scalar.'
                : 'No Databricks query mapped yet for this KPI.',
            });
            continue;
          }

          console.log(`[DB] Running: [${dashboard.name}] ${kpi.name}`);
          try {
            const queryRows = await db.executeQuery(kpi.dbQuery);
            const scalar = extractScalar(queryRows, kpi);
            const value = formatByType(kpi.valueFormat, scalar, kpi.signed);

            rows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value,
              valueFormat: kpi.valueFormat || 'unknown',
              status: value === 'N/A' ? 'DB_NO_ROWS' : 'DB_CAPTURED',
              notes: `Captured from Databricks API at ${new Date().toISOString()}`,
            });
          } catch (err) {
            console.error(`[DB] ERROR on "${kpi.name}": ${err.message}`);
            rows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'N/A',
              valueFormat: kpi.valueFormat || 'unknown',
              status: 'DB_ERROR',
              notes: `ERROR: ${sanitizeMessage(err.message)}`,
            });
          }
        }
      }

      const writtenPath = writeTable(REPORT_PATH, HEADERS, rows);
      console.log(`[DB] Databricks values written to ${writtenPath} (${rows.length} KPI rows)`);
    } finally {
      await db.close();
      console.log('[DB] Connection closed.');
    }
  });
});
