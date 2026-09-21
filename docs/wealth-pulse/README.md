# Wealth Pulse

Validates Leadership and Advisor portal KPIs against Databricks.

## Run

```powershell
npm run wealth-pulse-validate
```

That runs Leadership, then Advisor, then the combined HTML report.

Smaller commands:

```powershell
npm run wealth-pulse-leadership-validate
npm run wealth-pulse-advisor-validate
npm run wealth-pulse-compare-all
```

## Pipeline

1. UI specs write `artifacts/reports/csv/leadership-kpi-ui-values.csv` and `advisor-kpi-ui-values.csv`.
2. Databricks specs write the matching `*-databricks-values.csv` files.
3. Reporters write comparison CSV + HTML, then the combined Wealth Pulse report.

## Where things live

| Path | Purpose |
|---|---|
| `config/wealth-pulse/` | Dashboard list, date window, KPI SQL |
| `src/wealth-pulse/helpers/wealth-pulse-nav.js` | Login and sidebar navigation |
| `src/wealth-pulse/helpers/leadership-kpi-csv.js` | Shared Leadership CSV merge helper |
| `src/wealth-pulse/reporters/` | Comparison and HTML reports |
| `tests/wealth-pulse/` | Active specs |
| `fixtures/wealth-pulse/` | Source test-case files |
| `docs/wealth-pulse/WealthPulse-LogicDoc.xlsx` | Business logic reference |

The combined report is `artifacts/reports/html/wealth-pulse-combined-kpi-comparison-report.html`.
