const fs = require('fs');
const path = require('path');
const { readTable } = require('../../helpers/kpi-report-csv');
const leadershipConfig = require('../../../config/wealth-pulse/leadership-kpi-validation.config.json');
const advisorConfig = require('../../../config/wealth-pulse/advisor-kpi-validation.config.json');
const { GOOGLE_SANS_FONT_LINKS, GOOGLE_SANS_FONT_FAMILY } = require('../../reporters/google-sans');

const LEADERSHIP_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/leadership-kpi-comparison.csv');
const ADVISOR_CSV_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/advisor-kpi-comparison.csv');
const COMBINED_HTML_PATH = path.resolve(__dirname, '../../../artifacts/reports/html/wealth-pulse-combined-kpi-comparison-report.html');
const FAVICON_PATH = path.resolve(__dirname, '../../../favicon.svg');

const CSV_HEADERS = ['dashboard', 'kpi', 'uiLabel', 'uiValue', 'databricksValue', 'pctDifference', 'tolerancePercent', 'result', 'notes', 'rowDetails'];

const TABLE_QUERIES = {
  'Advisor Home::AUM Trend by Advisor': `SELECT
  'ADVISOR' AS advisorId,
  DATE_FORMAT(snapshot_date, 'MMM') AS month,
  ROUND(SUM(amount), 2) AS aum
FROM wealth_pulse.gold.positions
WHERE snapshot_date >= ADD_MONTHS((SELECT MAX(snapshot_date) FROM wealth_pulse.gold.positions), -6)
GROUP BY DATE_FORMAT(snapshot_date, 'MMM')
ORDER BY month;`,
  'Household Management::Household Listing Table': `SELECT
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
ORDER BY aum DESC;`,
  'Portfolio Analytics::Asset Allocation Breakdown': `SELECT
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
ORDER BY currentPct DESC;`,
};

function queryLookup(config) {
  const queries = new Map();
  config.dashboards.forEach((dashboard) => {
    dashboard.kpis.forEach((kpi) => {
      queries.set(`${dashboard.name}::${kpi.name}`, kpi.dbQuery || TABLE_QUERIES[`${dashboard.name}::${kpi.name}`] || 'Dynamically generated Databricks query; see the corresponding validation spec.');
    });
  });
  return queries;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRowDetailTable(rowDetailsJson, detailId, notes) {
  let rowResults = [];
  if (rowDetailsJson) {
    try {
      rowResults = JSON.parse(rowDetailsJson);
    } catch {}
  }

  if (!Array.isArray(rowResults) || !rowResults.length) {
    return '';
  }

  const fieldNames = [...new Set(rowResults.flatMap((row) =>
    (row.fields || []).map((field) => field.field),
  ))];
  const counts = rowResults.reduce((summary, row) => {
    summary[row.status] = (summary[row.status] || 0) + 1;
    return summary;
  }, {});
  const headerCells = ['Key', 'Status', ...fieldNames.flatMap((f) => [`${f} (UI)`, `${f} (Databricks)`, `${f} diff %`])]
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join('');

  const bodyRows = rowResults
    .map((r) => {
      const byField = new Map((r.fields || []).map((field) => [field.field, field]));
      const fieldCells = fieldNames
        .flatMap((fieldName) => {
          const field = byField.get(fieldName) || {};
          return [
            field.uiValue ?? 'MISSING',
            field.dbValue ?? 'MISSING',
            field.pctDifference === undefined || field.pctDifference === ''
              ? '—'
              : `${field.pctDifference}%`,
          ];
        })
        .map((v) => `<td>${escapeHtml(v)}</td>`)
        .join('');
      return `<tr data-detail-result="${escapeHtml(r.status)}">
        <td>${escapeHtml(r.key)}</td>
        <td><span class="badge badge-${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></td>
        ${fieldCells}
      </tr>`;
    })
    .join('');

  return `
    <tr class="detail-row row-comparison-detail" id="${detailId}" style="display:none;">
      <td colspan="8">
        <div class="detail-summary">
          Row validation: ${rowResults.length} total · ${counts.PASS || 0} passed · ${counts.FAIL || 0} failed · ${counts.MISSING || 0} missing
        </div>
        <div class="detail-table-scroll">
        <table class="detail-table">
          <thead><tr>${headerCells}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
        </div>
      </td>
    </tr>`;
}

function renderTableRows(rows, portalPrefix, queries) {
  if (!rows || rows.length === 0) {
    return `<tr><td colspan="8" style="text-align: center; color: var(--md-sys-color-on-surface-variant); padding: 20px;">No comparison data available for this portal. Please run the portal validation script first.</td></tr>`;
  }

  return rows
    .map((r, idx) => {
      const detailId = `detail-${portalPrefix}-${idx}`;
      const queryId = `query-${portalPrefix}-${idx}`;

      let uiValDisplay = r.uiValue || 'N/A';
      let dbValDisplay = r.databricksValue || 'N/A';

      if (uiValDisplay.startsWith('[')) {
        try { uiValDisplay = `${JSON.parse(uiValDisplay).length} rows`; } catch {}
      }
      if (dbValDisplay.startsWith('[')) {
        try { dbValDisplay = `${JSON.parse(dbValDisplay).length} rows`; } catch {}
      }

      const hasDetails = Boolean(r.rowDetails && r.rowDetails !== '[]' && r.rowDetails !== '""');
      const toggleBtn = hasDetails
        ? `<button class="toggle-btn" data-target="${detailId}" data-action="Details">&#9654; Details</button>`
        : '';

      const query = queries.get(`${r.dashboard}::${r.kpi}`) || 'No Databricks query configured for this KPI.';
      const queryBtn = `<button class="toggle-btn" data-target="${queryId}" data-action="Query">&#9654; Query</button>`;
      const mainRow = `<tr class="main-row" data-result="${r.result}" data-query="${escapeHtml(query)}">
      <td><strong>${escapeHtml(r.dashboard)}</strong></td>
      <td>
        <div>${escapeHtml(r.uiLabel || r.kpi)}</div>
        <div class="kpi-actions">${toggleBtn}${queryBtn}</div>
      </td>
      <td><span class="val-ui">${escapeHtml(uiValDisplay)}</span></td>
      <td><span class="val-db">${escapeHtml(dbValDisplay)}</span></td>
      <td>${r.pctDifference ? escapeHtml(r.pctDifference) + '%' : '<span class="muted">-</span>'}</td>
      <td>${r.tolerancePercent ? escapeHtml(r.tolerancePercent) + '%' : '<span class="muted">-</span>'}</td>
      <td><span class="badge badge-${r.result}">${escapeHtml(r.result)}</span></td>
      <td style="font-size:12px; color:var(--md-sys-color-on-surface-variant);">${escapeHtml(r.notes || '')}</td>
    </tr>`;

      const detailRow = hasDetails ? buildRowDetailTable(r.rowDetails, detailId, r.notes) : '';
      const queryRow = `<tr class="detail-row" id="${queryId}" style="display:none;">
        <td colspan="8" style="padding:16px 20px; background:var(--md-sys-color-surface-container-lowest);">
          <div class="query-panel-header">Databricks SQL Query:</div>
          <div class="query-box">
            <button type="button" class="btn-copy" onclick="copyQuery(this)" title="Copy query" aria-label="Copy query">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <pre>${escapeHtml(query)}</pre>
          </div>
        </td>
      </tr>`;
      return mainRow + detailRow + queryRow;
    })
    .join('\n');
}

function main() {
  const leadershipRows = readTable(LEADERSHIP_CSV_PATH, CSV_HEADERS);
  const advisorRows = readTable(ADVISOR_CSV_PATH, CSV_HEADERS);
  const leadershipQueries = queryLookup(leadershipConfig);
  const advisorQueries = queryLookup(advisorConfig);

  const allRows = [...leadershipRows, ...advisorRows];

  const counts = { total: allRows.length, PASS: 0, FAIL: 0, SKIPPED: 0, MISSING: 0, NOT_COMPARABLE: 0 };
  const leadershipCounts = { total: leadershipRows.length, PASS: 0, FAIL: 0, NOT_COMPARABLE: 0 };
  const advisorCounts = { total: advisorRows.length, PASS: 0, FAIL: 0, NOT_COMPARABLE: 0 };

  for (const r of allRows) {
    if (counts[r.result] !== undefined) counts[r.result] += 1;
  }
  for (const r of leadershipRows) {
    if (leadershipCounts[r.result] !== undefined) leadershipCounts[r.result] += 1;
  }
  for (const r of advisorRows) {
    if (advisorCounts[r.result] !== undefined) advisorCounts[r.result] += 1;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  ${GOOGLE_SANS_FONT_LINKS}
  <title>Wealth Pulse Master KPI Validation Report (Leadership & Advisor Portals)</title>
  <style>
    :root {
      /* Google Material 3 Expressive Dark – soft tonal surfaces */
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

      /* Expressive accents */
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

      /* Soft card fills */
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
    .controls select,
    .export-btn {
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

    .export-btn {
      cursor: pointer;
      font-weight: 600;
    }

    .export-btn:hover {
      background: var(--md-sys-color-surface-container-highest);
      border-color: var(--primary);
    }

    .controls select {
      cursor: pointer;
      appearance: none;
      padding-right: 36px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%23a8b3c4' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--md-sys-color-on-surface);
      margin: 40px 0 16px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 4px;
    }

    .section-badge {
      font-size: 12px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 999px;
      background: var(--md-sys-color-surface-container-high);
      color: var(--primary);
      border: 1px solid var(--md-sys-color-outline-variant);
      white-space: nowrap;
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

    .kpi-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 7px;
    }

    .toggle-btn:hover {
      background: var(--md-sys-color-surface-container-highest);
      border-color: var(--primary);
    }

    .query-panel-header {
      margin-bottom: 6px;
      font-size: 12px;
      color: var(--md-sys-color-on-surface-variant);
      font-weight: 600;
    }

    .query-box {
      position: relative;
      background: var(--md-sys-color-surface-container);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 12px;
    }

    .query-box pre {
      margin: 0;
      padding: 12px 40px 12px 12px;
      color: var(--primary);
      font-size: 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .btn-copy {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline);
      color: var(--primary);
      cursor: pointer;
    }

    .btn-copy:hover,
    .btn-copy.copied {
      background: var(--md-sys-color-surface-container-highest);
    }

    .copy-toast {
      position: fixed;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%) translateY(12px);
      padding: 12px 18px;
      border-radius: 12px;
      background: #14532d;
      color: #bbf7d0;
      border: 1px solid #166534;
      font-size: 13px;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .copy-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .copy-toast.error {
      background: #7f1d1d;
      color: #fecaca;
      border-color: #991b1b;
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

    /* Shared validation-report UI: keep Wealth Pulse visually identical to Governance. */
    .summary-card .value { font-size: 28px; color: var(--md-sys-color-on-surface); }
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
      padding: 14px 20px;
      background: var(--md-sys-color-surface-container-low);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 16px;
    }
    .search-box { position: relative; flex: 1; min-width: 240px; }
    .search-box input {
      width: 100%;
      padding: 10px 16px 10px 40px;
      background: var(--md-sys-color-surface-container-highest);
      border: 1px solid var(--md-sys-color-outline);
      border-radius: 999px;
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
      width: 16px;
      height: 16px;
      transform: translateY(-50%);
      fill: var(--md-sys-color-on-surface-variant);
      pointer-events: none;
    }
    .filter-pills { display: flex; align-items: center; gap: 8px; }
    .pill {
      padding: 6px 16px;
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 999px;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .pill:hover {
      background: var(--md-sys-color-surface-container-highest);
      color: var(--md-sys-color-on-surface);
    }
    .pill.active {
      background: var(--primary-container);
      border-color: var(--primary);
      color: var(--on-primary-container);
    }
    .btn-export {
      padding: 6px 16px;
      background: var(--primary-container);
      border: 1px solid var(--primary);
      border-radius: 999px;
      color: var(--on-primary-container);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-export:hover { opacity: 0.9; }

    .table-container {
      overflow: hidden;
      margin-bottom: 36px;
      background: var(--md-sys-color-surface-container);
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
    }
    .table-container table {
      margin: 0;
      border: 0;
      border-radius: 0;
      border-collapse: collapse;
      font-size: 13px;
    }
    .table-container th {
      padding: 14px 18px;
      font-size: 12px;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }
    .table-container td { padding: 14px 18px; font-size: 13px; }
    .val-ui { color: #a5f3fc; font-family: monospace; font-weight: 600; }
    .val-db { color: #fed7aa; font-family: monospace; font-weight: 600; }
    .muted { opacity: 0.6; }
    .badge {
      justify-content: center;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .badge-PASS { background: #14532d; color: #86efac; border: 1px solid #166534; }
    .badge-FAIL { background: #7f1d1d; color: #fca5a5; border: 1px solid #991b1b; }
    .badge-NOT_COMPARABLE { background: #78350f; color: #fde68a; border: 1px solid #a16207; }
    .badge-MISSING { background: #7c2d12; color: #fdba74; border: 1px solid #9a3412; }
    .badge-SKIPPED { background: #451a03; color: #fde047; border: 1px solid #78350f; }
    .toggle-btn {
      padding: 3px 9px;
      border: 1px solid var(--md-sys-color-outline);
      font-size: 11px;
    }
    .row-comparison-detail > td {
      padding: 16px 20px !important;
      background: var(--md-sys-color-surface-container-lowest) !important;
    }
    .detail-summary {
      margin-bottom: 10px;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 12px;
      font-weight: 600;
    }
    .detail-table-scroll {
      overflow-x: auto;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 12px;
    }
    .detail-table {
      margin: 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      border-collapse: collapse;
    }
    .detail-table th,
    .detail-table td {
      padding: 8px 12px !important;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
      white-space: nowrap;
      font-size: 12px;
    }
    .detail-table th {
      background: var(--md-sys-color-surface-container-high) !important;
      color: var(--md-sys-color-on-surface-variant);
    }
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
    <h1>Wealth Pulse Master KPI Validation Report</h1>
    <div class="timestamp">Unified UI (dev) vs Databricks SQL (wealth_pulse.gold) Comparison Report — Generated ${new Date().toISOString()}</div>
  </div>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="title">Total Validated KPIs</div>
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
      <input type="text" id="searchInput" placeholder="Search dashboard, KPI name, or status...">
    </div>
    <div class="filter-pills">
      <div class="pill active" data-filter="ALL">All</div>
      <div class="pill" data-filter="PASS">Passed (${counts.PASS})</div>
      <div class="pill" data-filter="FAIL">Failed (${counts.FAIL})</div>
      <div class="pill" data-filter="NOT_COMPARABLE">Not Comparable (${counts.NOT_COMPARABLE})</div>
    </div>
    <button id="exportButton" class="btn-export" type="button" title="Download the visible report rows as an Excel workbook">Export to Excel</button>
  </div>

  <!-- SECTION 1: LEADERSHIP PORTAL -->
  <div class="section-title">
    <span>1. Leadership Portal KPI Validation</span>
    <span class="section-badge">${leadershipCounts.PASS} PASS / ${leadershipCounts.total} KPIs</span>
  </div>
  <div class="table-container">
  <table id="table-leadership">
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
      ${renderTableRows(leadershipRows, 'leadership', leadershipQueries)}
    </tbody>
  </table>
  </div>

  <!-- SECTION 2: ADVISOR PORTAL -->
  <div class="section-title">
    <span>2. Advisor Portal KPI Validation</span>
    <span class="section-badge">${advisorCounts.PASS} PASS / ${advisorCounts.total} KPIs</span>
  </div>
  <div class="table-container">
  <table id="table-advisor">
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
      ${renderTableRows(advisorRows, 'advisor', advisorQueries)}
    </tbody>
  </table>
  </div>
  <div id="emptyState" class="empty-state" style="display:none;">No matching validation rows found.</div>

  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script>
    let currentResultFilter = 'ALL';

    function showCopyToast(message, isError) {
      let toast = document.getElementById('copyToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'copyToast';
        toast.className = 'copy-toast';
        document.body.appendChild(toast);
      }
      toast.textContent = message;
      toast.classList.toggle('error', Boolean(isError));
      toast.classList.add('show');
      clearTimeout(showCopyToast._timer);
      showCopyToast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
    }

    function copyQuery(btn) {
      const box = btn.closest('.query-box');
      const pre = box && box.querySelector('pre');
      const text = pre ? pre.innerText : '';
      const markCopied = () => {
        btn.classList.add('copied');
        btn.setAttribute('title', 'Copied');
        showCopyToast('Query copied to clipboard');
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.setAttribute('title', 'Copy query');
        }, 1500);
      };
      const fallbackCopy = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          markCopied();
        } catch (error) {
          showCopyToast('Could not copy query', true);
        }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(markCopied).catch(fallbackCopy);
        return;
      }
      fallbackCopy();
    }

    document.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const target = document.getElementById(targetId);
        if (!target) return;
        const isHidden = target.style.display === 'none' || !target.style.display;
        target.style.display = isHidden ? 'table-row' : 'none';
        const action = btn.getAttribute('data-action') || 'Details';
        btn.innerHTML = isHidden ? '&#9660; Hide ' + action : '&#9654; ' + action;
      });
    });

    const searchInput = document.getElementById('searchInput');
    function filterRows() {
      const query = searchInput.value.toLowerCase().trim();
      let visibleCount = 0;
      document.querySelectorAll('tr.main-row').forEach((row) => {
        const text = row.innerText.toLowerCase();
        const rowResult = row.getAttribute('data-result');
        const matchesQuery = !query || text.includes(query);
        const matchesResult = currentResultFilter === 'ALL' || rowResult === currentResultFilter;
        const isVisible = matchesQuery && matchesResult;
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount += 1;
        row.querySelectorAll('.toggle-btn').forEach((detailBtn) => {
          const targetId = detailBtn.getAttribute('data-target');
          const target = document.getElementById(targetId);
          if (target && !isVisible) {
            target.style.display = 'none';
          }
        });
      });
      document.getElementById('emptyState').style.display = visibleCount === 0 ? 'block' : 'none';
    }
    searchInput.addEventListener('input', filterRows);
    document.querySelectorAll('.filter-pills .pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        currentResultFilter = pill.getAttribute('data-filter') || 'ALL';
        document.querySelectorAll('.filter-pills .pill').forEach((item) => item.classList.remove('active'));
        pill.classList.add('active');
        filterRows();
      });
    });

    function exportCellText(cell) {
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('button').forEach((button) => button.remove());
      return clone.innerText.trim();
    }

    function visibleRowsForExport(tableId) {
      const table = document.getElementById(tableId);
      const headers = [...Array.from(table.querySelectorAll(':scope > thead > tr > th')).map((cell) => cell.innerText.trim()), 'Queries'];
      const rows = Array.from(table.querySelectorAll(':scope > tbody > tr.main-row'))
        .filter((row) => getComputedStyle(row).display !== 'none')
        .map((row) => [
          ...Array.from(row.querySelectorAll(':scope > td')).map(exportCellText),
          row.dataset.query || 'No Databricks query configured for this KPI.',
        ]);
      return [headers, ...rows];
    }

    document.getElementById('exportButton').addEventListener('click', () => {
      if (!window.XLSX) {
        window.alert('Excel export is unavailable because the workbook library did not load. Check your internet connection and try again.');
        return;
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(visibleRowsForExport('table-leadership')), 'Leadership');
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(visibleRowsForExport('table-advisor')), 'Advisor');
      const dateStamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, 'wealth-pulse-kpi-validation-' + dateStamp + '.xlsx');
    });
  </script>
</body>
</html>`;

  fs.mkdirSync(path.dirname(COMBINED_HTML_PATH), { recursive: true });
  fs.writeFileSync(COMBINED_HTML_PATH, html, 'utf8');
  fs.copyFileSync(FAVICON_PATH, path.join(path.dirname(COMBINED_HTML_PATH), 'favicon.svg'));

  console.log(`Combined Material 3 Expressive Dark HTML report generated at: ${COMBINED_HTML_PATH}`);
  console.log(`Total Summary: ${JSON.stringify(counts)}`);
}

main();
