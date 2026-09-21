# Promo Pulse

UI end-to-end suite for the Promo Pulse dashboards.

## Run

```powershell
npm test
```

This uses `playwright.config.js`. The `setup` project logs in once through `tests/setup/auth.setup.js` and stores the session in `playwright/.auth/user.json`.

Required `.env` values:

- `BASE_URL`
- `TEST_USER`
- `TEST_PASS`

## Where things live

| Path | Purpose |
|---|---|
| `tests/promo-pulse/e2e/` | Specs |
| `src/promo-pulse/helpers/promo-pulse.js` | Login and shared page helpers |
| `docs/promo-pulse/specs/` | Coverage notes |
| `docs/promo-pulse/plans/` | Test plans |
| `fixtures/promo-pulse/` | Source test-case CSVs and workbooks |

Promo Pulse is not part of the KPI comparison master report. That report covers Wealth Pulse and Governance only.
