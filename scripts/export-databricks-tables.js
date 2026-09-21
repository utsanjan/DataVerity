/**
 * export-databricks-tables.js
 *
 * Exports full tables from wealth_pulse.bronze to .xlsx files.
 * Uses paginated fetchChunk() + ExcelJS streaming writer — no row limit, no OOM.
 *
 * Run:
 *   node --max-old-space-size=8192 scripts/export-databricks-tables.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { DBSQLClient } = require('@databricks/sql');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DB_HOST = process.env.DATABRICKS_HOST;
const DB_PATH = process.env.DATABRICKS_PATH;
const DB_TOKEN = process.env.DATABRICKS_TOKEN;

const CATALOG = 'wealth_pulse';
const SCHEMA = 'bronze';
const OUTPUT_ROOT = path.resolve(__dirname, '../artifacts/exports/databricks');
const CHUNK_SIZE = 2000; // rows fetched per page

// ─── TABLE MANIFEST ───────────────────────────────────────────────────────────
const MANIFEST = [
  {
    folder: '01_PersonAccount',
    tables: [
      'hldu_hldr_j',
      'account_combined_details',
      'hldu_hldr_l',
      'hldu_hldr_k',
      'hldu_hldr_n',
      'hldu_hldr_q',
    ],
  },
  {
    folder: '02_FinancialAccount',
    tables: [
      'acct_accf_4',
      'account_combined_details',
      'acct_accf_a',
      'acct_accf_b',
      'acct_accf_w',
      'household_details',
      'acct_accf_g',
      'acct_accf_5',
    ],
  },
  {
    folder: '03_Transactions',
    tables: [
      'financial_account',
      'gact_a',
      'gtde_a',
      'securities',
      'gact_b',
      'gtde_b',
      'isca_b',
      'standardize_master',
      'source_code',
    ],
  },
  {
    folder: '04_FACommission',
    tables: [
      'transaction_blotter',
      'securities',
    ],
  },
  {
    folder: '05_Securities',
    tables: [
      'security_master',
    ],
  },
  {
    folder: '06_Positions',
    tables: [
      'financial_account',
      'securities',
      'gcus_a',
      'asps_1',
      'ecmb_a',
      'security_master',
      'standardized_master',
      'potl_a',
    ],
  },
  {
    folder: '07_FinancialAdvisor',
    tables: [
      'contact_active_unique',
    ],
  },
  {
    folder: '08_AccountSummary',
    tables: [
      'financial_account',
      'gmon_a',
      'asps_1',
      'alti_a',
    ],
  },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Streams all rows from an open Databricks operation into an xlsx file.
 * Fetches CHUNK_SIZE rows at a time to avoid OOM on large tables.
 */
async function streamToXlsx(filePath, operation, tableName) {
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: false,
    useSharedStrings: false,
  });
  const ws = wb.addWorksheet('data');

  let rowsWritten = 0;
  let headerDone = false;

  while (true) {
    const chunk = await operation.fetchChunk(CHUNK_SIZE);
    if (!chunk || chunk.length === 0) break;

    for (const row of chunk) {
      if (!headerDone) {
        const headers = Object.keys(row);
        const headerRow = ws.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.commit();
        headerDone = true;
      }
      const dataRow = ws.addRow(
        Object.values(row).map(v => (v instanceof Date ? v.toISOString() : v))
      );
      dataRow.commit();
      rowsWritten++;
    }

    // Inline progress
    process.stdout.write(`\r   ↳ ${tableName.padEnd(35)} ${rowsWritten.toLocaleString()} rows...`);
  }

  if (!headerDone) {
    const r = ws.addRow(['(no rows returned)']);
    r.commit();
  }

  await ws.commit();
  await wb.commit();
  return rowsWritten;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!DB_HOST || !DB_PATH || !DB_TOKEN) {
    console.error('ERROR: Set DATABRICKS_HOST, DATABRICKS_PATH, DATABRICKS_TOKEN in .env');
    process.exit(1);
  }

  console.log('\n📦 Databricks Table Exporter  (streaming, no row limit)');
  console.log(`   Catalog: ${CATALOG}.${SCHEMA}`);
  console.log(`   Host   : ${DB_HOST}`);
  console.log(`   Output : ${OUTPUT_ROOT}\n`);

  ensureDir(OUTPUT_ROOT);

  // Connect
  const client = new DBSQLClient();
  const conn = await client.connect({ host: DB_HOST, path: DB_PATH, token: DB_TOKEN });
  const session = await conn.openSession();

  // Warmup
  process.stdout.write('⏳ Warming up warehouse...');
  const wu = await session.executeStatement('SELECT 1', { runAsync: true, waitTimeout: 300000 });
  await wu.fetchAll();
  await wu.close();
  console.log(' ✅\n');

  const summary = [];
  let totalTables = 0;
  let successCount = 0;

  for (const { folder, tables } of MANIFEST) {
    const folderPath = path.join(OUTPUT_ROOT, folder);
    ensureDir(folderPath);
    console.log(`\n📁 ${folder}`);

    for (const table of tables) {
      totalTables++;
      const filePath = path.join(folderPath, `${table}.xlsx`);
      const sql = `SELECT * FROM \`${CATALOG}\`.\`${SCHEMA}\`.\`${table}\` LIMIT 10000`;

      process.stdout.write(`   ↳ ${table.padEnd(35)} querying...\n`);

      try {
        const op = await session.executeStatement(sql, {
          runAsync: true,
          waitTimeout: 300000,
        });

        const count = await streamToXlsx(filePath, op, table);
        await op.close();

        process.stdout.write(`\r   ↳ ${table.padEnd(35)} ✅  ${count.toLocaleString()} rows\n`);
        summary.push({ folder, table, rows: count, status: 'OK' });
        successCount++;
      } catch (err) {
        const msg = err.message.split('\n')[0];
        process.stdout.write(`\r   ↳ ${table.padEnd(35)} ❌  ${msg}\n`);
        summary.push({ folder, table, rows: 0, status: `ERROR: ${msg}` });
      }
    }
  }

  await session.close();
  await conn.close();
  client.destroy();

  // Summary report
  const reportPath = path.join(OUTPUT_ROOT, '_export_summary.xlsx');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  ws.addRow(['Folder', 'Table', 'Rows Exported', 'Status']);
  ws.getRow(1).font = { bold: true };
  for (const r of summary) ws.addRow([r.folder, r.table, r.rows, r.status]);
  await wb.xlsx.writeFile(reportPath);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`✅  ${successCount}/${totalTables} tables exported`);
  console.log(`📄  Summary : ${reportPath}`);
  console.log(`${'─'.repeat(60)}\n`);
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});
