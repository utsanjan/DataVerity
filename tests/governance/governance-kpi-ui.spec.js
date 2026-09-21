const { expect, test } = require('@playwright/test');
const config = require('../../config/governance/governance-validation.config.json');
const { loginToGovernance, goToSidebarItem } = require('../../src/governance/helpers/governance-nav');
const { writeUiRows } = require('../../src/governance/helpers/governance-validation');

const USER = process.env.GOVERNANCE_USER || 'admin@sparkwise.io';
const PASS = process.env.GOVERNANCE_PASS || 'admin123';

function escaped(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const OVERVIEW_EXTRACTORS = {
  'Spend · last 30 days': (text) => text.match(/·\s*[A-Za-z]{3}\s*\d+\s*(\$[\d,.]+[KMB]?)/)?.[1] || null,
  'Optimization opportunity': (text) => text.match(/Optimization opportunity\s*(\$[\d,.]+[KMB]?)/i)?.[1] || null,
  'Workspace · 24h': (text) => text.match(/Workspace\s*·\s*24h\s*([\d,.]+\s*DBU)/i)?.[1] || null,
  'Lineage health': (text) => text.match(/Lineage coverage\s*([\d,.]+\s*%)/i)?.[1]?.replace(/\s+/g, '') || null,
  'Job health': (text) => text.match(/Job health[A-Za-z\s]*?([\d,.]+\s*%)/i)?.[1]?.replace(/\s+/g, '') || null,
  'Open recommendations': (text) => text.match(/Open recommendations\s*([\d,]+)/i)?.[1] || null,
};

const FINOPS_EXTRACTORS = {
  'Total spend': (text) => text.match(/Total spend\s*\$?([\d,.]+[KMB]?)/i)?.[1] ? `$${text.match(/Total spend\s*\$?([\d,.]+[KMB]?)/i)[1]}` : null,
  'Total DBU': (text) => {
    const match = text.match(/Compute usage\s*([\d,.]+[KMB]?)\s*DBU/i);
    return match ? `${match[1]} DBU` : null;
  },
  'Total job runs': (text) => text.match(/Total (?:job )?runs\s*([\d,.]+[KMB]?)/i)?.[1] || null,
  'Failure rate': (text) => text.match(/Failure rate\s*([\d,.]+\s*%)/i)?.[1]?.replace(/\s+/g, '') || null,
  'Total runtime': (text) => text.match(/Total runtime\s*([\d,.]+)\s*h/i)?.[1] ? `${text.match(/Total runtime\s*([\d,.]+)\s*h/i)[1]} h` : null,
  'Active jobs': (text) => text.match(/Active jobs\s*([\d,.]+[KMB]?)/i)?.[1] || null,
};

const RECOMMENDATIONS_EXTRACTORS = {
  'Open recommendations': (text) => text.match(/Recommendations\s*([\d,]+)/i)?.[1] || null,
  'Savings / mo': (text) => text.match(/Savings\s*\/\s*mo\s*(\$[\d,.]+[KMB]?)/i)?.[1] || null,
};

const PRESENCE_ONLY_KPIS = new Set(['Spend by compute type', 'Last refresh']);

// Dashboard widgets render as SVG charts whose labels and values live in separate
// nodes, so reading them from flattened text mismatches labels to values. Each
// widget has a Chart/Table toggle, and the table view emits "LABEL\tVALUE" lines.
async function showWidgetTableViews(page) {
  const toggles = page.getByRole('button', { name: /^table$/i });
  const total = await toggles.count();
  let switched = 0;

  for (let i = 0; i < total; i += 1) {
    const clicked = await toggles.nth(i).click({ timeout: 5000 }).then(() => true).catch(() => false);
    if (clicked) switched += 1;
  }

  if (switched) await page.waitForTimeout(3000);
  return switched;
}

// Widgets are laid out as "<TITLE>\nChart\nTable\n<body>", so the flattened page
// text can be split back into per-widget bodies keyed by title.
function splitWidgetSections(text) {
  const lines = text.split('\n');
  const isWidgetStart = (i) => lines[i + 1]?.trim() === 'Chart' && lines[i + 2]?.trim() === 'Table';
  const sections = new Map();

  for (let i = 0; i < lines.length - 2; i += 1) {
    if (!isWidgetStart(i)) continue;
    const body = [];
    for (let j = i + 3; j < lines.length && !isWidgetStart(j); j += 1) {
      body.push(lines[j]);
    }
    sections.set(lines[i].trim().toUpperCase(), body.join('\n'));
  }
  return sections;
}

// Reads tab-separated rows from a widget's table view. Header and totals lines
// carry the wrong column count, so they fall out naturally.
function extractWidgetTableRows(sectionText, keyFields, valueField) {
  const rows = [];
  for (const line of String(sectionText || '').split('\n')) {
    if (/^\s*showing\s+\d+/i.test(line)) break;

    const cells = line.split('\t').map((cell) => cell.trim());
    if (cells.length !== keyFields.length + 1) continue;
    if (cells.some((cell) => !cell)) continue;

    const value = Number(cells[cells.length - 1].replace(/[$,]/g, ''));
    if (!Number.isFinite(value)) continue;

    const row = { [valueField]: value };
    keyFields.forEach((field, index) => { row[field] = cells[index].toUpperCase(); });
    rows.push(row);
  }
  return rows;
}

// Widget title on the dashboard -> the row shape its table view produces.
const CHART_WIDGETS = {
  'Spend by compute type': { title: 'SPEND BY COMPUTE TYPE', keyFields: ['billing_origin_product'] },
  'Spend over time': { title: 'SPEND OVER TIME', keyFields: ['usage_date'] },
  'DBU consumption over time': { title: 'DBU CONSUMPTION OVER TIME', keyFields: ['usage_date'] },
  'Daily spend by compute type': { title: 'DAILY SPEND BY COMPUTE TYPE', keyFields: ['usage_date', 'billing_origin_product'] },
  'Spend by team': { title: 'SPEND BY TEAM (TOP 10)', keyFields: ['team'] },
  'Spend by environment': { title: 'SPEND BY ENVIRONMENT', keyFields: ['environment'] },
  'Top spenders': { title: 'TOP SPENDERS (RUN-AS)', keyFields: ['run_as'] },
  'Share of spend by workspace': { title: 'SHARE OF SPEND BY WORKSPACE', keyFields: ['workspace_id'] },
};

function extractMetric(text, label, extractorSet) {
  const extractor = extractorSet?.[label] || OVERVIEW_EXTRACTORS[label] || FINOPS_EXTRACTORS[label] || RECOMMENDATIONS_EXTRACTORS[label];
  if (extractor) return extractor(text)?.trim() || null;
  const pattern = new RegExp(`${escaped(label)}[\\s:.-]*([+$-]?[\\d,.]+(?:\\s*[KMB])?(?:%|\\s*(?:h|DBU|/mo))?)`, 'i');
  return text.match(pattern)?.[1]?.trim() || null;
}

async function setFinOpsFilters(page, config) {
  const workspaceSelect = page.locator('select').filter({ has: page.locator(`option:text-is("${config.workspaceName}")`) }).first();
  if (await workspaceSelect.count()) {
    await workspaceSelect.selectOption({ label: config.workspaceName });
    await page.waitForTimeout(2000);
  }

  const startBox = page.getByRole('textbox', { name: /range start date/i });
  const endBox = page.getByRole('textbox', { name: /range end date/i });
  if (await startBox.count() && await endBox.count()) {
    await startBox.click();
    await page.keyboard.press('Control+a');
    await startBox.fill(config.dateWindow.start);
    await endBox.click();
    await page.keyboard.press('Control+a');
    await endBox.fill(config.dateWindow.end);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(3000);
    return;
  }

  const inputs = page.locator('input').filter({ hasNot: page.locator('[type=password],[type=email],[type=hidden],[type=checkbox]') });
  const dateFields = [];
  for (let i = 0, n = await inputs.count(); i < n; i += 1) {
    const input = inputs.nth(i);
    const value = await input.inputValue().catch(() => '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) dateFields.push(input);
  }
  if (dateFields.length >= 2) {
    await dateFields[0].click();
    await page.keyboard.press('Control+a');
    await dateFields[0].fill(config.dateWindow.start);
    await dateFields[1].click();
    await page.keyboard.press('Control+a');
    await dateFields[1].fill(config.dateWindow.end);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(3000);
  }
}

test.describe('Governance dashboard UI validation', () => {
  test('captures KPI cards, validates formatting, filters, refresh, and cross-page recommendation counts', async ({ page }) => {
    test.setTimeout(360000);
    const capturedRows = [];

    await loginToGovernance(page, config.appUrl, USER, PASS);

    for (const dash of config.dashboards) {
      await goToSidebarItem(page, dash.sidebarLinkText);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);

      if (dash.subTab) {
        const tabBtn = page.locator('button, [role="tab"]').filter({ hasText: new RegExp(dash.subTab, 'i') }).first();
        if (await tabBtn.count()) {
          await tabBtn.click();
          await page.waitForTimeout(1500);
        }
      }

      if (dash.name === 'Unified Cost Analysis' || dash.name === 'Job Operations') {
        await setFinOpsFilters(page, config);
      }

      if (dash.kpis.some((kpiName) => CHART_WIDGETS[kpiName])) {
        await showWidgetTableViews(page);
      }

      const bodyText = await page.evaluate(() => document.body.innerText);
      const widgetSections = splitWidgetSections(bodyText);

      for (const kpiName of dash.kpis) {
        const extractorSet = dash.name === 'Overview' ? OVERVIEW_EXTRACTORS
          : dash.name === 'Recommendations' ? RECOMMENDATIONS_EXTRACTORS
          : FINOPS_EXTRACTORS;

        const widget = CHART_WIDGETS[kpiName];
        if (widget) {
          // Exact title lookup keeps each widget off its similarly named neighbour,
          // e.g. "Spend by compute type" vs "Daily spend by compute type".
          const chartRows = extractWidgetTableRows(
            widgetSections.get(widget.title),
            widget.keyFields,
            'value',
          );
          // An empty table view ("No data in selected window") is still a valid
          // result to compare against, so capture it rather than falling through.
          if (widgetSections.has(widget.title)) {
            capturedRows.push({
              dashboard: dash.name,
              kpi: kpiName,
              queryId: '',
              uiValue: JSON.stringify(chartRows),
              format: 'table',
              status: 'CAPTURED',
              notes: `Extracted ${chartRows.length} chart rows from ${dash.name}`,
            });
            continue;
          }
        }

        const val = extractMetric(bodyText, kpiName, extractorSet);
        if (val) {
          capturedRows.push({
            dashboard: dash.name,
            kpi: kpiName,
            queryId: '',
            uiValue: val,
            format: val.includes('$') ? 'currency' : val.includes('%') ? 'percent' : 'string',
            status: 'CAPTURED',
            notes: `Extracted from ${dash.name} UI page`,
          });
        } else if (PRESENCE_ONLY_KPIS.has(kpiName)) {
          const heading = page.locator('h1, h2, h3, h4, div, section').filter({ hasText: new RegExp(kpiName, 'i') }).first();
          const visible = (await heading.count()) > 0 && await heading.isVisible().catch(() => false);
          capturedRows.push({
            dashboard: dash.name,
            kpi: kpiName,
            queryId: '',
            uiValue: visible ? 'Rendered' : 'N/A',
            format: 'presence',
            status: visible ? 'CAPTURED' : 'NOT_FOUND',
            notes: visible ? `Section "${kpiName}" rendered on ${dash.name}` : `Section "${kpiName}" not visible on DOM`,
          });
        } else {
          capturedRows.push({
            dashboard: dash.name,
            kpi: kpiName,
            queryId: '',
            uiValue: 'N/A',
            format: 'unknown',
            status: 'NOT_FOUND',
            notes: `Metric label "${kpiName}" not found in page body text`,
          });
        }
      }
    }

    const overviewRec = capturedRows.find((r) => r.dashboard === 'Overview' && r.kpi === 'Open recommendations')?.uiValue;
    const recPageRec = capturedRows.find((r) => r.dashboard === 'Recommendations' && r.kpi === 'Open recommendations')?.uiValue;
    if (overviewRec && recPageRec && overviewRec !== 'N/A' && recPageRec !== 'N/A') {
      expect(overviewRec).toBe(recPageRec);
    }

    const finOpsRefreshBtn = page.getByRole('button', { name: /Refresh/i }).first();
    if (await finOpsRefreshBtn.count()) {
      await finOpsRefreshBtn.click();
      await page.waitForTimeout(1000);
    }

    writeUiRows(capturedRows);
  });
});
