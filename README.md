# DataVerity

DataVerity is a Playwright-based data validation automation platform for testing product interfaces against their source-of-truth systems. It captures live UI values, executes Databricks SQL validation queries, compares the results, and produces human-readable HTML and machine-readable reports.

The project currently covers three products:

- **Promo Pulse** - UI end-to-end tests
- **Wealth Pulse** - Leadership and Advisor KPI validation against Databricks
- **Governance** - FinOps dashboard KPI and notebook recommendation validation against Databricks

A new teammate should only need this README, a copied `.env`, and the npm scripts below to run DataVerity.

## First-time setup

```powershell
npm install
npx playwright install chromium
copy .env.example .env
```

Fill `.env` with real login and Databricks credentials. Never commit `.env`.

Promo Pulse reads `BASE_URL`, `TEST_USER`, and `TEST_PASS`. Wealth Pulse uses the same login pair. Governance uses `GOVERNANCE_USER` / `GOVERNANCE_PASS` plus the Databricks variables.

## Validation commands

| What you want | Command |
|---|---|
| Promo Pulse UI suite | `npm test` |
| Wealth Pulse validation (Leadership + Advisor) | `npm run wealth-pulse-validate` |
| Governance validation | `npm run governance-validate` |
| Rebuild all HTML reports from the latest CSVs | `npm run reports:build` |
| Generate the DataVerity master report | `npm run master-report` |
| Open the master report in a browser | open `index.html` in the project root |
| Open the Playwright HTML report | `npm run test:report` |

DataVerity reports land in `artifacts/reports/`:

- `html/` - human-readable validation reports, including `master-data-validation-report.html`
- `csv/` - raw UI, Databricks, and comparison tables
- `excel/` - Playwright execution workbook
- `json/` - optional machine-readable extras
- `playwright/` - Playwright HTML report

## Project map

```text
config/          Product settings and SQL used by validation
src/             Shared helpers, navigation, and report generators
tests/           Playwright specs, grouped by product
scripts/         One-off CLI utilities
docs/            How each product is tested
fixtures/        Static test-case CSVs and workbooks
artifacts/       Generated output only (gitignored)
```

| Folder | Use it for |
|---|---|
| `config/<product>/` | URLs, date windows, workspace IDs, KPI SQL. Promo Pulse uses `.env` instead. |
| `src/helpers/` | Shared Databricks and CSV helpers |
| `src/<product>/helpers/` | Login and page navigation |
| `src/<product>/reporters/` | Compare UI vs Databricks and write HTML |
| `tests/<product>/` | Specs you run |
| `tests/archive/` | Old specs kept only for reference. Ignored by Playwright. |
| `docs/<product>/` | Product-specific notes |
| `fixtures/<product>/` | Source test-case files, not generated reports |

## DataVerity pipeline

Wealth Pulse and Governance follow the same three-step validation pipeline:

1. A UI spec reads values from the live app and writes a CSV.
2. A Databricks spec runs the SQL in `config/` and writes a second CSV.
3. A DataVerity reporter compares those CSVs and writes HTML + CSV under `artifacts/reports/`.

Promo Pulse is a conventional Playwright UI suite. It uses `playwright.config.js` and a saved login session from `tests/setup/auth.setup.js`.

Wealth Pulse and Governance log in themselves. Use `playwright.validation.config.js` (the npm scripts already do this). `playwright.local.config.js` is only an alias for that file.

Do not commit generated files. `playwright/.auth/` is a saved login session. `artifacts/` and `test-results/` are outputs. Put new specs under `tests/<product>/`, not `tests/archive/`.

## Adding another product

1. Add `config/<product>/`.
2. Add helpers and a reporter under `src/<product>/`.
3. Add specs under `tests/<product>/`.
4. Add an npm script in `package.json`.
5. Register the HTML report in `config/master-validation-report.json`.
6. Run `npm run master-report`.

## More detail

- [Promo Pulse](docs/promo-pulse/README.md)
- [Wealth Pulse](docs/wealth-pulse/README.md)
- [Governance](docs/governance/README.md)