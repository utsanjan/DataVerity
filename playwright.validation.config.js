// Focused configuration for Wealth Pulse and Governance validation pipelines.
// These projects perform their own authentication and intentionally do not use
// the Promo Pulse storage-state setup from playwright.config.js.
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config();

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['wealth-pulse/**/*.spec.js', 'governance/**/*.spec.js'],
  testIgnore: ['archive/**'],
  outputDir: './artifacts/results/test-results',
  timeout: 180000,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'validation-chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: { slowMo: 200 },
      },
    },
  ],
});
