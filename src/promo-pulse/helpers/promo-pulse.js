const { expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://135.235.180.85:30000';
const LOGIN_URL = `${BASE_URL}/login`;
const LANDING_URL = `${BASE_URL}/landingpage`;
const APP_NAME = 'Promo Pulse';

const TEST_EMAIL = process.env.TEST_USER || 'user@example.com';
const TEST_PASSWORD = process.env.TEST_PASS || 'SecurePassword123!';

const NAV_BUTTONS = {
  overview: 'Overview Overview',
  promoOverview: 'Promo Overview Promo Overview',
  brandOverview: 'Brand Overview Brand Overview',
  channelOverview: 'Channel Overview Channel Overview',
  customerOverview: 'Customer Overview Customer Overview',
};

const SECTION_URL_PATTERNS = {
  overview: /\/insights-portal\/overview(?:\?|$)/i,
  promoOverview: /\/insights-portal\/promo-overview(?:\?|$)/i,
  brandOverview: /\/insights-portal\/brand-overview(?:\?|$)/i,
  channelOverview: /\/insights-portal\/channel-overview(?:\?|$)/i,
  customerOverview: /\/insights-portal\/customer-overview(?:\?|$)/i,
};

const SECTION_READY_CONTROLS = {
  promoOverview: [/KPI NAVIGATOR/i, /^Filters$/i, /^Promos$/i],
  brandOverview: [/KPI NAVIGATOR/i, /Run Insight Engine/i, /^Filters$/i, /^Brands$/i],
  channelOverview: [/KPI NAVIGATOR/i, /Run Insight Engine/i, /^Filters$/i, /^Channels$/i],
  customerOverview: [/KPI NAVIGATOR/i, /Run Insight Engine/i, /^Filters$/i, /^Customers$/i],
};

const FILTER_PERIODS = ['Monthly', 'Quarterly', 'Yearly'];

async function isVisible(locator) {
  try {
    return await locator.isVisible();
  } catch {
    return false;
  }
}

async function isLoginFormVisible(page) {
  return isVisible(page.getByRole('textbox', { name: 'Email' }).first());
}

async function isPlatformShellVisible(page) {
  const shellControls = [
    page.getByRole('textbox', { name: /Search workspaces, pipelines, assets/i }).first(),
    page.getByRole('button', { name: /Collapse sidebar/i }).first(),
    page.getByRole('button', { name: /Select App/i }).first(),
    page.getByRole('button', { name: /Click to switch/i }).first(),
    page.getByRole('button', { name: NAV_BUTTONS.overview }).first(),
  ];

  for (const locator of shellControls) {
    if (await isVisible(locator)) {
      return true;
    }
  }

  return false;
}

async function waitForAuthSurface(page, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await isPlatformShellVisible(page)) {
      return 'shell';
    }

    if (await isLoginFormVisible(page)) {
      return 'login';
    }

    await page.waitForTimeout(250);
  }

  return null;
}

async function clickFirstVisible(page, candidates) {
  for (const candidate of candidates) {
    for (const role of ['button', 'tab', 'link']) {
      const locator = page.getByRole(role, { name: candidate }).first();
      if (await isVisible(locator)) {
        await locator.click();
        return;
      }
    }

    const textLocator = page.getByText(candidate).first();
    if (await isVisible(textLocator)) {
      await textLocator.click();
      return;
    }
  }

  throw new Error(`Could not find a visible control for: ${candidates.map(String).join(', ')}`);
}

async function findFirstVisible(page, candidates) {
  for (const candidate of candidates) {
    for (const role of ['button', 'tab', 'link']) {
      const locator = page.getByRole(role, { name: candidate }).first();
      if (await isVisible(locator)) {
        return locator;
      }
    }

    const textLocator = page.getByText(candidate).first();
    if (await isVisible(textLocator)) {
      return textLocator;
    }
  }

  return null;
}

async function waitForVisibleControl(page, candidates, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const locator = await findFirstVisible(page, candidates);
    if (locator) {
      return locator;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Could not find a visible control for: ${candidates.map(String).join(', ')}`);
}

async function expectAnyVisibleText(page, values) {
  for (const value of values) {
    const locator = value instanceof RegExp
      ? page.getByText(value).first()
      : page.getByText(value, { exact: false }).first();

    if (await isVisible(locator)) {
      return;
    }
  }

  throw new Error(`None of the expected texts were visible: ${values.map(String).join(', ')}`);
}

async function expectTextsVisible(page, values) {
  for (const value of values) {
    const locator = value instanceof RegExp
      ? page.getByText(value).first()
      : page.getByText(value, { exact: false }).first();
    await expect(locator).toBeVisible();
  }
}

async function waitForPromoPulseLoad(page, timeout = 15000) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const loadingIndicators = [
      page.getByText(/Please Wait/i).first(),
      page.getByText(/Logged in successfully\./i).first(),
      page.getByText(/Loading KPI navigator/i).first(),
      page.getByText(/Loading brands/i).first(),
      page.getByText(/Loading channels/i).first(),
      page.getByText(/Loading insights(\s*&\s*charts)?/i).first(),
      page.getByText(/Loading charts/i).first(),
      page.getByText(/Loading channel portfolio/i).first(),
      page.getByText(/Loading channel details/i).first(),
      page.getByRole('img', { name: /Loader Img/i }).first(),
      page.locator('div[class*="loading-overlay"]').first(),
      page.locator('div[class*="spinner-container"]').first(),
    ];

    let hasVisibleIndicator = false;
    for (const locator of loadingIndicators) {
      if (await isVisible(locator)) {
        hasVisibleIndicator = true;
        break;
      }
    }

    if (!hasVisibleIndicator) {
      return;
    }

    await page.waitForTimeout(250);
  }
}

async function clickVisibleIfPresent(page, candidates) {
  const locator = await findFirstVisible(page, candidates);
  if (!locator) {
    return false;
  }

  await locator.click();
  return true;
}

async function selectPromoPulseTile(page) {
  const searchApp = page.getByRole('textbox', { name: 'Search App' }).first();
  if (await isVisible(searchApp)) {
    await searchApp.fill(APP_NAME);
  }

  const promoPulseApp = await waitForVisibleControl(page, [
    /R RGM - Promo Pulse Edit RGM/i,
    /RGM - Promo Pulse/i,
    /Promo Pulse/i,
  ]);

  await promoPulseApp.click();
  await waitForPromoPulseLoad(page);
}

async function loginToPlatform(page) {
  const currentUrl = page.url();

  if (!currentUrl || currentUrl === 'about:blank') {
    await page.goto(LANDING_URL, { waitUntil: 'domcontentloaded' });
  } else if (/\/login(?:\?|$)/i.test(currentUrl)) {
    // Stay on the login page when the caller explicitly needs an unauthenticated view.
  } else {
    await page.goto(LANDING_URL, { waitUntil: 'domcontentloaded' });
  }

  const currentSurface = await waitForAuthSurface(page);
  if (currentSurface === 'shell') {
    await waitForPromoPulseLoad(page);
    return;
  }

  if (currentSurface !== 'login') {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  }

  const loginSurface = await waitForAuthSurface(page);
  if (loginSurface === 'shell') {
    await waitForPromoPulseLoad(page);
    return;
  }

  if (loginSurface !== 'login') {
    throw new Error(`Could not reach the Promo Pulse login or shell surface. Current URL: ${page.url()}`);
  }

  const emailInput = page.getByRole('textbox', { name: 'Email' }).first();
  const passwordInput = page.getByRole('textbox', { name: 'Password' }).first();
  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();

  await emailInput.fill(TEST_EMAIL);
  await passwordInput.fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'LOGIN' }).click();
  await page.waitForURL('**/landingpage', { timeout: 30000 });
  await expect(page).toHaveURL(LANDING_URL);
}

async function openPromoPulseApp(page) {
  const overviewNav = page.getByRole('button', { name: NAV_BUTTONS.overview }).first();
  if (await isVisible(overviewNav)) {
    return;
  }

  const directAppEntry = await findFirstVisible(page, [
    /RGM - Promo Pulse/i,
    /Promo Pulse/i,
  ]);

  if (directAppEntry) {
    await directAppEntry.click();
  } else {
    const appEntry = await waitForVisibleControl(page, [
      /Select App/i,
      /Click to switch/i,
      /RGM - Promo Pulse/i,
      /Promo Pulse/i,
    ]);

    await appEntry.click();
  }
  await selectPromoPulseTile(page);

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await isVisible(overviewNav)) {
      return;
    }

    const appSwitcher = await findFirstVisible(page, [
      /Select App/i,
      /Click to switch/i,
      /Apps/i,
    ]);

    if (appSwitcher) {
      await appSwitcher.click();
      await selectPromoPulseTile(page);
      continue;
    }

    await page.waitForTimeout(500);
  }

  throw new Error('Promo Pulse dashboard navigation did not appear after app selection.');
}

async function openPromoPulseSection(page, section) {
  await loginToPlatform(page);
  await openPromoPulseApp(page);

  const navName = NAV_BUTTONS[section];
  const sectionUrlPattern = SECTION_URL_PATTERNS[section];
  if (!navName) {
    throw new Error(`Unknown Promo Pulse section: ${section}`);
  }

  if (sectionUrlPattern && sectionUrlPattern.test(page.url())) {
    await waitForPromoPulseLoad(page);
    const readyCandidates = SECTION_READY_CONTROLS[section];
    if (readyCandidates) {
      await waitForVisibleControl(page, readyCandidates);
    }
    return;
  }

  const readyCandidates = SECTION_READY_CONTROLS[section];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: navName }).click();
    if (sectionUrlPattern) {
      await expect(page).toHaveURL(sectionUrlPattern);
    }

    await waitForPromoPulseLoad(page);
    if (!readyCandidates) {
      return;
    }

    const readyControl = await findFirstVisible(page, readyCandidates);
    if (readyControl) {
      return;
    }
  }

  if (readyCandidates) {
    await waitForVisibleControl(page, readyCandidates);
  }
}

async function openTab(page, tabName) {
  await waitForPromoPulseLoad(page);

  const tab = await waitForVisibleControl(page, [
    new RegExp(`^${tabName}$`, 'i'),
  ]);

  await tab.click();
  await waitForPromoPulseLoad(page);
}

async function openPromosTab(page) {
  await openTab(page, 'Promos');
}

async function openBrandsTab(page) {
  await openTab(page, 'Brands');
}

async function openChannelsTab(page) {
  await openTab(page, 'Channels');
}

async function openCustomersTab(page) {
  await openTab(page, 'Customers');
}

async function openFirstPromoDetailsIfPresent(page) {
  await openPromosTab(page);
  const detailEntry = await findFirstVisible(page, [/View Details/i]);
  if (!detailEntry) {
    return false;
  }

  await detailEntry.click();
  await waitForPromoPulseLoad(page);
  return true;
}

async function openFirstPromoDetails(page) {
  const opened = await openFirstPromoDetailsIfPresent(page);
  if (!opened) {
    throw new Error('No promo detail entry point was visible in the current environment.');
  }
}

async function openFirstBrandDetailsIfPresent(page) {
  await openBrandsTab(page);
  const detailEntry = await findFirstVisible(page, [/View Details/i, /Details/i]);
  if (!detailEntry) {
    return false;
  }

  await detailEntry.click();
  await waitForPromoPulseLoad(page);
  return true;
}

async function openFirstBrandDetails(page) {
  const opened = await openFirstBrandDetailsIfPresent(page);
  if (!opened) {
    throw new Error('No brand detail entry point was visible in the current environment.');
  }
}

async function openFirstChannelDetailsIfPresent(page) {
  await openChannelsTab(page);
  const detailEntry = await findFirstVisible(page, [/View Channel Details/i, /Details/i]);
  if (!detailEntry) {
    return false;
  }

  await detailEntry.click();
  await waitForPromoPulseLoad(page);
  return true;
}

async function openFirstChannelDetails(page) {
  const opened = await openFirstChannelDetailsIfPresent(page);
  if (!opened) {
    throw new Error('No channel detail entry point was visible in the current environment.');
  }
}

async function expectFilterControls(page) {
  await expect(page.getByRole('button', { name: /Open filters/i })).toBeVisible();

  for (const period of FILTER_PERIODS) {
    await expect(page.getByRole('button', { name: period }).first()).toBeVisible();
  }
}

module.exports = {
  BASE_URL,
  LOGIN_URL,
  LANDING_URL,
  APP_NAME,
  NAV_BUTTONS,
  FILTER_PERIODS,
  TEST_EMAIL,
  TEST_PASSWORD,
  clickFirstVisible,
  clickVisibleIfPresent,
  findFirstVisible,
  expectAnyVisibleText,
  expectFilterControls,
  expectTextsVisible,
  loginToPlatform,
  openPromoPulseApp,
  openPromoPulseSection,
  openPromosTab,
  openBrandsTab,
  openChannelsTab,
  openCustomersTab,
  openFirstPromoDetailsIfPresent,
  openFirstPromoDetails,
  openFirstBrandDetailsIfPresent,
  openFirstBrandDetails,
  openFirstChannelDetailsIfPresent,
  openFirstChannelDetails,
  waitForPromoPulseLoad,
};