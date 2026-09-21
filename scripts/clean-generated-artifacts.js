const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const generatedDirectories = [
  '.playwright-mcp',
  'test-results',
  'artifacts/analysis',
  'artifacts/results',
];
const generatedFiles = [
  'artifacts/component_detail_dump.txt',
  'artifacts/component_detail_leadership.txt',
  'artifacts/kpi020_search.txt',
  'artifacts/workbook_kpi_search.txt',
];

for (const relativePath of generatedDirectories) {
  fs.rmSync(path.join(root, relativePath), { recursive: true, force: true });
}
for (const relativePath of generatedFiles) {
  fs.rmSync(path.join(root, relativePath), { force: true });
}

console.log('Removed transient Playwright and analysis artifacts.');
console.log('Validation reports under artifacts/reports were preserved.');
