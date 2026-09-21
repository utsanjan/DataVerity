const fs = require('fs');
const path = require('path');
const { test } = require('@playwright/test');
const { DatabricksUtil } = require('../../src/helpers/databricks-util');
const { writeTable } = require('../../src/helpers/kpi-report-csv');
const { formatByType } = require('../../src/helpers/kpi-value-format');

const config = require('../../config/wealth-pulse/advisor-kpi-validation.config.json');

const REPORT_PATH = path.resolve(__dirname, '../../artifacts/reports/csv/advisor-kpi-databricks-values.csv');
const HEADERS = ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes'];

test.describe('Advisor KPI extraction from Databricks API', () => {
  test('runs each configured KPI query and writes Databricks values to a dedicated CSV', async () => {
    test.setTimeout(300000);

    const db = new DatabricksUtil({
      workspaceUrl: process.env.DATABRICKS_HOST,
      token: process.env.DATABRICKS_TOKEN,
      warehouseId: process.env.DATABRICKS_HTTP_PATH
        ? process.env.DATABRICKS_HTTP_PATH.split('/').pop()
        : undefined,
    });

    console.log('[DB] Connecting to Databricks...');
    await db.connect();
    console.log('[DB] Connected and warehouse warm.');

    const capturedRows = [];

    for (const dashboard of config.dashboards) {
      for (const kpi of dashboard.kpis) {
        if (kpi.valueFormat === 'table') {
          try {
            console.log(`[DB Table] Computing table SQL for: [${dashboard.name}] ${kpi.name}`);
            let tableSql = null;

            if (kpi.specialHandler === 'aumTrendTable') {
              tableSql = `
                WITH latest_snapshot AS (
                    SELECT MAX(snapshot_date) AS max_snapshot_date
                    FROM wealth_pulse.gold.positions
                ),
                monthly_last_snapshot AS (
                    SELECT
                        MAKE_DATE(YEAR(p.snapshot_date), MONTH(p.snapshot_date), 1) AS month,
                        MAX(p.snapshot_date) AS last_snapshot_date
                    FROM wealth_pulse.gold.positions p
                    CROSS JOIN latest_snapshot l
                    WHERE CAST(p.snapshot_date AS DATE) >= DATEADD(
                            MONTH,
                            -5,
                            MAKE_DATE(
                                YEAR(l.max_snapshot_date),
                                MONTH(l.max_snapshot_date),
                                1
                            )
                        )
                    GROUP BY
                        MAKE_DATE(YEAR(p.snapshot_date), MONTH(p.snapshot_date), 1)
                )
                SELECT
                    m.month,
                    SUM(ABS(fp.amount)) AS aum
                FROM monthly_last_snapshot m
                JOIN wealth_pulse.gold.positions fp
                    ON fp.snapshot_date = m.last_snapshot_date
                JOIN wealth_pulse.gold.financial_account fa 
                    ON fp.financial_account_id = fa.financial_account_id
                WHERE fa.account_status_indicator = 'O'
                      AND fa.is_active = 1
                GROUP BY
                    m.month
                ORDER BY
                    m.month;
              `;
            } else if (kpi.specialHandler === 'householdTable') {
              tableSql = `
                SELECT
                  hd.house_hold_name AS householdName,
                  COUNT(DISTINCT fa.financial_account_id) AS accounts,
                  ROUND(SUM(p.amount), 2) AS aum
                FROM wealth_pulse.gold.household_details hd
                JOIN wealth_pulse.gold.financial_account fa
                    ON hd.financial_account_id = fa.financial_account_id
                LEFT JOIN wealth_pulse.gold.positions p
                    ON fa.financial_account_id = p.financial_account_id
                    AND p.snapshot_date = (SELECT MAX(snapshot_date) FROM wealth_pulse.gold.positions)
                WHERE fa.account_status_indicator = 'O'
                  AND fa.is_active = 1
                GROUP BY hd.house_hold_name
                ORDER BY aum DESC;
              `;
            } else if (kpi.specialHandler === 'assetAllocationTable') {
              tableSql = `
                SELECT
                  COALESCE(s.asset_class, 'Unassigned') AS assetClass,
                  ROUND(SUM(p.amount) * 100.0 / NULLIF((SELECT SUM(amount) FROM wealth_pulse.gold.positions WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM wealth_pulse.gold.positions)), 0), 2) AS currentPct
                FROM wealth_pulse.gold.positions p
                LEFT JOIN wealth_pulse.gold.securities s
                    ON p.cusip = s.cusip
                JOIN wealth_pulse.gold.financial_account fa
                    ON p.financial_account_id = fa.financial_account_id
                WHERE p.snapshot_date = (SELECT MAX(snapshot_date) FROM wealth_pulse.gold.positions)
                  AND fa.account_status_indicator = 'O'
                  AND fa.is_active = 1
                GROUP BY COALESCE(s.asset_class, 'Unassigned')
                ORDER BY currentPct DESC;
              `;
            }

            if (tableSql) {
              let rows = await db.executeQuery(tableSql);
              if (kpi.specialHandler === 'aumTrendTable') {
                // matchKeys expects {advisorId, month} with month as a short name (e.g. "Mar"),
                // matching the UI capture's shape; the new query returns a first-of-month DATE.
                rows = rows.map((r) => ({
                  advisorId: 'ADVISOR',
                  month: new Date(r.month).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
                  aum: r.aum,
                }));
              }
              console.log(`[DB Table] ${kpi.name} computed ${rows.length} rows`);
              capturedRows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: JSON.stringify(rows),
                valueFormat: kpi.valueFormat,
                status: 'DB_CAPTURED',
                notes: `Computed ${rows.length} table rows from Databricks SQL`,
              });
            } else {
              capturedRows.push({
                dashboard: dashboard.name,
                kpi: kpi.name,
                uiLabel: kpi.uiLabel,
                value: 'N/A',
                valueFormat: kpi.valueFormat,
                status: 'NO_QUERY_MAPPED',
                notes: 'No Databricks table query mapped for this handler.',
              });
            }
          } catch (err) {
            console.error(`[DB Table] Error computing [${dashboard.name}] ${kpi.name}: ${err.message}`);
            capturedRows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'ERROR',
              valueFormat: kpi.valueFormat,
              status: 'DB_ERROR',
              notes: `Table execution error: ${err.message}`,
            });
          }
          continue;
        }

        if (!kpi.dbQuery) {
          capturedRows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: 'N/A',
            valueFormat: kpi.valueFormat || 'string',
            status: 'NO_QUERY_MAPPED',
            notes: 'No Databricks query defined for this KPI in config.',
          });
          continue;
        }

        try {
          console.log(`[DB] Running: [${dashboard.name}] ${kpi.name}`);
          const rows = await db.executeQuery(kpi.dbQuery);

          if (!rows || rows.length === 0) {
            capturedRows.push({
              dashboard: dashboard.name,
              kpi: kpi.name,
              uiLabel: kpi.uiLabel,
              value: 'N/A',
              valueFormat: kpi.valueFormat || 'string',
              status: 'DB_EMPTY_RESULT',
              notes: 'Query returned 0 rows.',
            });
            continue;
          }

          const rawValue = kpi.resultField ? rows[0][kpi.resultField] : Object.values(rows[0])[0];
          const formatted = formatByType(kpi.valueFormat, rawValue, kpi.signed);

          console.log(`[DB] Result for ${dashboard.name} -> ${kpi.name}: raw=${rawValue}, formatted=${formatted}`);

          capturedRows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: formatted,
            valueFormat: kpi.valueFormat || 'string',
            status: 'DB_CAPTURED',
            notes: `Captured from Databricks API at ${new Date().toISOString()}`,
          });
        } catch (err) {
          console.error(`[DB] Error running query for [${dashboard.name}] ${kpi.name}: ${err.message}`);
          capturedRows.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            value: 'ERROR',
            valueFormat: kpi.valueFormat || 'string',
            status: 'DB_ERROR',
            notes: `Query execution error: ${err.message}`,
          });
        }
      }
    }

    await db.close();
    console.log('[DB] Connection closed.');

    writeTable(REPORT_PATH, HEADERS, capturedRows);
    console.log(`[DB] Databricks values written to ${REPORT_PATH} (${capturedRows.length} KPI rows)`);
  });
});
