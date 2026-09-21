// Governance navigation helpers - mirrors wealth-pulse-nav.js pattern

// The app is served by a Vite dev server that streams ~350 module requests per
// full page load. A cold load intermittently stalls and leaves a blank page, so
// navigate until the target element actually renders rather than once.
async function gotoUntilReady(page, url, readyLocator, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
      await readyLocator.waitFor({ state: 'visible', timeout: 60000 });
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[governance-nav] ${url} did not render (attempt ${attempt}/${attempts})`);
      await page.waitForTimeout(3000);
    }
  }
  throw lastError;
}

async function loginToGovernance(page, baseUrl, user, pass) {
  const emailField = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]')).first();
  await gotoUntilReady(page, `${baseUrl}/login`, emailField);

  await emailField.fill(user);
  await page.getByPlaceholder(/password/i).or(page.locator('input[type="password"]')).first().fill(pass);
  await page.getByRole('button', { name: /sign\s*in|log\s*in/i }).first().click();

  await page.waitForFunction(
    () => Boolean(localStorage.getItem('access_token') || localStorage.getItem('token')),
    { timeout: 60000 },
  ).catch(() => {});

  // The project page gates the app: until a workspace is opened, /overview only
  // renders "Open a workspace to unlock Overview". isVisible() does not wait, so
  // the button has to be awaited explicitly before clicking it.
  const openWorkspace = page.getByRole('button', { name: /^open$/i }).first();
  const workspaceChooserShown = await openWorkspace
    .waitFor({ state: 'visible', timeout: 45000 })
    .then(() => true)
    .catch(() => false);

  if (workspaceChooserShown) {
    await openWorkspace.click();
  }

  const overviewNav = page.getByRole('button', { name: /^overview$/i }).or(page.getByText(/^overview$/i)).first();

  // Prefer in-app routing; a hard reload costs another full module-graph fetch.
  const reachedOverview = await overviewNav
    .waitFor({ state: 'visible', timeout: 60000 })
    .then(() => true)
    .catch(() => false);

  if (!reachedOverview) {
    await gotoUntilReady(page, `${baseUrl}/overview`, overviewNav);
  }
}

async function goToOverview(page) {
  // Already on overview after login
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

async function goToSidebarItem(page, itemName) {
  await page.getByRole('button', { name: new RegExp(`^${itemName}$`, 'i') })
    .or(page.getByText(new RegExp(`^${itemName}$`, 'i')))
    .first()
    .click({ timeout: 15000 });
  await page.waitForLoadState('commit').catch(() => {});
  await page.waitForTimeout(2500);
}

async function goToFinOpsDashboards(page) {
  await goToSidebarItem(page, 'FinOps Dashboards');
}

async function goToJobs(page) {
  await goToSidebarItem(page, 'Jobs');
}

async function goToClusters(page) {
  await goToSidebarItem(page, 'Clusters');
}

async function goToLineage(page) {
  await goToSidebarItem(page, 'Lineage');
}

async function goToNotebooks(page) {
  await goToSidebarItem(page, 'Notebooks');
}

async function goToRecommendations(page) {
  await goToSidebarItem(page, 'Recommendations');
}

module.exports = {
  loginToGovernance,
  goToOverview,
  goToFinOpsDashboards,
  goToJobs,
  goToClusters,
  goToLineage,
  goToNotebooks,
  goToRecommendations,
  goToSidebarItem
};