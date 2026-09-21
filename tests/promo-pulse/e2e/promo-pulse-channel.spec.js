const { test, expect } = require('@playwright/test');
const {
  findFirstVisible,
  openPromoPulseSection,
  waitForPromoPulseLoad,
} = require('../../../src/promo-pulse/helpers/promo-pulse');

const KPI_LABELS = [
  'Total Channels',
  'Total Spend',
  'Avg Channel ROI',
  'Incremental Revenue',
  'Channel Insights',
];

const FORBIDDEN_PRIMARY_KPIS = [
  'Spend Efficiency',
  'Avg Margin Impact',
  'Promo Intensity',
  'Forecast Acc.',
  'Forecast Accuracy',
];

const KPI_CONTEXTS = [
  {
    label: 'Total Channels',
    urlPattern: /kpi=total-channels-co/i,
    texts: ['Key Insights', 'CHARTS: TOTAL CHANNELS', 'Spend by Channel', 'Avg ROI by Channel', 'Incremental Revenue by Channel'],
  },
  {
    label: 'Total Spend',
    urlPattern: /kpi=total-spend-co/i,
    texts: ['Key Insights', 'CHARTS: TOTAL SPEND', 'Spend by Channel', 'Incremental Revenue by Channel', 'Spend Trend by Channel'],
  },
  {
    label: 'Avg Channel ROI',
    urlPattern: /kpi=avg-channel-roi-co/i,
    texts: ['CHARTS: AVG CHANNEL ROI', 'Channel ROI Ranking', 'ROI vs Spend Efficiency', 'Channel ROI Over Time'],
  },
  {
    label: 'Incremental Revenue',
    urlPattern: /kpi=incremental-revenue-co/i,
    texts: ['Key Insights', 'CHARTS: INCREMENTAL REVENUE', 'Incremental Revenue by Channel', 'Spend by Channel', 'Incremental Revenue Trend by Channel'],
  },
];

const ALL_INSIGHT_HEADINGS = [
  'ROI Spread',
  'Underperforming Channels',
  'Margin Risk Channels',
  'Spend-Revenue Misalignment',
  'Under-Invested High Performer',
];

const CHANNEL_TABLE_COLUMNS = [
  'Channel',
  'Total Spend',
  'Spend Share %',
  'Incr. Revenue',
  'Revenue Share %',
  'Avg ROI',
  'ROI Gap vs Portfolio',
  'Margin Impact',
  'Promo Intensity %',
  'Forecast Acc. %',
  'Spend Efficiency',
  'Actions',
];

const CHANNEL_CARD_TEXTS = [
  'Net Margin Impact',
  'Incr. Revenue',
  'Avg ROI',
  'Promo Intensity',
  'Forecast Acc.',
];

const DETAIL_SECTION_TEXTS = [
  'ELASTICITY & DISCOUNT DIAGNOSTICS',
  'Elasticity Diagnostic',
  'BRAND PERFORMANCE IN CHANNEL',
  'Brand Efficiency Matrix',
  'Seasonal Uplift Pattern',
  'AI Channel Optimization',
  'Run Simulation',
];

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCompactCurrency(value) {
  const match = value.match(/(-?\d+(?:\.\d+)?)([KMB])?/i);
  if (!match) {
    throw new Error(`Could not parse currency value: ${value}`);
  }

  const numericValue = Number.parseFloat(match[1]);
  const suffix = (match[2] || '').toUpperCase();
  const multipliers = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };

  return numericValue * (multipliers[suffix] || 1);
}

function parseCompactRatio(value) {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    throw new Error(`Could not parse ratio value: ${value}`);
  }

  return Number.parseFloat(match[0]);
}

function isSortedAscending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function isSortedDescending(values) {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function waitForAnyVisible(page, candidates, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const locator = await findFirstVisible(page, candidates);
    if (locator) {
      return locator;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`None of the expected surfaces became visible: ${candidates.map(String).join(', ')}`);
}

function getFilterChipList(page) {
  return page.getByRole('region', { name: /^Filters$/i }).getByRole('list').first();
}

async function openKpiContext(page, label, urlPattern) {
  const openContext = async () => {
    const kpiButton = page.getByRole('complementary').first().getByRole('button', {
      name: new RegExp(`^${escapeRegExp(label)}\\b`, 'i'),
    }).first();

    await expect(kpiButton).toBeVisible();
    await kpiButton.click();
    await waitForPromoPulseLoad(page);
  };

  await openContext();

  if (urlPattern && !urlPattern.test(page.url())) {
    await openPromoPulseSection(page, 'channelOverview');
    await expect(page.getByText(/KPI NAVIGATOR/i).first()).toBeVisible();
    await openContext();
  }
}

async function openRichChannelPortfolio(page) {
  await openKpiContext(page, 'Total Channels');
  await waitForAnyVisible(page, [/Key Insights/i, /CHARTS: TOTAL CHANNELS/i]);
  await page.getByRole('tab', { name: /^Channels$/i }).click();
  await waitForPromoPulseLoad(page);
  await expect(page.getByText(/CHANNEL PORTFOLIO/i).first()).toBeVisible();
}

async function ensureFiltersExpanded(page) {
  const openFiltersButton = page.getByRole('button', { name: /Open filters/i }).first();
  if (await isVisible(openFiltersButton)) {
    await openFiltersButton.click();
    await waitForPromoPulseLoad(page);
  }

  await expect(page.getByText(/^Brand$/i).first()).toBeVisible();
  await expect(page.getByText(/^Region$/i).first()).toBeVisible();
  await expect(page.getByText(/^ROI Band$/i).first()).toBeVisible();
}

async function collapseFiltersIfExpanded(page) {
  const closeFiltersButton = page.getByRole('button', { name: /Close filters/i }).first();
  if (await isVisible(closeFiltersButton)) {
    await closeFiltersButton.click();
    await waitForPromoPulseLoad(page);
  }
}

async function selectFilterOption(page, optionName) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await ensureFiltersExpanded(page);

    try {
      await page.getByRole('button', { name: optionName }).first().click();
      await waitForPromoPulseLoad(page);
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }
}

async function openTableView(page) {
  await page.getByRole('button', { name: /Table View/i }).first().click();
  await waitForPromoPulseLoad(page);
  await waitForAnyVisible(page, [/No data available/i, /^Channel$/i]);
}

async function openCardView(page) {
  await page.getByRole('button', { name: /Card View/i }).first().click();
  await waitForPromoPulseLoad(page);
  await waitForAnyVisible(page, [/View Channel Details/i, /No data available/i, /CHANNEL PORTFOLIO/i]);
}

async function readChannelTable(page) {
  const rows = page.locator('table').first().locator('tbody tr');
  const rowCount = await rows.count();
  const entries = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const cells = rows.nth(rowIndex).locator('td');
    const cellCount = await cells.count();
    const values = [];

    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      values.push(normalizeWhitespace(await cells.nth(cellIndex).innerText()));
    }

    if (values.length === 1 && /No data available/i.test(values[0])) {
      return [];
    }

    if (values.length >= 12) {
      entries.push({
        channel: values[0],
        totalSpendText: values[1],
        spendShareText: values[2],
        incrementalRevenueText: values[3],
        revenueShareText: values[4],
        avgRoiText: values[5],
        roiGapText: values[6],
        marginImpactText: values[7],
        promoIntensityText: values[8],
        forecastAccuracyText: values[9],
        spendEfficiencyText: values[10],
        actionsText: values[11],
      });
    }
  }

  return entries;
}

async function readKpiValue(page, label) {
  const text = normalizeWhitespace(await page.getByRole('button', { name: new RegExp(escapeRegExp(label), 'i') }).first().innerText());

  if (/Total Channels|Channel Insights/i.test(label)) {
    const match = text.match(/\b(\d+)\b/);
    return match ? Number.parseInt(match[1], 10) : NaN;
  }

  if (/ROI/i.test(label)) {
    return parseCompactRatio(text);
  }

  return parseCompactCurrency(text);
}

async function openChannelDetailFromTable(page) {
  await openRichChannelPortfolio(page);
  await openTableView(page);

  const detailButton = page.getByRole('button', { name: /View Details/i }).first();
  await expect(detailButton).toBeVisible();
  await detailButton.click();
  await waitForPromoPulseLoad(page);
  await expect(page.getByRole('button', { name: /Back to Channel Portfolio/i })).toBeVisible();
}

test.describe('Promo Pulse - Channel Overview', () => {
  test.beforeEach(async ({ page }) => {
    await openPromoPulseSection(page, 'channelOverview');
    await expect(page.getByText(/KPI NAVIGATOR/i).first()).toBeVisible();
  });

  test('TP-CHOV-001 TP-CHOV-002 TP-CHOV-040 shows the 5 primary navigator KPIs and current summary values', async ({ page }) => {
    for (const label of KPI_LABELS) {
      await expect(page.getByRole('button', { name: new RegExp(escapeRegExp(label), 'i') }).first()).toBeVisible();
    }

    await expect(page.getByRole('button', { name: /Run Insight Engine/i })).toBeVisible();

    const navigatorText = normalizeWhitespace(await page.getByRole('complementary').first().innerText());
    for (const label of FORBIDDEN_PRIMARY_KPIS) {
      expect(navigatorText).not.toContain(label);
    }

    expect(await readKpiValue(page, 'Total Channels')).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(await readKpiValue(page, 'Total Spend'))).toBeTruthy();
    expect(Number.isFinite(await readKpiValue(page, 'Avg Channel ROI'))).toBeTruthy();
    expect(Number.isFinite(await readKpiValue(page, 'Incremental Revenue'))).toBeTruthy();
    expect(await readKpiValue(page, 'Channel Insights')).toBeGreaterThanOrEqual(0);
  });

  test('TP-CHOV-003 TP-CHOV-020 TP-CHOV-021 channel insights opens the all-insights intelligence workspace', async ({ page }) => {
    await openKpiContext(page, 'Channel Insights', /kpi=channel-insights/i);
    await expect(page.getByRole('tab', { name: /^Intelligence$/i, selected: true })).toBeVisible();

    const noInsightsMessage = page.getByText(/No insights available for the selected filters/i).first();
    if (await isVisible(noInsightsMessage)) {
      await expect(noInsightsMessage).toBeVisible();
      return;
    }

    await expect(page.getByRole('heading', { name: /All Channel Insights/i })).toBeVisible();
    for (const heading of ALL_INSIGHT_HEADINGS) {
      await expect(page.getByRole('heading', { name: new RegExp(escapeRegExp(heading), 'i') }).first()).toBeVisible();
    }
  });

  test('TP-CHOV-004 TP-CHOV-005 TP-CHOV-006 TP-CHOV-007 KPI cards load their current intelligence contexts', async ({ page }) => {
    for (const context of KPI_CONTEXTS) {
      await test.step(`Open ${context.label}`, async () => {
        await openKpiContext(page, context.label);
        await expect(page).toHaveURL(context.urlPattern);
        for (const text of context.texts) {
          await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
        }
      });
    }
  });

  test('TP-CHOV-010 TP-CHOV-011 TP-CHOV-012 TP-CHOV-064 filter bar controls render and persist across tab switches', async ({ page }) => {
    await openKpiContext(page, 'Total Channels');
    await ensureFiltersExpanded(page);

    await expect(page.getByRole('button', { name: /^Monthly$/i, pressed: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Quarterly$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Yearly$/i })).toBeVisible();
    await expect(page.getByText(/^Brand$/i).first()).toBeVisible();
    await expect(page.getByText(/^Region$/i).first()).toBeVisible();
    await expect(page.getByText(/^ROI Band$/i).first()).toBeVisible();

    await page.getByRole('button', { name: /^Quarterly$/i }).click();
    await waitForPromoPulseLoad(page);
    await expect(page.getByRole('button', { name: /^Quarterly$/i, pressed: true })).toBeVisible();

    await page.getByRole('tab', { name: /^Channels$/i }).click();
    await waitForPromoPulseLoad(page);
    await page.getByRole('tab', { name: /^Intelligence$/i }).click();
    await waitForPromoPulseLoad(page);
    await expect(page.getByRole('button', { name: /^Quarterly$/i, pressed: true })).toBeVisible();
  });

  test('TP-CHOV-013 TP-CHOV-060 ROI band selection updates the active chip and keeps the filtered channel workspace usable', async ({ page }) => {
    await openRichChannelPortfolio(page);
    await selectFilterOption(page, /^Low \(<1x\)$/i);
    await collapseFiltersIfExpanded(page);
    await expect(page.getByText(/^Low \(<1x\)$/i).first()).toBeVisible();

    await openTableView(page);
    const rows = await readChannelTable(page);
    if (rows.length === 0) {
      await expect(page.getByText(/No data available/i).first()).toBeVisible();
      return;
    }

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => Number.isFinite(parseCompactRatio(row.avgRoiText)))).toBeTruthy();
    await expect(page.getByText(/^Low \(<1x\)$/i).first()).toBeVisible();
  });

  test('TP-CHOV-014 region selections persist in the filter chips, with brand filtering covered when the environment populates it', async ({ page }) => {
    await openKpiContext(page, 'Total Channels');
    await ensureFiltersExpanded(page);
    const brandOptionCount = await page.getByRole('group', { name: /^Brand$/i }).getByRole('button').count();

    await selectFilterOption(page, /^West$/i);
    await selectFilterOption(page, /^Midwest$/i);

    if (brandOptionCount >= 1) {
      await ensureFiltersExpanded(page);
      await page.getByRole('group', { name: /^Brand$/i }).getByRole('button').first().click();
      await waitForPromoPulseLoad(page);
    }

    await collapseFiltersIfExpanded(page);
    const chipText = normalizeWhitespace(await page.locator('main').getByRole('list').first().innerText());
    expect(chipText).toMatch(/Midwest|West/);
  });

  test('clears applied channel filters back to the default All state', async ({ page }) => {
    test.slow();

    await openKpiContext(page, 'Total Channels');
    await selectFilterOption(page, /^West$/i);
    await selectFilterOption(page, /^Low \(<1x\)$/i);
    await collapseFiltersIfExpanded(page);

    await expect(page.getByText(/^West$/i).first()).toBeVisible();
    await expect(page.getByText(/^Low \(<1x\)$/i).first()).toBeVisible();

    await page.getByRole('button', { name: /Clear all/i }).click();
    await ensureFiltersExpanded(page);
    await expect(page.getByRole('button', { name: /Clear all/i })).toHaveCount(0);
    await expect(page.getByRole('group', { name: /^Region$/i }).getByRole('button', { name: /^West$/i })).toBeVisible();
    await expect(page.getByRole('group', { name: /^ROI Band$/i }).getByRole('button', { name: /^All$/i })).toBeVisible();
  });

  test('TP-CHOV-022 TP-CHOV-026 intelligence views expose the currently implemented charts and risk insight cards', async ({ page }) => {
    await openKpiContext(page, 'Avg Channel ROI');
    await expect(page.getByText('Channel ROI Ranking', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('ROI vs Spend Efficiency', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Channel ROI Over Time', { exact: false }).first()).toBeVisible();

    await openKpiContext(page, 'Channel Insights');
    await waitForAnyVisible(page, [
      /No insights available for the selected filters/i,
      /All Channel Insights/i,
      /Margin Risk Channels/i,
      /Spend-Revenue Misalignment/i,
    ]);

    const noInsightsMessage = page.getByText(/No insights available for the selected filters/i).first();
    if (await isVisible(noInsightsMessage)) {
      await expect(noInsightsMessage).toBeVisible();
      return;
    }

    await expect(page.getByRole('heading', { name: /All Channel Insights/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Margin Risk Channels/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Spend-Revenue Misalignment/i })).toBeVisible();
  });

  test('TP-CHOV-030 TP-CHOV-031 TP-CHOV-034 channels tab supports table and card views with the current portfolio schema', async ({ page }) => {
    await openRichChannelPortfolio(page);
    await expect(page.getByRole('searchbox', { name: /Search channels/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Table View/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Card View/i })).toBeVisible();

    await openTableView(page);
    for (const column of CHANNEL_TABLE_COLUMNS) {
      await expect(page.getByText(column, { exact: false }).first()).toBeVisible();
    }

    await openCardView(page);
    const detailButton = await findFirstVisible(page, [/View Channel Details/i, /View Details/i]);
    if (!detailButton) {
      await expect(page.getByRole('button', { name: /Card View/i, pressed: true })).toBeVisible();
      return;
    }

    for (const text of CHANNEL_CARD_TEXTS) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByText(/ROI Risk|Margin Risk/i).first()).toBeVisible();
  });

  test('TP-CHOV-032 TP-CHOV-033 grid view supports sorting and search when channel rows are available', async ({ page }) => {
    await openRichChannelPortfolio(page);
    await openTableView(page);

    let rows = await readChannelTable(page);
    if (rows.length === 0) {
      await expect(page.getByText(/No data available/i).first()).toBeVisible();
      return;
    }

    const searchBox = page.getByRole('searchbox', { name: /Search channels/i });
    const searchTerm = rows[0].channel;
    await searchBox.fill(searchTerm);
    await waitForPromoPulseLoad(page);

    rows = await readChannelTable(page);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.channel.includes(searchTerm))).toBeTruthy();

    await searchBox.fill('');
    await waitForPromoPulseLoad(page);
    await page.getByRole('columnheader', { name: /^Avg ROI$/i }).click();
    await waitForPromoPulseLoad(page);

    rows = await readChannelTable(page);
    expect(rows.length).toBeGreaterThan(1);

    const roiValues = rows.map((row) => parseCompactRatio(row.avgRoiText));
    expect(isSortedAscending(roiValues) || isSortedDescending(roiValues)).toBeTruthy();
  });

  test('shows channel portfolio pagination and page size controls when the table view is open', async ({ page }) => {
    await openRichChannelPortfolio(page);
    await openTableView(page);

    await expect(page.getByRole('button', { name: /left/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /right/i }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: /Page Size/i })).toBeVisible();
    await expect(page.getByText(/\/ page/i).first()).toBeVisible();
  });

  test('TP-CHOV-035 TP-CHOV-036 TP-CHOV-065 channel detail drill-down exposes the current detail sections', async ({ page }) => {
    await openChannelDetailFromTable(page);
    for (const text of DETAIL_SECTION_TEXTS) {
      await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
    }
  });

  test('shows the implemented discount-health and seasonal-detail diagnostics after opening a channel detail', async ({ page }) => {
    await openChannelDetailFromTable(page);

    await expect(page.getByText(/Over-Discounting Detected|Discount Depth On Target/i).first()).toBeVisible();
    await expect(page.getByText(/Peak ROI bucket|Optimal Brand/i).first()).toBeVisible();
    await expect(page.getByText(/High seasonal dependency|Channel performs strongest/i).first()).toBeVisible();
  });

  test('returns from channel detail back to the portfolio without losing the overview shell', async ({ page }) => {
    await openChannelDetailFromTable(page);

    await page.getByRole('button', { name: /Back to Channel Portfolio/i }).click();
    await waitForPromoPulseLoad(page);

    await expect(page.getByText(/KPI NAVIGATOR/i).first()).toBeVisible();
    await page.getByRole('tab', { name: /^Channels$/i }).click();
    await waitForPromoPulseLoad(page);
    await waitForAnyVisible(page, [/CHANNEL PORTFOLIO/i, /Search channels/i, /No data available/i]);
    await expect(page.getByText(/CHANNEL PORTFOLIO/i).first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Channels$/i, selected: true })).toBeVisible();
  });

  test('TP-CHOV-041 no-result channel searches render an explicit empty state', async ({ page }) => {
    await openRichChannelPortfolio(page);
    await openTableView(page);

    await page.getByRole('searchbox', { name: /Search channels/i }).fill('zz-no-channel-match');
    await waitForPromoPulseLoad(page);
    await expect(page.getByText(/No data available/i).first()).toBeVisible();
  });

  test('TP-CHOV-050 TP-CHOV-051 TP-CHOV-052 keeps the module usable at desktop width with role-addressable controls', async ({ page }) => {
    test.slow();

    await page.setViewportSize({ width: 1280, height: 900 });
    await openRichChannelPortfolio(page);
    await selectFilterOption(page, /^West$/i);
    await selectFilterOption(page, /^Low \(<1x\)$/i);
    await collapseFiltersIfExpanded(page);

    await expect(page.getByRole('tab', { name: /^Intelligence$/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Channels$/i })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: /Search channels/i })).toBeVisible();

    const hasAcceptableOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= Math.ceil(window.innerWidth * 1.2));
    expect(hasAcceptableOverflow).toBeTruthy();
  });

  test('TP-CHOV-043 TP-CHOV-053 TP-CHOV-054 TP-CHOV-055 portfolio totals stay internally consistent with the visible channel grid', async ({ page }) => {
    const startTime = Date.now();
    await openRichChannelPortfolio(page);
    await openTableView(page);

    const rows = await readChannelTable(page);
    expect(rows.length).toBeGreaterThan(0);

    const totalChannels = await readKpiValue(page, 'Total Channels');
    const totalSpend = await readKpiValue(page, 'Total Spend');
    const avgChannelRoi = await readKpiValue(page, 'Avg Channel ROI');

    const summedSpend = rows.reduce((total, row) => total + parseCompactCurrency(row.totalSpendText), 0);
    const summedIncrementalRevenue = rows.reduce((total, row) => total + parseCompactCurrency(row.incrementalRevenueText), 0);
    const computedPortfolioRoi = summedIncrementalRevenue / summedSpend;

    expect(rows.length).toBe(totalChannels);
    expect(Math.abs(summedSpend - totalSpend)).toBeLessThanOrEqual(150_000);
    expect(Math.abs(computedPortfolioRoi - avgChannelRoi)).toBeLessThanOrEqual(0.02);
    expect(Date.now() - startTime).toBeLessThan(10_000);
  });
});