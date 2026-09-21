// Replicates the manual navigation: login -> Select App -> search "Wealth-Pulse" -> open app -> Leadership sidebar link.

async function loginToWealthPulse(page, baseUrl, user, pass) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('Enter Email').fill(user);
  await page.getByPlaceholder('Enter Password').fill(pass);
  await page.getByRole('button', { name: 'LOGIN', exact: true }).click();
  await page.waitForURL(/\/landingpage/, { timeout: 30000 });
}

async function openWealthPulseApp(page) {
  await page.getByText('Select App', { exact: true }).click();
  await page.getByPlaceholder('Search App').fill('Wealth-Pulse');
  await page.getByText('Wealth-Pulse', { exact: true }).click();
  await page.waitForURL(/\/advisor-portal\/dashboard|\/leadership-portal\//, { timeout: 30000 });
}

async function selectEnvironment(page, envName = 'dev') {
  // Select environment from top-right header dropdown (e.g. switch from 'prod' to 'dev')
  try {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Check if environment is already set
    const headerText = await page.locator('header, nav, [class*="TopNav"]').innerText().catch(() => '');
    if (new RegExp(`Environment\\s*${envName}`, 'i').test(headerText)) {
      console.log(`[Nav] Environment is already set to '${envName}'`);
      return;
    }

    // Locate and click the Environment dropdown trigger in top-right header
    const envTrigger = page.locator('[class*="environment"], [class*="Environment"]')
      .or(page.locator('button, div, span').filter({ hasText: /^prod$/i }))
      .or(page.getByText('prod', { exact: true }))
      .first();

    await envTrigger.click({ timeout: 5000 }).catch(async () => {
      await page.getByText(/Environment/i).click({ timeout: 5000 });
    });
    
    await page.waitForTimeout(500);

    // Locate the environment menu item (e.g. <div class="TopNav-module__environmentMenuItem...">dev</div>)
    const menuItem = page.locator('[class*="environmentMenuItem"], [class*="EnvironmentMenuItem"]')
      .filter({ hasText: new RegExp(`^${envName}$`, 'i') })
      .or(page.getByText(new RegExp(`^${envName}$`, 'i')))
      .first();

    await menuItem.click({ force: true, timeout: 5000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    console.log(`[Nav] Successfully switched environment dropdown to '${envName}'`);
  } catch (err) {
    console.warn(`[Nav] Environment selection attempt for '${envName}' warning: ${err.message}`);
  }
}

async function goToLeadershipDashboard(page, sidebarLinkText) {
  // Sidebar entries are buttons; plain text/link matches also hit breadcrumbs.
  await page.getByRole('button', { name: new RegExp(`^${sidebarLinkText}`, 'i') }).click();
  await page.waitForLoadState('domcontentloaded');
}

async function goToAdvisorDashboard(page, sidebarLinkText) {
  const btn = page.getByRole('button', { name: new RegExp(sidebarLinkText, 'i') }).first();
  await btn.click({ force: true }).catch(async () => {
    await page.getByText(new RegExp(`^${sidebarLinkText}`, 'i')).first().click({ force: true });
  });
  await page.waitForLoadState('domcontentloaded');
}

module.exports = { loginToWealthPulse, openWealthPulseApp, selectEnvironment, goToLeadershipDashboard, goToAdvisorDashboard };

