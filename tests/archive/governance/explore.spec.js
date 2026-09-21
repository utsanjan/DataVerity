const { test } = require('@playwright/test');

const BASE_URL = process.env.GOVERNANCE_APP_URL || 'http://20.244.108.100:7004';
const USER = process.env.GOVERNANCE_USER || 'admin@sparkwise.io';
const PASS = process.env.GOVERNANCE_PASS || 'admin123';

test('explore Governance app - click workspace and find dashboards', async ({ page }) => {
  test.setTimeout(300000);
  
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const email = page.getByPlaceholder(/email/i).or(page.locator('input[type="email"]')).or(page.locator('input[name="email"]'));
  const password = page.getByPlaceholder(/password/i).or(page.locator('input[type="password"]'));
  const loginBtn = page.getByRole('button', { name: /sign\s*in|log\s*in/i });

  if (await email.first().isVisible({ timeout: 10000 }).catch(() => false)) {
    console.log('Login form detected');
    await email.first().fill(USER);
    await password.first().fill(PASS);
    await loginBtn.first().click();
    await page.waitForTimeout(8000);
    console.log('URL after login:', page.url());
  }

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);

  console.log('\n=== Clicking workspace "Open" ===');
  const openBtn = page.getByRole('button', { name: /open/i }).or(page.locator('a:has-text("Open")')).or(page.locator('button:has-text("Open")'));
  if (await openBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await openBtn.first().click();
    await page.waitForTimeout(5000);
    console.log('URL after clicking Open:', page.url());
  } else {
    const workspaceRow = page.locator('tr, div[role="row"], .workspace-row, [class*="workspace"]').filter({ hasText: /production|active/i });
    if (await workspaceRow.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await workspaceRow.first().click();
      await page.waitForTimeout(5000);
      console.log('URL after clicking workspace row:', page.url());
    }
  }

  const routesToCheck = [
    '/overview',
    '/finops', 
    '/jobs',
    '/lineage',
    '/clusters',
    '/notebooks',
    '/recommendations',
    '/governance'
  ];

  for (const route of routesToCheck) {
    try {
      console.log(`\n=== Navigating to ${route} ===`);
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2000);

      const text = await page.locator('body').innerText().catch(() => '');
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      console.log(`URL: ${page.url()}`);
      console.log('--- PAGE TEXT (first 80 lines) ---');
      lines.slice(0, 80).forEach((l, i) => console.log(`${i}: ${l.slice(0, 200)}`));

      const allLinks = await page.locator('a[href]').evaluateAll(els => els.map(e => ({ href: e.href, text: e.innerText.trim() }))).catch(() => []);
      console.log('--- ALL LINKS ---');
      allLinks.forEach(l => console.log(`- ${l.text} -> ${l.href}`));

      const navItems = await page.locator('nav a, aside a, [role="navigation"] a, [role="menuitem"], aside button, nav button').allTextContents().catch(() => []);
      console.log('--- NAV / MENU ITEMS ---');
      [...new Set(navItems.map((t) => t.trim()).filter(Boolean))].forEach((t) => console.log('-', t));

      const headings = await page.locator('h1, h2, h3').allTextContents().catch(() => []);
      console.log('--- HEADINGS ---');
      headings.forEach((t) => console.log('-', t.trim()));

    } catch (e) {
      console.log(`Error on ${route}: ${e.message}`);
    }
  }
});
