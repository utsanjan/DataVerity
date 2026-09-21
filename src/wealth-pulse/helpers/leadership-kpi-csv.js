const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.resolve(__dirname, '../../../artifacts/reports/csv/leadership-kpi-validation-manual.csv');
const HEADERS = ['dashboard', 'kpi', 'uiLabel', 'uiValue', 'databricksValue', 'status', 'pctDifference', 'tolerancePercent', 'notes'];

function csvValue(value) {
  const normalized = String(value ?? '')
    .replace(/\r\n/g, '\\n')
    .replace(/[\r\n]/g, '\\n')
    .replace(/"/g, '""');
  return `"${normalized}"`;
}

function parseCsvRows(content) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ',') {
      row.push(value);
      value = '';
      continue;
    }

    if (character === '\r') {
      continue;
    }

    if (character === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += character;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function isCorruptedNoiseRow(row) {
  const dashboard = row.dashboard || '';
  const kpi = row.kpi || '';
  const databricksValue = row.databricksValue || '';
  const status = row.status || '';
  const notes = row.notes || '';
  const other = [row.uiLabel, row.uiValue, databricksValue, status, row.pctDifference, row.tolerancePercent, notes]
    .map(v => (v || '').trim())
    .join('');

  const noisePattern = /^(Search path:|If you did not qualify|To tolerate the error|== SQL ==|WITH latest_snapshot AS \(|date_filter AS \(|SELECT$|FROM\s|JOIN\s|WHERE\s|\)|\()|^\[PARSE_SYNTAX_ERROR\]/i;
  if (noisePattern.test(dashboard) || noisePattern.test(kpi)) return true;

  // Legacy bad rows had SQL fragments spread across columns with empty metadata.
  const noMetadata = !String(status).trim() && !String(notes).trim() && !String(row.pctDifference || '').trim() && !String(row.tolerancePercent || '').trim();
  if (noMetadata && /SQLSTATE:|PARSE_SYNTAX_ERROR|UNBOUND_SQL_PARAMETER|Search path:/i.test(`${dashboard} ${kpi} ${row.uiLabel || ''} ${databricksValue}`)) {
    return true;
  }

  if (other.length === 0 && (!dashboard.trim() || !kpi.trim())) return true;

  return false;
}

function pruneLegacyExpandedRows(rows) {
  const keySet = new Set(rows.map(row => `${row.dashboard}::${row.kpi}`));
  return rows.filter((row) => {
    const match = String(row.kpi || '').match(/^(.*)\s#\d+$/);
    if (!match) return true;
    const baseKey = `${row.dashboard}::${match[1]}`;
    return !keySet.has(baseKey);
  });
}

function readRows() {
  if (!fs.existsSync(REPORT_PATH)) return [];
  const content = fs.readFileSync(REPORT_PATH, 'utf8');
  const rows = parseCsvRows(content);
  if (rows.length < 2) return [];
  const dataRows = rows.slice(1).filter(values => values.some(v => String(v || '').trim().length > 0));

  const cleanedRows = dataRows
    .map(values => Object.fromEntries(HEADERS.map((header, index) => [header, values[index] || ''])))
    .filter(row => !isCorruptedNoiseRow(row));

  return pruneLegacyExpandedRows(cleanedRows);
}

function writeRows(rows) {
  const headerLine = HEADERS.join(',');
  const dataLines = rows.map(row => HEADERS.map(header => csvValue(row[header])).join(','));
  const content = [headerLine, ...dataLines].join('\n');
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.writeFileSync(REPORT_PATH, `${content}\n`, 'utf8');
      return REPORT_PATH;
    } catch (error) {
      const locked = error.code === 'EBUSY' || error.code === 'EPERM';
      if (!locked || attempt === attempts) {
        if (!locked) throw error;
        // Main file is locked (e.g. open in Excel) - preserve results instead of losing them.
        const fallbackPath = REPORT_PATH.replace(/\.csv$/, `-${Date.now()}.csv`);
        fs.writeFileSync(fallbackPath, `${content}\n`, 'utf8');
        console.warn(`WARNING: ${REPORT_PATH} is locked (close it if open in Excel). Results written to ${fallbackPath} instead.`);
        return fallbackPath;
      }
      const waitUntil = Date.now() + 300;
      while (Date.now() < waitUntil) { /* brief retry backoff */ }
    }
  }
  return REPORT_PATH;
}

function mergeKpiRows(updates, options = {}) {
  const rows = options.reset ? [] : readRows();
  const indexByKey = new Map();
  rows.forEach((row, index) => {
    indexByKey.set(`${row.dashboard}::${row.kpi}`, index);
  });

  for (const update of updates) {
    const key = `${update.dashboard || ''}::${update.kpi || ''}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      Object.assign(rows[existingIndex], update);
    } else {
      const nextRow = Object.fromEntries(HEADERS.map(header => [header, update[header] ?? '']));
      rows.push(nextRow);
      indexByKey.set(key, rows.length - 1);
    }
  }
  writeRows(rows);
}

module.exports = { REPORT_PATH, mergeKpiRows };