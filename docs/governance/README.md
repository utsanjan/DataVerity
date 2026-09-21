# Governance

Validates Governance dashboard KPIs against Databricks, including FinOps chart rows.

## Run

```powershell
npm run governance-validate
```

That captures UI values, runs Databricks SQL, checks notebook recommendations, and writes the HTML report.

## Pipeline

1. `tests/governance/governance-kpi-ui.spec.js` writes `artifacts/reports/csv/governance-kpi-ui-values.csv`.
2. `tests/governance/governance-kpi-databricks.spec.js` writes `governance-kpi-databricks-values.csv`.
3. `src/governance/reporters/governance-kpi-compare.js` writes the comparison CSV and HTML.

Required `.env` values:

- `GOVERNANCE_USER`
- `GOVERNANCE_PASS`
- `DATABRICKS_HOST`
- `DATABRICKS_TOKEN`
- `DATABRICKS_HTTP_PATH` or `DATABRICKS_PATH`

Workspace, date window, and SQL live in `config/governance/`.

## Where things live

| Path | Purpose |
|---|---|
| `config/governance/` | App URL, workspace, date window, KPI SQL |
| `src/governance/helpers/` | Login, navigation, CSV helpers |
| `src/governance/reporters/` | Comparison and HTML report |
| `tests/governance/` | Active specs |
| `fixtures/governance/` | Source test-case files |

The report is `artifacts/reports/html/governance-kpi-validation-report.html`.
