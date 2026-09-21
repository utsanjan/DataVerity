const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { DatabricksUtil } = require('../../src/helpers/databricks-util');
const { REPORT_PATH, mergeKpiRows } = require('../../src/wealth-pulse/helpers/leadership-kpi-csv');

// All SQL queries live in leadership-kpi-queries.json —
// this spec is only responsible for execution + CSV reporting.
const QUERIES_PATH = path.resolve(__dirname, '../../config/wealth-pulse/leadership-kpi-queries.json');
const rawQueries = JSON.parse(fs.readFileSync(QUERIES_PATH, 'utf8'));

function sanitizeMessage(value, maxLen = 800) {
  const raw = String(value ?? '');
  const withoutSqlBody = raw.split('== SQL ==')[0];
  const compact = withoutSqlBody
    .replace(/\r\n/g, ' | ')
    .replace(/[\r\n]+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();
  if (compact.length <= maxLen) return compact;
  return `${compact.slice(0, maxLen)} ...`;
}

// Default row mapper: single-column scalar or full JSON for multi-column rows.
function genericToRow(row, rowIndex, rowCount) {
  const keys = Object.keys(row);
  const value = keys.length === 1 ? row[keys[0]] : JSON.stringify(row);
  return {
    databricksValue: value === null || value === undefined ? '' : String(value),
  };
}

function summarizeMappedRows(mappedRows) {
  if (mappedRows.length === 0) return 'NO ROWS RETURNED';
  if (mappedRows.length === 1) return sanitizeMessage(mappedRows[0].databricksValue || '');

  const preview = mappedRows
    .slice(0, 3)
    .map((row) => sanitizeMessage(row.databricksValue || '', 180))
    .join(' || ');

  return `${mappedRows.length} rows | sample: ${preview}`;
}

// Named mappers for queries that need custom field mapping.
const mappers = {
  generic: genericToRow,
  spendTrend: (row) => ({
    kpi: `${row.period ?? row.month_name ?? 'Unknown'} ${row.year_num ?? ''}`.trim(),
    uiLabel: `${row.period ?? row.month_name ?? 'Unknown'} ${row.year_num ?? ''}`.trim(),
    databricksValue: `actual: ${row.actual_spend ?? ''} | planned: ${row.planned_spend ?? ''}`,
  }),
  accountSummary: (row) => ({
    kpi: 'Latest Account Summary',
    uiLabel: 'Latest Account Summary',
    databricksValue: `latest_date: ${row.latest_date ?? ''} | account_rows: ${row.account_rows ?? ''} | total_equity: ${row.total_equity ?? ''}`,
  }),
};

// Resolve mapper function for each JSON entry.
const queries = rawQueries.map((entry) => {
  const toRow = mappers[entry.mapper] || mappers.generic;
  return { dashboard: entry.dashboard, kpi: entry.kpi, sql: entry.sql, toRow };
});

test('Run KPI SQL queries via Databricks API and write values to the shared CSV', async () => {
  test.setTimeout(600000); // 10 min — SQL warehouse cold-start can take 5-8 min

  const databricks = new DatabricksUtil(); // instance — NOT a static call
  const updates = [];

  try {
    await test.step('Connect and warm up warehouse', async () => {
      console.log('[DB] Connecting...');
      await databricks.connect();
      console.log('[DB] Warming up warehouse...');
      await databricks.executeQuery('SELECT 1'); // lightweight ping to start warehouse
      console.log('[DB] Warehouse is warm. Starting KPI queries...');
    });

    await test.step('Execute each KPI query and collect Databricks values', async () => {
      for (const q of queries) {
        if (!q.sql || q.sql.trim() === '-') {
          updates.push({
            dashboard: q.dashboard,
            kpi: q.kpi || q.dashboard,
            databricksValue: 'NO SQL DEFINED',
            status: 'NO_QUERY_MAPPED',
            notes: `Captured from Databricks API at ${new Date().toISOString()}`,
          });
          continue;
        }

        try {
          console.log(`[DB] Running: [${q.dashboard}] ${q.kpi || ''}`);
          const result = await databricks.executeQuery(q.sql); // instance method
          const rows = Array.isArray(result) ? result : (result && result.rows) || [];

          if (rows.length === 0) {
            updates.push({
              dashboard: q.dashboard,
              kpi: q.kpi || q.dashboard,
              databricksValue: 'NO ROWS RETURNED',
              status: 'DB_NO_ROWS',
              notes: `Captured from Databricks API at ${new Date().toISOString()}`,
            });
            continue;
          }

          const mappedRows = rows.map((row, idx) => q.toRow(row, idx, rows.length));
          updates.push({
            dashboard: q.dashboard,
            kpi: q.kpi || q.dashboard,
            uiLabel: mappedRows[0].uiLabel,
            databricksValue: summarizeMappedRows(mappedRows),
            status: 'DB_CAPTURED',
            notes: `Captured from Databricks API at ${new Date().toISOString()} | sourceRows=${rows.length}`,
          });
        } catch (err) {
          console.error(`[DB] ERROR on "${q.kpi}": ${err.message}`);
          updates.push({
            dashboard:       q.dashboard,
            kpi:             q.kpi || q.dashboard,
            databricksValue: `ERROR: ${sanitizeMessage(err.message)}`,
            status: 'DB_ERROR',
            notes: `Captured from Databricks API at ${new Date().toISOString()}`,
          });
        }
      }
    });

    await test.step('Merge Databricks values into the shared CSV', async () => {
      mergeKpiRows(updates);
      console.log(`[DB] Wrote ${updates.length} rows to ${REPORT_PATH}`);
    });

  } finally {
    await databricks.close();
    console.log('[DB] Connection closed.');
  }
});
