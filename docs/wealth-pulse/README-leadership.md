# Wealth Pulse Leadership notes

Use the current pipeline, not the old single-spec flow.

```powershell
npm run wealth-pulse-leadership-validate
```

That command:

1. Reads KPI values from the Leadership UI.
2. Runs the Databricks queries from `config/wealth-pulse/leadership-kpi-validation.config.json`.
3. Writes `artifacts/reports/html/leadership-kpi-comparison-report.html`.

Login credentials come from `.env` (`TEST_USER` / `TEST_PASS`). Databricks credentials also come from `.env`.

The older combined spec is kept only as reference under `tests/archive/wealth-pulse/`.
