// Consistent formatting so UI-captured text and Databricks-computed numbers
// are shaped the same way (currency compact, percent, plain count).

function formatCurrencyCompact(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return 'N/A';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function formatPercent(num, signed) {
  if (num === null || num === undefined || Number.isNaN(num)) return 'N/A';
  // Two decimals to avoid rounding noise when comparing against UI-displayed values.
  const rounded = num.toFixed(2);
  const prefix = signed && num > 0 ? '+' : '';
  return `${prefix}${rounded}%`;
}

function formatCount(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return 'N/A';
  return String(Math.round(num));
}

function formatByType(valueFormat, num, signed) {
  if (valueFormat === 'currency') return formatCurrencyCompact(num);
  if (valueFormat === 'percent') return formatPercent(num, signed);
  if (valueFormat === 'count') return formatCount(num);
  return num === null || num === undefined ? 'N/A' : String(num);
}

// Parses formatted display strings (from UI or Databricks output) back to a
// comparable base-unit number: "$22.4M" -> 22400000, "1.66%" -> 1.66, "24" -> 24.
function parseDisplayValue(text) {
  if (text === null || text === undefined) return null;
  const trimmed = String(text).replace(/[\u2212\u2013\u2014]/g, '-').trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return null;

  const match = trimmed.match(/^([+-]?)\$?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)([KMB])?%?$/i);
  if (!match) return null;

  const [, signPart, numberPart, suffix] = match;
  let value = parseFloat(numberPart.replace(/,/g, ''));
  if (Number.isNaN(value)) return null;

  if (suffix) {
    const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[suffix.toUpperCase()];
    value *= multiplier;
  }
  if (signPart === '-') value = -value;

  return value;
}

module.exports = {
  formatCurrencyCompact,
  formatPercent,
  formatCount,
  formatByType,
  parseDisplayValue,
};
