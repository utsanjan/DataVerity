const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.resolve(__dirname, '../../../artifacts/reports/csv');
const UI_REPORT_PATH = path.join(REPORTS_DIR, 'governance-kpi-ui-values.csv');
const DB_REPORT_PATH = path.join(REPORTS_DIR, 'governance-kpi-databricks-values.csv');
const HEADERS = ['dashboard', 'kpi', 'queryId', 'uiValue', 'format', 'status', 'notes'];

function escapeCsvField(val) {
  const str = String(val ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsvRows(filePath, rows) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const lines = [HEADERS.join(',')];
  for (const r of rows) {
    lines.push([
      escapeCsvField(r.dashboard),
      escapeCsvField(r.kpi),
      escapeCsvField(r.queryId || ''),
      escapeCsvField(r.uiValue),
      escapeCsvField(r.format || 'string'),
      escapeCsvField(r.status || 'CAPTURED'),
      escapeCsvField(r.notes || ''),
    ].join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

function writeUiRows(rows) {
  writeCsvRows(UI_REPORT_PATH, rows);
}

function writeDbRows(rows) {
  writeCsvRows(DB_REPORT_PATH, rows);
}

function templateSql(sql, config) {
  return sql
    .replaceAll('{{workspaceId}}', config.workspaceId)
    .replaceAll('{{startDate}}', config.dateWindow.start)
    .replaceAll('{{endDate}}', config.dateWindow.end);
}

function normalizeMetric(valStr) {
  if (valStr === null || valStr === undefined) return null;
  const s = String(valStr).trim().replace(/\s+/g, ' ');
  if (!s || s === 'N/A' || s === 'ERROR' || s === '-' || s === 'Section present' || s === 'Rendered') return null;

  if (s.startsWith('[') || s.startsWith('{')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.length;
      if (typeof parsed === 'object') return Object.keys(parsed).length;
    } catch {}
    return null;
  }

  const compact = s.replace(/\$/g, '');
  const scaled = compact.match(/^([+$-]?)([\d,.]+(?:\.\d+)?)\s*([KMB])\b/i);
  if (scaled) {
    let num = parseFloat(scaled[2].replace(/,/g, ''));
    if (Number.isNaN(num)) return null;
    const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[scaled[3].toUpperCase()];
    if (multiplier) num *= multiplier;
    if (scaled[1] === '-') num = -num;
    return num;
  }

  const match = compact.match(/^([+$-]?)([\d,.]+(?:\.\d+)?)\s*(%|h|DBU|\/mo)?$/i);
  if (match) {
    let num = parseFloat(match[2].replace(/,/g, ''));
    if (Number.isNaN(num)) return null;
    if (match[1] === '-') num = -num;
    return num;
  }

  const fallback = parseFloat(compact.replace(/[^0-9.-]/g, ''));
  return Number.isNaN(fallback) ? null : fallback;
}

module.exports = {
  UI_REPORT_PATH,
  DB_REPORT_PATH,
  writeUiRows,
  writeDbRows,
  templateSql,
  normalizeMetric,
};
