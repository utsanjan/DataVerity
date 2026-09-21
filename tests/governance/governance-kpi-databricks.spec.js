const { test } = require('@playwright/test');
const { DatabricksUtil } = require('../../src/helpers/databricks-util');
const config = require('../../config/governance/governance-validation.config.json');
const queries = require('../../config/governance/governance-kpi-queries.json');
const { templateSql, writeDbRows } = require('../../src/governance/helpers/governance-validation');

test.describe('Governance KPI extraction from Databricks API', () => {
  test('executes each configured governance KPI query and writes raw source values', async () => {
    test.setTimeout(300000);

    const db = new DatabricksUtil({
      workspaceUrl: process.env.DATABRICKS_HOST,
      token: process.env.DATABRICKS_TOKEN,
      warehouseId: process.env.DATABRICKS_HTTP_PATH
        ? process.env.DATABRICKS_HTTP_PATH.split('/').pop()
        : undefined,
    });

    console.log('[DB Governance] Connecting to Databricks...');
    await db.connect();
    console.log('[DB Governance] Connected.');

    const capturedRows = [];
    const queryErrors = [];

    try {
      for (const queryDef of queries) {
        const sql = templateSql(queryDef.sql, config);
        try {
          console.log(`[DB Governance] Running query: ${queryDef.label} (${queryDef.id})`);
          const rows = await db.executeQuery(sql);

          let valStr = 'N/A';
          if (rows && rows.length > 0) {
            valStr = JSON.stringify(rows);
          }

          capturedRows.push({
            dashboard: 'Databricks System Query',
            kpi: queryDef.label,
            queryId: queryDef.id,
            uiValue: valStr,
            format: queryDef.format,
            status: rows && rows.length > 0 ? 'CAPTURED' : 'EMPTY',
            notes: `Executed via Databricks API at ${new Date().toISOString()}`,
          });
        } catch (err) {
          console.error(`[DB Governance] Query error for ${queryDef.label}: ${err.message}`);
          queryErrors.push(`${queryDef.id}: ${err.message}`);
          capturedRows.push({
            dashboard: 'Databricks System Query',
            kpi: queryDef.label,
            queryId: queryDef.id,
            uiValue: 'ERROR',
            format: queryDef.format,
            status: 'ERROR',
            notes: err.message,
          });
        }
      }
    } finally {
      await db.close();
      console.log('[DB Governance] Connection closed.');
    }

    writeDbRows(capturedRows);
    console.log(`[DB Governance] Wrote ${capturedRows.length} Databricks query rows.`);

    if (queryErrors.length) {
      throw new Error(`Databricks KPI query failures:\n${queryErrors.join('\n')}`);
    }
  });
});