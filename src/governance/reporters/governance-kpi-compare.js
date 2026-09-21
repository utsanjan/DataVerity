const fs = require('fs');
const path = require('path');
const { readTable, writeTable } = require('../../helpers/kpi-report-csv');
const config = require('../../../config/governance/governance-validation.config.json');
const queries = require('../../../config/governance/governance-kpi-queries.json');
const { normalizeMetric, templateSql } = require('../helpers/governance-validation');
const { GOOGLE_SANS_FONT_LINKS, GOOGLE_SANS_FONT_FAMILY } = require('../../reporters/google-sans');

const csvReports = path.resolve(__dirname, '../../../artifacts/reports/csv');
const htmlReports = path.resolve(__dirname, '../../../artifacts/reports/html');
const uiPath = path.join(csvReports, 'governance-kpi-ui-values.csv');
const dbPath = path.join(csvReports, 'governance-kpi-databricks-values.csv');
const outputPath = path.join(csvReports, 'governance-kpi-validation-comparison.csv');
const htmlPath = path.join(htmlReports, 'governance-kpi-validation-report.html');
const headers = ['dashboard', 'kpi', 'queryId', 'uiValue', 'databricksValue', 'variancePercent', 'status', 'notes', 'query', 'rowDetails'];

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRowDetailTable(rowDetailsJson, detailId) {
  let rows = [];
  try {
    rows = JSON.parse(rowDetailsJson || '[]');
  } catch {}
  if (!Array.isArray(rows) || !rows.length) return '';

  const fieldNames = [...new Set(rows.flatMap((row) => (row.fields || []).map((field) => field.field)))];
  const counts = rows.reduce((summary, row) => {
    summary[row.status] = (summary[row.status] || 0) + 1;
    return summary;
  }, {});
  const headersHtml = ['Row key', 'Result', ...fieldNames.flatMap((field) => [
    `${field} (UI)`,
    `${field} (Databricks)`,
    `${field} variance`,
  ])].map((header) => `<th>${escapeHtml(header)}</th>`).join('');

  const bodyHtml = rows.map((row) => {
    const byField = new Map((row.fields || []).map((field) => [field.field, field]));
    const cells = fieldNames.flatMap((fieldName) => {
      const field = byField.get(fieldName) || {};
      return [
        field.uiValue ?? 'MISSING',
        field.dbValue ?? 'MISSING',
        field.variancePercent === undefined || field.variancePercent === ''
          ? '—'
          : `${field.variancePercent}%`,
      ];
    }).map((value) => `<td>${escapeHtml(value)}</td>`).join('');
    const keyHtml = row.note
      ? `${escapeHtml(row.key)}<div class="detail-note">${escapeHtml(row.note)}</div>`
      : escapeHtml(row.key);

    return `<tr data-detail-result="${escapeHtml(row.status)}">
      <td>${keyHtml}</td>
      <td><span class="badge badge-${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      ${cells}
    </tr>`;
  }).join('');

  return `<tr id="${detailId}" class="detail-row row-comparison-detail" style="display:none">
    <td colspan="8">
      <div class="detail-summary">
        Row validation: ${rows.length} total · ${counts.PASS || 0} passed · ${counts.FAIL || 0} failed · ${counts.MISSING || 0} missing${counts.NOT_SHOWN ? ` · ${counts.NOT_SHOWN} not rendered` : ''}
      </div>
      <div class="detail-table-scroll">
        <table class="detail-table">
          <thead><tr>${headersHtml}</tr></thead>
          <tbody>${bodyHtml}</tbody>
        </table>
      </div>
    </td>
  </tr>`;
}

function renderRows(comparison) {
  if (!comparison || !comparison.length) {
    return `<tr><td colspan="8" style="text-align:center; color:var(--md-sys-color-on-surface-variant); padding:20px;">No comparison data available. Run the Governance UI/Databricks specs first.</td></tr>`;
  }

  return comparison
    .map((r, idx) => {
      const queryDetailId = `gov-query-${idx}`;
      const rowDetailId = `gov-rows-${idx}`;
      const hasQuery = Boolean(r.query && r.query !== 'No mapped Databricks query.');
      const hasRowDetails = Boolean(r.rowDetails && r.rowDetails !== '[]');
      const detailsButton = hasRowDetails
        ? `<button class="btn-toggle" onclick="toggleDetails('${rowDetailId}', this)">▶ Details</button>`
        : '';
      const queryButton = hasQuery
        ? `<button class="btn-toggle" onclick="toggleDetails('${queryDetailId}', this)">▶ Query</button>`
        : '';

      const mainRow = `
        <tr class="main-row" data-result="${r.status}" data-query="${escapeHtml(r.query)}">
          <td><strong>${escapeHtml(r.dashboard)}</strong></td>
          <td>
            <div>${escapeHtml(r.kpi)}</div>
            <div class="kpi-actions">${detailsButton}${queryButton}</div>
          </td>
          <td><span class="val-ui">${escapeHtml(r.uiValue)}</span></td>
          <td><span class="val-db">${escapeHtml(r.databricksValue)}</span></td>
          <td>${r.variancePercent ? escapeHtml(r.variancePercent) + '%' : '<span class="muted">-</span>'}</td>
          <td>${escapeHtml(config.tolerancePercent || 1)}%</td>
          <td><span class="badge badge-${r.status}">${escapeHtml(r.status)}</span></td>
          <td style="font-size:12px; color:var(--md-sys-color-on-surface-variant);">${escapeHtml(r.notes || '')}</td>
        </tr>
      `;

      const rowDetail = hasRowDetails ? buildRowDetailTable(r.rowDetails, rowDetailId) : '';
      const queryDetail = hasQuery
        ? `<tr id="${queryDetailId}" class="detail-row" style="display:none">
            <td colspan="8" style="padding:16px 20px; background:var(--md-sys-color-surface-container-lowest);">
              <div class="query-panel-header">Databricks SQL Query (${escapeHtml(r.queryId || 'Mapped')}):</div>
              <div class="query-box">
                <button type="button" class="btn-copy" onclick="copyQuery(this)" title="Copy query" aria-label="Copy query">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                <pre>${escapeHtml(r.query)}</pre>
              </div>
            </td>
          </tr>`
        : '';

      return mainRow + rowDetail + queryDetail;
    })
    .join('\n');
}

function buildHtmlReport(comparison) {
  const counts = { total: comparison.length, PASS: 0, FAIL: 0, NOT_COMPARABLE: 0, MISSING: 0 };
  for (const r of comparison) {
    if (counts[r.status] !== undefined) counts[r.status] += 1;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Governance KPI Validation Report</title>
  ${GOOGLE_SANS_FONT_LINKS}
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

    .btn-export {
      background: var(--primary-container);
      border: 1px solid var(--primary);
      color: var(--on-primary-container);
      padding: 6px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s ease;
    }

    .btn-export:hover { opacity: 0.9; }

    .btn-toggle {
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--md-sys-color-surface-container-high);
      border: 1px solid var(--md-sys-color-outline);
      color: var(--primary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .kpi-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 7px;
    }

    .kpi-actions:empty {
      display: none;
    }

    .btn-toggle:hover {
      background: var(--md-sys-color-surface-container-highest);
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

    .row-comparison-detail > td {
      padding: 16px 20px;
      background: var(--md-sys-color-surface-container-lowest);
    }

    .detail-summary {
      margin-bottom: 10px;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 12px;
      font-weight: 600;
    }

    .detail-note {
      margin-top: 3px;
      color: var(--md-sys-color-on-surface-variant);
      font-size: 11px;
      font-weight: 400;
    }

    .detail-table-scroll {
      overflow-x: auto;
      border: 1px solid var(--md-sys-color-outline-variant);
      border-radius: 12px;
    }

    .detail-table th,
    .detail-table td {
      padding: 8px 12px;
      white-space: nowrap;
      font-size: 12px;
      border-bottom: 1px solid var(--md-sys-color-outline-variant);
    }

    .detail-table th {
      background: var(--md-sys-color-surface-container-high);
      color: var(--md-sys-color-on-surface-variant);
    }

    .detail-table tr:last-child td {
      border-bottom: none;
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
    .badge-NOT_COMPARABLE { background: #78350f; color: #fde68a; border: 1px solid #a16207; }
    .badge-MISSING { background: #7c2d12; color: #fdba74; border: 1px solid #9a3412; }
    .badge-SKIPPED { background: #451a03; color: #fde047; border: 1px solid #78350f; }
    .badge-NOT_SHOWN { background: #1e3a5f; color: #93c5fd; border: 1px solid #1e40af; }

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
    <h1>Governance KPI Validation Report</h1>
    <div class="timestamp">UI (${escapeHtml(config.workspaceName || 'Governance')}) vs Databricks system tables &bull; Window ${escapeHtml(config.dateWindow?.start || '')} to ${escapeHtml(config.dateWindow?.end || '')} &bull; Generated ${new Date().toLocaleString()}</div>
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
      <input type="text" id="searchInput" placeholder="Search dashboard, KPI name, or status...">
    </div>

    <div class="filter-pills">
      <div class="pill active" onclick="setFilter('ALL', this)">All</div>
      <div class="pill" onclick="setFilter('PASS', this)">Passed (${counts.PASS})</div>
      <div class="pill" onclick="setFilter('FAIL', this)">Failed (${counts.FAIL})</div>
      <div class="pill" onclick="setFilter('NOT_COMPARABLE', this)">Not Comparable (${counts.NOT_COMPARABLE})</div>
    </div>

    <button id="exportButton" class="btn-export" type="button">Export to Excel</button>
  </div>

  <div class="table-container">
    <table id="table-governance">
      <thead>
        <tr>
          <th>Dashboard</th>
          <th>KPI / Visualization Name</th>
          <th>UI Value</th>
          <th>Databricks Value</th>
          <th>Variance %</th>
          <th>Tolerance %</th>
          <th>Result</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        ${renderRows(comparison)}
      </tbody>
    </table>
    <div id="emptyState" class="empty-state" style="display:none;">No matching validation rows found.</div>
  </div>

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

    function toggleDetails(id, btn) {
      const el = document.getElementById(id);
      if (!el) return;
      const isRowDetails = btn.innerText.includes('Details');
      if (el.style.display === 'none' || !el.style.display) {
        el.style.display = 'table-row';
        btn.innerText = isRowDetails ? '▼ Hide Details' : '▼ Hide Query';
      } else {
        el.style.display = 'none';
        btn.innerText = isRowDetails ? '▶ Details' : '▶ Query';
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
          let sibling = r.nextElementSibling;
          while (sibling && sibling.classList.contains('detail-row')) {
            sibling.style.display = 'none';
            sibling = sibling.nextElementSibling;
          }
        }
      });

      document.getElementById('emptyState').style.display = visibleCount === 0 ? 'block' : 'none';
    }

    document.getElementById('searchInput').addEventListener('input', filterRows);

    function exportCellText(cell) {
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('button').forEach((button) => button.remove());
      return clone.innerText.trim();
    }

    document.getElementById('exportButton').addEventListener('click', () => {
      if (!window.XLSX) {
        window.alert('Excel export library unavailable. Please check network connection.');
        return;
      }
      const table = document.getElementById('table-governance');
      const headerRow = [...Array.from(table.querySelectorAll(':scope > thead > tr > th')).map((cell) => cell.innerText.trim()), 'Queries'];
      const dataRows = Array.from(table.querySelectorAll(':scope > tbody > tr.main-row'))
        .filter((row) => getComputedStyle(row).display !== 'none')
        .map((row) => [...Array.from(row.querySelectorAll(':scope > td')).map(exportCellText), row.dataset.query || 'No Databricks query configured for this KPI.']);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]), 'Governance');
      XLSX.writeFile(workbook, 'governance-kpi-validation-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    });
  </script>

</body>
</html>`;

  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  fs.writeFileSync(htmlPath, html, 'utf8');
}

function dbValue(row, kpi) {
  if (!row?.uiValue || row.uiValue === 'ERROR' || row.uiValue === 'N/A') return 'N/A';
  try {
    const values = JSON.parse(row.uiValue);
    const first = values[0] || {};
    if (kpi === 'Audit events' && first.events !== undefined) return String(first.events);
    if (Object.keys(first).length === 1) return String(Object.values(first)[0]);
    return JSON.stringify(first);
  } catch { return row.uiValue; }
}

const KPI_TO_QUERY_ID = {
  'Total spend': 'total_spend',
  'Total DBU': 'total_dbu',
  'Spend by compute type': 'spend_by_compute_type',
  'Total job runs': 'total_job_runs',
  'Failure rate': 'job_failure_rate',
  'Total runtime': 'total_runtime',
  'Active jobs': 'active_jobs',
};

const NON_DATABRICKS_SOURCES = {
  'Optimization opportunity': 'Optimizer Postgres (not Databricks)',
  'Open recommendations': 'Optimizer Postgres (not Databricks)',
  'Savings / mo': 'Optimizer Postgres (not Databricks)',
  'Lineage health': 'Cross-platform lineage API (not Databricks-only)',
  'Last refresh': 'Application refresh metadata',
};

function resolveQuery(ui, queryById, queryByLabel) {
  const mappedId = KPI_TO_QUERY_ID[ui.kpi];
  if (mappedId) return queryById.get(mappedId);
  return queryByLabel.get(ui.kpi);
}

function rowKey(row, matchKeys) {
  return matchKeys.map((key) => String(row?.[key] ?? '').trim().toUpperCase()).join('|');
}

function compareDetailedRows(uiJson, dbJson, definition, tolerance) {
  // An empty widget and an empty result set both mean "no rows", so normalise
  // them to an empty array instead of treating them as unparseable.
  const asRowJson = (value) => {
    const text = String(value ?? '').trim();
    return !text || text.toUpperCase() === 'N/A' ? '[]' : text;
  };

  let uiRows;
  let dbRows;
  try {
    uiRows = JSON.parse(asRowJson(uiJson));
    dbRows = JSON.parse(asRowJson(dbJson));
  } catch {
    return {
      status: 'NOT_COMPARABLE',
      notes: 'UI or Databricks chart rows are not valid JSON arrays.',
      uiDisplay: 'N/A',
      dbDisplay: 'N/A',
      rowDetails: '[]',
    };
  }

  if (!Array.isArray(uiRows) || !Array.isArray(dbRows)) {
    return {
      status: 'NOT_COMPARABLE',
      notes: 'UI or Databricks chart data is not an array.',
      uiDisplay: 'N/A',
      dbDisplay: 'N/A',
      rowDetails: '[]',
    };
  }

  const matchKeys = definition.matchKeys || [];
  const compareFields = definition.compareFields || [];
  const uiByKey = new Map(uiRows.map((row) => [rowKey(row, matchKeys), row]));
  const dbByKey = new Map(dbRows.map((row) => [rowKey(row, matchKeys), row]));

  // Some widgets truncate long identities to a fixed width, so an exact key
  // lookup misses and the Databricks key has to be resolved by prefix.
  const resolveDbKey = (key) => {
    if (dbByKey.has(key) || !definition.keyPrefixMatch) return key;
    const prefixed = [...dbByKey.keys()].filter((dbKey) => dbKey.startsWith(key));
    return prefixed.length === 1 ? prefixed[0] : key;
  };

  const pairs = new Map();
  for (const uiKey of uiByKey.keys()) pairs.set(uiKey, resolveDbKey(uiKey));
  for (const dbKey of dbByKey.keys()) {
    if (![...pairs.values()].includes(dbKey)) pairs.set(dbKey, dbKey);
  }

  const rowDetails = [...pairs.keys()].sort().map((key) => {
    const uiRow = uiByKey.get(key);
    const dbRow = dbByKey.get(pairs.get(key));
    if (!uiRow || !dbRow) {
      const presentRow = uiRow || dbRow;
      // GROUP BY emits no row when a category has no usage, so a zero-valued row
      // on one side only is equivalent to an absent row, not a mismatch.
      const zeroOnly = compareFields.every((field) => Number(presentRow?.[field]) === 0);
      // A paginated widget only renders one page, so Databricks rows with no
      // rendered counterpart are reported rather than treated as missing data.
      const notRendered = !uiRow && definition.paginated;

      let status = 'MISSING';
      let note;
      if (zeroOnly) {
        status = 'PASS';
        note = 'Zero-valued row absent from the aggregate on the other side.';
      } else if (notRendered) {
        status = 'NOT_SHOWN';
        note = 'Databricks row outside the widget\u2019s rendered page.';
      }

      return {
        key,
        status,
        note,
        fields: compareFields.map((field) => ({
          field,
          uiValue: uiRow?.[field] ?? 'MISSING',
          dbValue: dbRow?.[field] ?? 'MISSING',
          status,
        })),
      };
    }

    const fields = compareFields.map((field) => {
      const uiValue = uiRow[field];
      const dbValue = dbRow[field];
      const uiNumber = Number(uiValue);
      const dbNumber = Number(dbValue);

      if (Number.isFinite(uiNumber) && Number.isFinite(dbNumber)) {
        const variance = Math.abs(uiNumber - dbNumber) / (Math.abs(dbNumber) || 1) * 100;
        return {
          field,
          uiValue,
          dbValue,
          variancePercent: Number(variance.toFixed(2)),
          status: variance <= tolerance ? 'PASS' : 'FAIL',
        };
      }

      const pass = String(uiValue ?? '') === String(dbValue ?? '');
      return { field, uiValue, dbValue, status: pass ? 'PASS' : 'FAIL' };
    });

    return {
      key,
      status: fields.every((field) => field.status === 'PASS') ? 'PASS' : 'FAIL',
      fields,
    };
  });

  const passed = rowDetails.filter((row) => row.status === 'PASS').length;
  const failed = rowDetails.filter((row) => row.status === 'FAIL').length;
  const missing = rowDetails.filter((row) => row.status === 'MISSING').length;
  const notShown = rowDetails.filter((row) => row.status === 'NOT_SHOWN').length;
  const zeroOnly = rowDetails.filter((row) => row.status === 'PASS' && row.note).length;

  return {
    status: failed || missing ? 'FAIL' : 'PASS',
    notes: `${passed} matched, ${failed} failed, ${missing} missing out of ${rowDetails.length} chart rows.`
      + (zeroOnly ? ` Includes ${zeroOnly} zero-valued row(s) present on one side only.` : '')
      + (notShown ? ` ${notShown} Databricks row(s) outside the widget's rendered page.` : ''),
    uiDisplay: `${uiRows.length} rows`,
    dbDisplay: `${dbRows.length} rows`,
    rowDetails: JSON.stringify(rowDetails),
  };
}

function main() {
  const uiRows = readTable(uiPath, ['dashboard', 'kpi', 'queryId', 'uiValue', 'format', 'status', 'notes']);
  const dbRows = readTable(dbPath, ['dashboard', 'kpi', 'queryId', 'uiValue', 'format', 'status', 'notes']);
  const queryById = new Map(queries.map((query) => [query.id, query]));
  const queryByLabel = new Map(queries.map((query) => [query.label, query]));

  const comparison = uiRows.map((ui) => {
    const query = resolveQuery(ui, queryById, queryByLabel);
    const db = dbRows.find((row) => row.queryId === query?.id);
    const detailed = query?.rowComparison
      ? compareDetailedRows(ui.uiValue, db?.uiValue, query.rowComparison, config.tolerancePercent || 1)
      : null;
    const source = query
      ? dbValue(db, ui.kpi)
      : NON_DATABRICKS_SOURCES[ui.kpi] || 'No Databricks source defined';

    let status = 'NOT_COMPARABLE';
    let variancePercent = '';

    if (detailed) {
      status = detailed.status;
    } else if (ui.uiValue && source
      && ui.uiValue.trim().toUpperCase() !== 'N/A'
      && source.trim().toUpperCase() !== 'N/A'
      && ui.uiValue.trim().toUpperCase() === source.trim().toUpperCase()) {
      status = 'PASS';
      variancePercent = '0.00';
    } else {
      const uiNumber = normalizeMetric(ui.uiValue);
      const dbNumber = normalizeMetric(source);
      if (uiNumber !== null && dbNumber !== null) {
        const difference = Math.abs(uiNumber - dbNumber) / (Math.abs(dbNumber) || 1) * 100;
        variancePercent = difference.toFixed(2);
        status = difference <= (config.tolerancePercent || 1) ? 'PASS' : 'FAIL';
      }
    }

    return {
      dashboard: ui.dashboard,
      kpi: ui.kpi,
      queryId: query?.id || '',
      uiValue: detailed?.uiDisplay || ui.uiValue,
      databricksValue: detailed?.dbDisplay || source,
      variancePercent,
      status,
      notes: detailed?.notes || (query
        ? ui.notes
        : `${ui.notes}; source of truth: ${NON_DATABRICKS_SOURCES[ui.kpi] || 'not defined'}`),
      query: query ? templateSql(query.sql, config) : 'No mapped Databricks query.',
      rowDetails: detailed?.rowDetails || '',
    };
  });

  writeTable(outputPath, headers, comparison);
  buildHtmlReport(comparison);
  console.log(`Governance comparison CSV written to ${outputPath} (${comparison.length} KPI rows).`);
  console.log(`Governance comparison HTML report written to ${htmlPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildRowDetailTable,
  compareDetailedRows,
};