// Compares UI-captured KPI values against Databricks-computed KPI values.
// Reads the two dedicated CSVs (same dashboard/kpi keys, same order),
// joins by key, computes a percentage difference, and produces a CSV +
// a self-contained HTML report for visual pass/fail review.

const fs = require('fs');
const path = require('path');
const { readTable, writeTable } = require('../../helpers/kpi-report-csv');
const { parseDisplayValue } = require('../../helpers/kpi-value-format');
const { GOOGLE_SANS_FONT_LINKS, GOOGLE_SANS_FONT_FAMILY } = require('../../reporters/google-sans');

const config = require('../../../config/wealth-pulse/leadership-kpi-validation.config.json');

const UI_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/leadership-kpi-ui-values.csv');
const DB_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/leadership-kpi-databricks-values.csv');
const OUT_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/leadership-kpi-comparison.csv');
const OUT_HTML_PATH = path.resolve(__dirname, '../../../artifacts/reports/html/leadership-kpi-comparison-report.html');
const FAVICON_PATH = path.resolve(__dirname, '../../../favicon.svg');

const CSV_HEADERS = ['dashboard', 'kpi', 'uiLabel', 'uiValue', 'databricksValue', 'pctDifference', 'tolerancePercent', 'result', 'notes', 'rowDetails'];

function toleranceFor(dashboard, kpi) {
  const dash = config.dashboards.find((d) => d.name === dashboard);
  const kpiCfg = dash && dash.kpis.find((k) => k.name === kpi);
  return kpiCfg?.tolerancePercent ?? config.tolerancePercent ?? 0.5;
}

function keyOf(row) {
  return `${row.dashboard}::${row.kpi}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function summarize(results) {
  const summary = { total: results.length, PASS: 0, FAIL: 0, SKIPPED: 0, MISSING: 0, NOT_COMPARABLE: 0 };
  for (const row of results) {
    if (summary[row.result] !== undefined) summary[row.result] += 1;
  }
  return summary;
}

function compareTableValues(uiJson, dbJson, kpi, tolerancePercent) {
  let uiRows = null;
  let dbRows = null;
  try {
    uiRows = JSON.parse(uiJson);
  } catch {}
  try {
    dbRows = JSON.parse(dbJson);
  } catch {}

  if (!Array.isArray(uiRows) || !Array.isArray(dbRows)) {
    return {
      overallResult: 'NOT_COMPARABLE',
      notes: 'Could not parse one or both sides as JSON table data (N/A or missing).',
      rowResults: [],
    };
  }

  const matchKeys = kpi.matchKeys || [];
  const compareFields = kpi.compareFields || [];

  const dbByKey = new Map();
  dbRows.forEach((r) => {
    const key = matchKeys.map((k) => String(r[k])).join('|');
    dbByKey.set(key, r);
  });

  const uiByKey = new Map();
  uiRows.forEach((r) => {
    const key = matchKeys.map((k) => String(r[k])).join('|');
    uiByKey.set(key, r);
  });

  const allKeys = new Set([...uiByKey.keys(), ...dbByKey.keys()]);
  const rowResults = [];

  let rowsPassed = 0;
  let rowsFailed = 0;
  let rowsMissing = 0;

  for (const key of allKeys) {
    const uiRow = uiByKey.get(key);
    const dbRow = dbByKey.get(key);

    if (!uiRow || !dbRow) {
      rowsMissing += 1;
      rowResults.push({
        key,
        status: 'MISSING',
        fields: compareFields.map((f) => ({
          field: f,
          uiValue: uiRow ? uiRow[f] : 'MISSING',
          dbValue: dbRow ? dbRow[f] : 'MISSING',
        })),
      });
      continue;
    }

    let allFieldsPass = true;
    const fieldResults = compareFields.map((field) => {
      const uiVal = uiRow[field];
      const dbVal = dbRow[field];

      if (uiVal === null || dbVal === null || uiVal === undefined || dbVal === undefined) {
        if (uiVal === dbVal) return { field, uiValue: uiVal, dbValue: dbVal, pctDifference: 0, status: 'PASS' };
        allFieldsPass = false;
        return { field, uiValue: uiVal, dbValue: dbVal, status: 'FAIL' };
      }

      const numUi = Number(uiVal);
      const numDb = Number(dbVal);

      if (isNaN(numUi) || isNaN(numDb)) {
        const match = String(uiVal) === String(dbVal);
        if (!match) allFieldsPass = false;
        return { field, uiValue: uiVal, dbValue: dbVal, status: match ? 'PASS' : 'FAIL' };
      }

      if (numUi === 0 && numDb === 0) {
        return { field, uiValue: numUi, dbValue: numDb, pctDifference: 0, status: 'PASS' };
      }

      const denom = Math.abs(numDb) || Math.abs(numUi) || 1;
      const pctDiff = (Math.abs(numUi - numDb) / denom) * 100;
      const pass = pctDiff <= tolerancePercent;
      if (!pass) allFieldsPass = false;

      return {
        field,
        uiValue: numUi,
        dbValue: numDb,
        pctDifference: Number(pctDiff.toFixed(2)),
        status: pass ? 'PASS' : 'FAIL',
      };
    });

    if (allFieldsPass) {
      rowsPassed += 1;
    } else {
      rowsFailed += 1;
    }

    rowResults.push({
      key,
      status: allFieldsPass ? 'PASS' : 'FAIL',
      fields: fieldResults,
    });
  }

  let overallResult = 'PASS';
  if (rowsFailed > 0) overallResult = 'FAIL';
  else if (rowsMissing > 0) overallResult = 'FAIL';

  return {
    overallResult,
    notes: `${rowsPassed} passed, ${rowsFailed} failed, ${rowsMissing} missing out of ${allKeys.size} rows.`,
    rowResults,
  };
}

function buildRowDetailTable(rowDetailsJson) {
  if (!rowDetailsJson) return '';
  let rowResults;
  try {
    rowResults = JSON.parse(rowDetailsJson);
  } catch {
    return '';
  }
  if (!Array.isArray(rowResults) || !rowResults.length) return '';

  const failingOrMissing = rowResults.filter((r) => r.status !== 'PASS');
  const toShow = failingOrMissing.length ? failingOrMissing : rowResults;

  const fieldNames = toShow[0]?.fields ? toShow[0].fields.map((f) => f.field) : [];
  const headerCells = ['Key', 'Status', ...fieldNames.flatMap((f) => [`${f} (UI)`, `${f} (Databricks)`, `${f} diff %`])]
    .map((h) => `<th style="background:var(--md-sys-color-surface-container); color:var(--md-sys-color-on-surface-variant); font-size:11px; padding:8px 12px; border-bottom:1px solid var(--md-sys-color-outline-variant);">${escapeHtml(h)}</th>`)
    .join('');

  const bodyRows = toShow.map((r) => {
    const isPass = r.status === 'PASS';
    const badgeClass = isPass ? 'badge-PASS' : 'badge-FAIL';
    const fieldCells = (r.fields || [])
      .flatMap((f) => [escapeHtml(String(f.uiValue ?? '')), escapeHtml(String(f.dbValue ?? '')), f.pctDifference === undefined ? '—' : `${escapeHtml(String(f.pctDifference))}%`])
      .map((v) => `<td style="padding:8px 12px; font-size:12px; border-bottom:1px solid var(--md-sys-color-outline-variant);">${v}</td>`)
      .join('');
    return `<tr style="background:var(--md-sys-color-surface-container-lowest);"><td style="padding:8px 12px; font-size:12px; border-bottom:1px solid var(--md-sys-color-outline-variant);">${escapeHtml(r.key)}</td><td style="padding:8px 12px; border-bottom:1px solid var(--md-sys-color-outline-variant);"><span class="badge ${badgeClass}" style="font-size:10px; padding:3px 8px;">${escapeHtml(r.status)}</span></td>${fieldCells}</tr>`;
  }).join('');

  const summaryLine = failingOrMissing.length
    ? `Showing ${failingOrMissing.length} of ${rowResults.length} detailed rows that did not match`
    : `All ${rowResults.length} detailed rows matched (0% difference)`;

  return `
    <tr class="detail-row" style="display:none">
      <td colspan="8" style="padding: 16px 20px; background: var(--md-sys-color-surface-container-lowest);">
        <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 10px; font-weight: 600;">${escapeHtml(summaryLine)}</div>
        <table style="width:100%; border-collapse:collapse; margin:0;">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </td>
    </tr>`;
}

function compareRows() {
  const uiRows = readTable(UI_CSV_PATH, ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes']);
  const dbRows = readTable(DB_CSV_PATH, ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes']);

  const dbByKey = new Map(dbRows.map((row) => [keyOf(row), row]));

  const results = [];
  for (const dashboard of config.dashboards) {
    for (const kpi of dashboard.kpis) {
      const key = `${dashboard.name}::${kpi.name}`;
      const uiRow = uiRows.find((row) => keyOf(row) === key) || null;
      const dbRow = dbByKey.get(key) || null;

      const uiValue = uiRow ? uiRow.value : 'MISSING';
      const databricksValue = dbRow ? dbRow.value : 'MISSING';
      const tolerancePercent = toleranceFor(dashboard.name, kpi.name);

      if (kpi.isChartSection) {
        results.push({
          dashboard: dashboard.name,
          kpi: kpi.name,
          uiLabel: kpi.uiLabel,
          uiValue,
          databricksValue,
          pctDifference: '',
          tolerancePercent,
          result: 'SKIPPED',
          notes: 'Chart/table KPI — not a single comparable scalar.',
          rowDetails: '',
        });
        continue;
      }

      if (!uiRow || !dbRow) {
        results.push({
          dashboard: dashboard.name,
          kpi: kpi.name,
          uiLabel: kpi.uiLabel,
          uiValue,
          databricksValue,
          pctDifference: '',
          tolerancePercent,
          result: 'MISSING',
          notes: !uiRow ? 'UI row missing — rerun the UI extraction script.' : 'Databricks row missing — rerun the Databricks extraction script.',
          rowDetails: '',
        });
        continue;
      }

      if (kpi.valueFormat === 'table') {
        const tableResult = compareTableValues(uiValue, databricksValue, kpi, tolerancePercent);
        let uiCount = 'N/A';
        let dbCount = 'N/A';
        try { uiCount = `${JSON.parse(uiValue).length} rows`; } catch {}
        try { dbCount = `${JSON.parse(databricksValue).length} rows`; } catch {}
        results.push({
          dashboard: dashboard.name,
          kpi: kpi.name,
          uiLabel: kpi.uiLabel,
          uiValue: uiCount,
          databricksValue: dbCount,
          pctDifference: '',
          tolerancePercent,
          result: tableResult.overallResult,
          notes: tableResult.notes,
          rowDetails: JSON.stringify(tableResult.rowResults),
        });
        continue;
      }

      const uiNum = parseDisplayValue(uiValue);
      const dbNum = parseDisplayValue(databricksValue);

      if (uiNum === null || dbNum === null) {
        if (uiValue && databricksValue && uiValue.trim().toUpperCase() === databricksValue.trim().toUpperCase()) {
          results.push({
            dashboard: dashboard.name,
            kpi: kpi.name,
            uiLabel: kpi.uiLabel,
            uiValue,
            databricksValue,
            pctDifference: '0.00',
            tolerancePercent,
            result: 'PASS',
            notes: 'Both UI and Databricks values match exactly.',
            rowDetails: '',
          });
          continue;
        }
        results.push({
          dashboard: dashboard.name,
          kpi: kpi.name,
          uiLabel: kpi.uiLabel,
          uiValue,
          databricksValue,
          pctDifference: '',
          tolerancePercent,
          result: 'NOT_COMPARABLE',
          notes: 'One or both values could not be parsed as a number (N/A, error, or unrecognized format).',
          rowDetails: '',
        });
        continue;
      }

      const base = Math.max(Math.abs(uiNum), Math.abs(dbNum), 1e-9);
      const pctDifference = (Math.abs(uiNum - dbNum) / base) * 100;
      const pass = pctDifference <= tolerancePercent;

      results.push({
        dashboard: dashboard.name,
        kpi: kpi.name,
        uiLabel: kpi.uiLabel,
        uiValue,
        databricksValue,
        pctDifference: pctDifference.toFixed(2),
        tolerancePercent,
        result: pass ? 'PASS' : 'FAIL',
        notes: '',
        rowDetails: '',
      });
    }
  }

  return results;
}

function buildHtmlReport(results, summary) {
  const generatedAt = new Date().toISOString();
  const rowsHtml = results.map((row, index) => {
    const hasDetails = Boolean(row.rowDetails && row.rowDetails !== '[]' && row.rowDetails !== '""');
    const toggle = hasDetails ? `<button class="toggle-btn" data-target="detail-${index}">&#9654; Details</button>` : '';
    const mainRow = `
      <tr class="main-row" data-result="${row.result}">
        <td><strong>${escapeHtml(row.dashboard)}</strong></td>
        <td>${escapeHtml(row.uiLabel || row.kpi)} ${toggle}</td>
        <td><span class="val-ui">${escapeHtml(row.uiValue)}</span></td>
        <td><span class="val-db">${escapeHtml(row.databricksValue)}</span></td>
        <td>${row.pctDifference === '' ? '<span class="muted">-</span>' : `${escapeHtml(row.pctDifference)}%`}</td>
        <td>${escapeHtml(row.tolerancePercent)}%</td>
        <td><span class="badge badge-${row.result}">${escapeHtml(row.result)}</span></td>
        <td style="font-size:12px; color:var(--md-sys-color-on-surface-variant);">${escapeHtml(row.notes)}</td>
      </tr>`;
    const detailRow = hasDetails
      ? buildRowDetailTable(row.rowDetails).replace('class="detail-row"', `class="detail-row" id="detail-${index}"`)
      : '';
    return mainRow + detailRow;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  ${GOOGLE_SANS_FONT_LINKS}
  <title>Wealth Pulse Leadership Portal KPI Validation Report</title>
  <style>
    :root {
      --md-sys-color-background: #0f1419;
      --md-sys-color-surface: #1a222c;
      --md-sys-color-surface-container-lowest: #0d1217;
      --md-sys-color-surface-container-low: #151c24;
      --md-sys-color-surface-container: #1c2430;
      --md-sys-color-surface-container-high: #232c3a;
      --md-sys-color-surface-container-highest: #2a3444;
      --md-sys-color-on-surface: #e6eaf0;
      --md-sys-color-on-surface-variant: #a8b3c4;
      --md-sys-color-outline: #3d4a5c;
      --md-sys-color-outline-variant: #2c3646;

      --primary: #7dd3fc;
      --primary-container: #0c4a6e;
      --on-primary-container: #e0f2fe;
      --secondary: #86efac;
      --secondary-container: #14532d;
      --on-secondary-container: #dcfce7;
      --tertiary: #c4b5fd;
      --tertiary-container: #4c1d95;
      --error: #fca5a5;
      --error-container: #7f1d1d;
      --on-error-container: #fee2e2;
      --warning: #fde68a;
      --warning-container: #78350f;
      --on-warning-container: #fef3c7;

      --card-pass: #132a1f;
      --card-pass-border: #166534;
      --card-fail: #2a1515;
      --card-fail-border: #991b1b;
      --card-warn: #2a2210;
      --card-warn-border: #854d0e;
    }

    * { box-sizing: border-box; }
    button, input, select, textarea { font-family: inherit; }

    body {
      zoom: 0.8;
      font-family: ${GOOGLE_SANS_FONT_FAMILY};
      margin: 0;
      padding: 28px 24px 60px;
      background: var(--md-sys-color-background);
      color: var(--md-sys-color-on-surface);
      line-height: 1.5;
      min-height: 100vh;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 50% at 20% -10%, rgba(56, 189, 248, 0.07), transparent),
        radial-gradient(ellipse 60% 40% at 90% 10%, rgba(134, 239, 172, 0.05), transparent),
        radial-gradient(ellipse 50% 30% at 50% 100%, rgba(196, 181, 253, 0.04), transparent);
      pointer-events: none;
      z-index: -1;
    }

    .header {
      margin-bottom: 28px;
      padding: 0 4px 20px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    h1 {
      font-size: 26px;
      font-weight: 600;
      letter-spacing: -0.3px;
      color: var(--md-sys-color-on-surface);
      margin: 0 0 6px 0;
    }

    .timestamp {
      color: var(--md-sys-color-on-surface-variant);
      font-size: 13px;
      font-weight: 400;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 14px;
      margin-bottom: 32px;
    }

    .summary-card {
      background: var(--md-sys-color-surface-container);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 24px;
      padding: 18px 20px;
      position: relative;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .summary-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    }

    .summary-card .title {
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--md-sys-color-on-surface-variant);
      margin-bottom: 8px;
    }

    .summary-card .value {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .summary-card.pass {
      background: var(--card-pass);
      border-color: var(--card-pass-border);
    }
    .summary-card.pass .value { color: var(--secondary); }

    .summary-card.fail {
      background: var(--card-fail);
      border-color: var(--card-fail-border);
    }
    .summary-card.fail .value { color: var(--error); }

    .summary-card.warn {
      background: var(--card-warn);
      border-color: var(--card-warn-border);
    }
    .summary-card.warn .value { color: var(--warning); }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 28px;
      align-items: center;
    }

    .controls input,
    .controls select {
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      color: var(--md-sys-color-on-surface);
      padding: 10px 16px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      outline: none;
      transition: border-color 0.2s, background 0.2s;
    }

    .controls input:focus,
    .controls select:focus {
      border-color: var(--primary);
      background: var(--md-sys-color-surface-container-highest);
    }

    .controls input::placeholder {
      color: var(--md-sys-color-on-surface-variant);
    }

    .controls select {
      cursor: pointer;
      appearance: none;
      padding-right: 36px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%23a8b3c4' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      background: var(--md-sys-color-surface-container);
      border-radius: 24px;
      overflow: hidden;
      margin-bottom: 36px;
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    th, td {
      padding: 14px 18px;
      text-align: left;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      font-size: 13.5px;
    }

    th {
      background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface-variant);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.6px;
    }

    tr:last-child td { border-bottom: none; }

    tr.main-row:hover td {
      background: var(--md-sys-color-surface-container-high);
    }

    .val-ui {
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
    }

    .val-db {
      font-weight: 600;
      color: var(--primary);
    }

    .muted {
      color: var(--md-sys-color-on-surface-variant);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 5px 12px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.4px;
    }

    .badge-PASS {
      background: var(--secondary-container);
      color: var(--secondary);
      border: 1px solid #166534;
    }

    .badge-FAIL {
      background: var(--error-container);
      color: var(--error);
      border: 1px solid #b91c1c;
    }

    .badge-NOT_COMPARABLE {
      background: var(--warning-container);
      color: var(--warning);
      border: 1px solid #a16207;
    }

    .badge-SKIPPED,
    .badge-MISSING {
      background: var(--md-sys-color-surface-container-highest);
      color: var(--md-sys-color-on-surface-variant);
      border: 1px solid var(--md-sys-color-outline);
    }

    .toggle-btn {
      margin-left: 8px;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid var(--md-sys-color-outline-variant);
      background: var(--md-sys-color-surface-container-high);
      color: var(--primary);
      cursor: pointer;
      font-weight: 600;
      transition: background 0.15s, border-color 0.15s;
    }

    .toggle-btn:hover {
      background: var(--md-sys-color-surface-container-highest);
      border-color: var(--primary);
    }

    .detail-row td {
      background: var(--md-sys-color-surface-container-lowest) !important;
    }

    .detail-row table {
      border-radius: 16px;
      margin: 0;
      border: 1px solid var(--md-sys-color-outline-variant);
    }

    .detail-row th {
      background: var(--md-sys-color-surface-container) !important;
      font-size: 10px;
      padding: 8px 12px;
    }

    .detail-row td {
      font-size: 12px;
      padding: 8px 12px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }
  </style>
</head>
<body>

  <div class="header">
    <h1>Wealth Pulse Leadership Portal KPI Validation Report</h1>
    <div class="timestamp">UI (dev) vs Databricks SQL (wealth_pulse.gold) Comparison Report — Generated ${escapeHtml(generatedAt)}</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="title">Total Validated KPIs</div>
      <div class="value">${summary.total}</div>
    </div>
    <div class="summary-card pass">
      <div class="title">Total PASS</div>
      <div class="value">${summary.PASS || 0}</div>
    </div>
    <div class="summary-card fail">
      <div class="title">Total FAIL</div>
      <div class="value">${summary.FAIL || 0}</div>
    </div>
    <div class="summary-card warn">
      <div class="title">Not Comparable / Pending</div>
      <div class="value">${(summary.MISSING || 0) + (summary.NOT_COMPARABLE || 0)}</div>
    </div>
  </div>

  <div class="controls">
    <input type="text" id="searchInput" placeholder="Search by dashboard or KPI name..." style="width: 280px; max-width: 100%;" />
    <select id="resultFilter">
      <option value="">All Results</option>
      <option value="PASS">PASS</option>
      <option value="FAIL">FAIL</option>
      <option value="NOT_COMPARABLE">NOT_COMPARABLE</option>
    </select>
  </div>

  <table id="report-table">
    <thead>
      <tr>
        <th>Dashboard</th>
        <th>KPI Name</th>
        <th>UI Value (dev)</th>
        <th>Databricks SQL Value (wealth_pulse.gold)</th>
        <th>Variance %</th>
        <th>Tolerance %</th>
        <th>Result Status</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <script>
    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const target = document.getElementById(targetId);
        if (!target) return;
        const isHidden = target.style.display === 'none' || !target.style.display;
        target.style.display = isHidden ? 'table-row' : 'none';
        btn.innerHTML = isHidden ? '&#9660; Hide Details' : '&#9654; Details';
      });
    });

    const searchInput = document.getElementById('searchInput');
    const resultFilter = document.getElementById('resultFilter');

    function filterRows() {
      const query = searchInput.value.toLowerCase().trim();
      const selectedResult = resultFilter.value;

      document.querySelectorAll('tr.main-row').forEach((row) => {
        const text = row.innerText.toLowerCase();
        const rowResult = row.getAttribute('data-result');

        const matchesQuery = !query || text.includes(query);
        const matchesResult = !selectedResult || rowResult === selectedResult;

        const isVisible = matchesQuery && matchesResult;
        row.style.display = isVisible ? '' : 'none';

        const detailBtn = row.querySelector('.toggle-btn');
        if (detailBtn) {
          const targetId = detailBtn.getAttribute('data-target');
          const target = document.getElementById(targetId);
          if (target && !isVisible) {
            target.style.display = 'none';
          }
        }
      });
    }

    searchInput.addEventListener('input', filterRows);
    resultFilter.addEventListener('change', filterRows);
  </script>
</body>
</html>`;
}

function main() {
  const results = compareRows();
  const summary = summarize(results);

  writeTable(OUT_CSV_PATH, CSV_HEADERS, results);

  const html = buildHtmlReport(results, summary);
  fs.mkdirSync(path.dirname(OUT_HTML_PATH), { recursive: true });
  fs.writeFileSync(OUT_HTML_PATH, html, 'utf8');
  fs.copyFileSync(FAVICON_PATH, path.join(path.dirname(OUT_HTML_PATH), 'favicon.svg'));

  console.log(`Comparison CSV:  ${OUT_CSV_PATH}`);
  console.log(`HTML report:     ${OUT_HTML_PATH}`);
  console.log(`Summary: ${JSON.stringify(summary)}`);

  try {
    require('./wealth-pulse-combined-compare');
  } catch (e) {}
}

main();
