const fs = require('fs');
const path = require('path');
const { readTable, writeTable } = require('../../helpers/kpi-report-csv');
const { parseDisplayValue } = require('../../helpers/kpi-value-format');
const { GOOGLE_SANS_FONT_LINKS, GOOGLE_SANS_FONT_FAMILY } = require('../../reporters/google-sans');

const config = require('../../../config/wealth-pulse/advisor-kpi-validation.config.json');

const UI_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/advisor-kpi-ui-values.csv');
const DB_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/advisor-kpi-databricks-values.csv');
const OUT_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/advisor-kpi-comparison.csv');
const OUT_HTML_PATH = path.resolve(__dirname, '../../../artifacts/reports/html/advisor-kpi-comparison-report.html');
const FAVICON_PATH = path.resolve(__dirname, '../../../favicon.svg');

const CSV_HEADERS = ['dashboard', 'kpi', 'uiLabel', 'uiValue', 'databricksValue', 'pctDifference', 'tolerancePercent', 'result', 'notes', 'rowDetails'];

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toleranceFor(dashboard, kpi) {
  const dash = config.dashboards.find((d) => d.name === dashboard);
  const kpiCfg = dash && dash.kpis.find((k) => k.name === kpi);
  return kpiCfg?.tolerancePercent ?? config.tolerancePercent ?? 0.5;
}

function keyOf(row) {
  return `${row.dashboard}::${row.kpi}`;
}

function compareScalarValues(uiValStr, dbValStr, tolerancePercent) {
  if (uiValStr && dbValStr && uiValStr.trim().toUpperCase() === dbValStr.trim().toUpperCase()) {
    return { result: 'PASS', pctDifference: '0.00', notes: 'Both UI and Databricks values match exactly.' };
  }

  if (uiValStr === 'N/A' || dbValStr === 'N/A' || !uiValStr || !dbValStr) {
    return {
      result: 'NOT_COMPARABLE',
      pctDifference: '',
      notes: 'One or both values could not be parsed as a number (N/A, error, or unrecognized format).',
    };
  }

  const uiVal = parseDisplayValue(uiValStr);
  const dbVal = parseDisplayValue(dbValStr);

  if (uiVal === null || dbVal === null || isNaN(uiVal) || isNaN(dbVal)) {
    return {
      result: 'NOT_COMPARABLE',
      pctDifference: '',
      notes: 'One or both values could not be parsed as numeric.',
    };
  }

  if (uiVal === 0 && dbVal === 0) {
    return { result: 'PASS', pctDifference: '0.00', notes: '' };
  }

  const denom = Math.abs(dbVal) || Math.abs(uiVal) || 1;
  const diffPct = (Math.abs(uiVal - dbVal) / denom) * 100;
  const pctStr = diffPct.toFixed(2);
  const pass = diffPct <= tolerancePercent;

  return {
    result: pass ? 'PASS' : 'FAIL',
    pctDifference: pctStr,
    notes: '',
  };
}

function compareTableValues(uiJson, dbJson, kpi, tolerancePercent) {
  let uiRows = [];
  let dbRows = [];
  try {
    uiRows = JSON.parse(uiJson);
  } catch {}
  try {
    dbRows = JSON.parse(dbJson);
  } catch {}

  if (!Array.isArray(uiRows) || !Array.isArray(dbRows) || (!uiRows.length && !dbRows.length)) {
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
  if (rowsFailed > 0 || rowsMissing > 0) overallResult = 'FAIL';

  return {
    overallResult,
    notes: `${rowsPassed} passed, ${rowsFailed} failed, ${rowsMissing} missing out of ${allKeys.size} rows.`,
    rowResults,
  };
}

function buildRowDetailTable(rowDetailsJson, detailId) {
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
    <tr id="${detailId}" class="detail-row" style="display:none">
      <td colspan="8" style="padding: 16px 20px; background: var(--md-sys-color-surface-container-lowest);">
        <div style="font-size: 12px; color: var(--md-sys-color-on-surface-variant); margin-bottom: 10px; font-weight: 600;">${escapeHtml(summaryLine)}</div>
        <table style="width:100%; border-collapse:collapse; margin:0;">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </td>
    </tr>`;
}

function main() {
  const uiHeaders = ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes'];
  const dbHeaders = ['dashboard', 'kpi', 'uiLabel', 'value', 'valueFormat', 'status', 'notes'];

  const uiRows = readTable(UI_CSV_PATH, uiHeaders);
  const dbRows = readTable(DB_CSV_PATH, dbHeaders);

  const dbByKey = new Map(dbRows.map((r) => [keyOf(r), r]));

  const comparisonRows = [];

  for (const dashboard of config.dashboards) {
    for (const kpi of dashboard.kpis) {
      const key = `${dashboard.name}::${kpi.name}`;
      const uiRow = uiRows.find((row) => keyOf(row) === key) || null;
      const dbRow = dbByKey.get(key) || null;

      const uiRawStr = uiRow?.value || 'N/A';
      const dbRawStr = dbRow?.value || 'N/A';
      const tolerance = kpi.tolerancePercent ?? config.tolerancePercent ?? 0.5;

      let uiDisplayVal = uiRawStr;
      let dbDisplayVal = dbRawStr;
      let result = 'NOT_COMPARABLE';
      let pctDiff = '';
      let notes = '';
      let rowDetailsStr = '';

      if (kpi.valueFormat === 'table') {
        let uiCount = '0 rows';
        let dbCount = '0 rows';
        try {
          const parsedUi = JSON.parse(uiRawStr);
          if (Array.isArray(parsedUi)) uiCount = `${parsedUi.length} rows`;
        } catch {}
        try {
          const parsedDb = JSON.parse(dbRawStr);
          if (Array.isArray(parsedDb)) dbCount = `${parsedDb.length} rows`;
        } catch {}

        uiDisplayVal = uiCount;
        dbDisplayVal = dbCount;

        const tableComp = compareTableValues(uiRawStr, dbRawStr, kpi, tolerance);
        result = tableComp.overallResult;
        notes = tableComp.notes;
        rowDetailsStr = JSON.stringify(tableComp.rowResults || []);
      } else {
        const scalarComp = compareScalarValues(uiRawStr, dbRawStr, tolerance);
        result = scalarComp.result;
        pctDiff = scalarComp.pctDifference;
        notes = scalarComp.notes || (dbRow ? '' : 'Missing Databricks row');
      }

      comparisonRows.push({
        dashboard: dashboard.name,
        kpi: kpi.name,
        uiLabel: kpi.uiLabel || kpi.name,
        uiValue: uiDisplayVal,
        databricksValue: dbDisplayVal,
        pctDifference: pctDiff,
        tolerancePercent: String(tolerance),
        result,
        notes,
        rowDetails: rowDetailsStr,
      });
    }
  }

  writeTable(OUT_CSV_PATH, CSV_HEADERS, comparisonRows);

  const counts = { total: comparisonRows.length, PASS: 0, FAIL: 0, SKIPPED: 0, MISSING: 0, NOT_COMPARABLE: 0 };
  for (const r of comparisonRows) {
    if (counts[r.result] !== undefined) counts[r.result] += 1;
  }

  const rowsHtmlArr = [];
  comparisonRows.forEach((r, idx) => {
    const detailId = `advisor-detail-${idx}`;
    const hasDetails = Boolean(r.rowDetails && r.rowDetails !== '[]' && r.rowDetails !== '""');
    const detailsToggleBtn = hasDetails
      ? `<button class="btn-toggle" onclick="toggleDetails('${detailId}', this)" style="margin-left:8px; padding:2px 8px; font-size:11px; border-radius:999px; background:var(--md-sys-color-surface-container-high); border:1px solid var(--md-sys-color-outline); color:var(--primary); cursor:pointer;">▶ Details</button>`
      : '';

    rowsHtmlArr.push(`
      <tr class="main-row" data-result="${r.result}">
        <td><strong>${escapeHtml(r.dashboard)}</strong></td>
        <td>${escapeHtml(r.uiLabel || r.kpi)} ${detailsToggleBtn}</td>
        <td><span class="val-ui">${escapeHtml(r.uiValue)}</span></td>
        <td><span class="val-db">${escapeHtml(r.databricksValue)}</span></td>
        <td>${r.pctDifference ? escapeHtml(r.pctDifference) + '%' : '<span class="muted">-</span>'}</td>
        <td>${escapeHtml(r.tolerancePercent)}%</td>
        <td><span class="badge badge-${r.result}">${escapeHtml(r.result)}</span></td>
        <td style="font-size:12px; color:var(--md-sys-color-on-surface-variant);">${escapeHtml(r.notes)}</td>
      </tr>
    `);

    if (hasDetails) {
      rowsHtmlArr.push(buildRowDetailTable(r.rowDetails, detailId));
    }
  });

  const rowsHtml = rowsHtmlArr.join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  ${GOOGLE_SANS_FONT_LINKS}
  <title>Wealth Pulse Advisor Portal KPI Validation Report</title>
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
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: var(--md-sys-color-on-surface);
      line-height: 1.1;
    }

    .summary-card.card-pass { background: var(--card-pass); border-color: var(--card-pass-border); }
    .summary-card.card-fail { background: var(--card-fail); border-color: var(--card-fail-border); }
    .summary-card.card-warn { background: var(--card-warn); border-color: var(--card-warn-border); }

    .summary-card.card-pass .value { color: #4ade80; }
    .summary-card.card-fail .value { color: #f87171; }
    .summary-card.card-warn .value { color: #fbbf24; }

    .controls-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 20px;
      background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
      padding: 14px 20px;
    }

    .search-box {
      position: relative;
      flex: 1;
      min-width: 240px;
    }

    .search-box input {
      width: 100%;
      background: var(--md-sys-color-surface-container-highest);
      border: 1px solid var(--md-sys-color-outline);
      border-radius: 999px;
      padding: 10px 16px 10px 40px;
      color: var(--md-sys-color-on-surface);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .search-box input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.25);
    }

    .search-box svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      fill: var(--md-sys-color-on-surface-variant);
      width: 16px;
      height: 16px;
      pointer-events: none;
    }

    .filter-pills {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pill {
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      color: var(--md-sys-color-on-surface-variant);
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
    }

    .pill:hover {
      background: var(--md-sys-color-surface-container-highest);
      color: var(--md-sys-color-on-surface);
    }

    .pill.active {
      background: var(--primary-container);
      color: var(--on-primary-container);
      border-color: var(--primary);
    }

    .table-container {
      background: var(--md-sys-color-surface-container);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    th {
      background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface-variant);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      white-space: nowrap;
    }

    td {
      padding: 14px 18px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      color: var(--md-sys-color-on-surface);
    }

    tbody tr.main-row:last-child td { border-bottom: none; }
    tbody tr.main-row:hover { background: var(--md-sys-color-surface-container-high); }

    .val-ui { font-family: monospace; font-weight: 600; color: #a5f3fc; }
    .val-db { font-family: monospace; font-weight: 600; color: #fed7aa; }
    .muted { color: var(--md-sys-color-on-surface-variant); opacity: 0.6; }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    .badge-PASS { background: #14532d; color: #86efac; border: 1px solid #166534; }
    .badge-FAIL { background: #7f1d1d; color: #fca5a5; border: 1px solid #991b1b; }
    .badge-NOT_COMPARABLE { background: #374151; color: #d1d5db; border: 1px solid #4b5563; }
    .badge-MISSING { background: #7c2d12; color: #fdba74; border: 1px solid #9a3412; }
    .badge-SKIPPED { background: #451a03; color: #fde047; border: 1px solid #78350f; }

    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 14px;
    }
  </style>
</head>
<body>

  <div class="header">
    <h1>Wealth Pulse Advisor Portal KPI Validation Report</h1>
    <div class="timestamp">Generated on ${new Date().toLocaleString()} &bull; Automated Data Validation Pipeline</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="title">Total Validated</div>
      <div class="value">${counts.total}</div>
    </div>
    <div class="summary-card card-pass">
      <div class="title">Passed</div>
      <div class="value">${counts.PASS}</div>
    </div>
    <div class="summary-card card-fail">
      <div class="title">Failed</div>
      <div class="value">${counts.FAIL}</div>
    </div>
    <div class="summary-card card-warn">
      <div class="title">Not Comparable</div>
      <div class="value">${counts.NOT_COMPARABLE}</div>
    </div>
    <div class="summary-card">
      <div class="title">Missing</div>
      <div class="value">${counts.MISSING}</div>
    </div>
  </div>

  <div class="controls-bar">
    <div class="search-box">
      <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
      <input type="text" id="searchInput" placeholder="Search dashboard, KPI name, or status..." onkeyup="filterRows()">
    </div>

    <div class="filter-pills">
      <div class="pill active" onclick="setFilter('ALL', this)">All</div>
      <div class="pill" onclick="setFilter('PASS', this)">Passed (${counts.PASS})</div>
      <div class="pill" onclick="setFilter('FAIL', this)">Failed (${counts.FAIL})</div>
      <div class="pill" onclick="setFilter('NOT_COMPARABLE', this)">Not Comparable (${counts.NOT_COMPARABLE})</div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Dashboard</th>
          <th>KPI / Visualization Name</th>
          <th>UI Value</th>
          <th>Databricks Value</th>
          <th>Diff %</th>
          <th>Tolerance %</th>
          <th>Result</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        ${rowsHtml}
      </tbody>
    </table>
    <div id="emptyState" class="empty-state" style="display:none;">No matching validation rows found.</div>
  </div>

  <script>
    let currentResultFilter = 'ALL';

    function toggleDetails(id, btn) {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.style.display === 'none' || !el.style.display) {
        el.style.display = 'table-row';
        btn.innerText = '▼ Hide Details';
      } else {
        el.style.display = 'none';
        btn.innerText = '▶ Details';
      }
    }

    function setFilter(filter, el) {
      currentResultFilter = filter;
      document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
      el.classList.add('active');
      filterRows();
    }

    function filterRows() {
      const q = document.getElementById('searchInput').value.toLowerCase().trim();
      const rows = document.querySelectorAll('tbody tr.main-row');
      let visibleCount = 0;

      rows.forEach(r => {
        const res = r.getAttribute('data-result');
        const text = r.innerText.toLowerCase();

        const matchesFilter = (currentResultFilter === 'ALL' || res === currentResultFilter);
        const matchesQuery = !q || text.includes(q);

        if (matchesFilter && matchesQuery) {
          r.style.display = '';
          visibleCount++;
        } else {
          r.style.display = 'none';
        }
      });

      document.getElementById('emptyState').style.display = visibleCount === 0 ? 'block' : 'none';
    }
  </script>

</body>
</html>`;

  fs.mkdirSync(path.dirname(OUT_HTML_PATH), { recursive: true });
  fs.writeFileSync(OUT_HTML_PATH, html, 'utf8');
  fs.copyFileSync(FAVICON_PATH, path.join(path.dirname(OUT_HTML_PATH), 'favicon.svg'));
  console.log(`Comparison CSV:  ${OUT_CSV_PATH}`);
  console.log(`HTML report:     ${OUT_HTML_PATH}`);
  console.log(`Summary: ${JSON.stringify(counts)}`);

  // Auto-trigger combined comparison report
  try {
    const combinedCompare = require('./wealth-pulse-combined-compare');
    if (typeof combinedCompare.generateCombinedReport === 'function') {
      combinedCompare.generateCombinedReport();
    }
  } catch (err) {
    // optional
  }
}

if (require.main === module) {
  main();
}
