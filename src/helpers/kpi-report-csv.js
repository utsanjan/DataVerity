const fs = require('fs');
const path = require('path');

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
    if (character === '\r') continue;
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

function readTable(filePath, headers) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parseCsvRows(content);
  if (rows.length < 2) return [];
  return rows
    .slice(1)
    .filter((values) => values.some((v) => String(v || '').trim().length > 0))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function writeTable(filePath, headers, rows) {
  const headerLine = headers.join(',');
  const dataLines = rows.map((row) => headers.map((header) => csvValue(row[header])).join(','));
  const content = [headerLine, ...dataLines].join('\n');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
  fs.writeFileSync(filePath, `${content}\n`, { encoding: 'utf8', flag: 'w' });
  return filePath;
}

module.exports = { readTable, writeTable, parseCsvRows, csvValue };
