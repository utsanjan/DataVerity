# Promo Pulse — Page-wise & Widget-wise Logic Documentation

**Purpose:** Strictly documents existing behavior only. No redesign or recommendations.
**Generated from:** Source code audit of all 7 page files in `client/src/pages/`.
**Field priority rule (global):** All computations prefer stored production fields (`promo_spends`, `incremental_revenue`, `roi_pct`, `fitted_sales`, `base_sales`, `incremental_units`, `incremental_profit`) and fall back to legacy columns (`trade_spend`, `promo_sales - baseline_sales`, etc.) only when stored fields are `null` or `undefined`.

---

## Table of Contents

1. [Overview Page](#1-overview-page)
2. [Promo Overview Page](#2-promo-overview-page)
3. [Promo Detail Page](#3-promo-detail-page)
4. [Brand Overview Page](#4-brand-overview-page)
5. [Brand Detail Page](#5-brand-detail-page)
6. [Channel Overview Page](#6-channel-overview-page)
7. [Channel Detail Page](#7-channel-detail-page)

---

## 1. Overview Page

**Route:** `/` (default)
**File:** `client/src/pages/overview.tsx`
**Data sources:** `GET /api/promotions`, `GET /api/insights`, `GET /api/metrics/portfolio`
**Layout:** Fixed-height two-column — left KPI sidebar (250 px) + right scrollable panel area.

**EnrichedPromo construction (applied to every filtered promotion):**
| Field | Logic |
|---|---|
| `incr` | `p.incremental_revenue ?? (p.promo_sales - p.baseline_sales)` |
| `roi` | `p.roi_pct ?? (promo_spends > 0 ? incr / promo_spends : 0)` |
| `netMarginImpact` | `p.incremental_profit ?? (incr × (gross_margin_pct / 100) − promo_spends)` |

**Portfolio metrics priority:** When `/api/metrics/portfolio` returns `total_active_promos > 0`, all 10 KPI values are taken directly from that response (pre-aggregated view). Fallback local computation triggers only when filters narrow the dataset.

---

### 1.1 KPI Sidebar

| Widget | Data Source | Logic / Formula | State | Render |
|---|---|---|---|---|
| **KPI Navigator label** | — | Static | — | `"KPI Navigator"` section label |
| **Total Trade Spend** (`spend`) | `enriched` / portfolio view | `Σ (promo_spends ?? trade_spend)` | Sets `activeKPI = "spend"` | Gold `$` value; delta = `"N promos"` |
| **Incremental Revenue** (`revenue`) | `enriched` / portfolio view | `Σ incremental_revenue` | Sets `activeKPI = "revenue"` | Value; delta = `"Positive lift"` / `"Negative lift"` (green/red) |
| **Average ROI** (`roi`) | `enriched` / portfolio view | `totalIncrRev / totalSpend` | Sets `activeKPI = "roi"` | `X.XXx`; delta = `"High performing"` (≥2×) / `"Above breakeven"` (≥1×) / `"Below breakeven"` (<1×) |
| **Net Margin Impact** (`margin`) | `enriched` / portfolio view | `Σ netMarginImpact = incremental_profit ?? (incr × margin% − spend)` | Sets `activeKPI = "margin"` | `$` value; delta = `"Margin positive"` / `"Margin dilution"` |
| **% Spend in Negative ROI** (`negativeRoi`) | `enriched` / portfolio view | `Σ spend where roi < 0 / totalSpend × 100` | Sets `activeKPI = "negativeRoi"` | `X.X%`; delta = count of loss-making promos |
| **Total Active Promos** (`activePromos`) | `enriched` / portfolio view | `enriched.length` (or `total_active_promos` from view) | Sets `activeKPI = "activePromos"` | Integer; delta = unique brand count |
| **Promo Dependency Ratio** (`promoDependency`) | `enriched` / portfolio view | `totalSpend / Σ (fitted_sales ?? promo_sales)` | Sets `activeKPI = "promoDependency"` | `X.X%`; delta `"High dependency"` if >30%, else `"Healthy ratio"` |
| **Total Brands** (`totalBrands`) | `enriched` / portfolio view | `new Set(brand_name).size` | Sets `activeKPI = "totalBrands"` | Integer; delta = `"across N channels"` |
| **Total Channels** (`totalChannels`) | `enriched` / portfolio view | `new Set(channel_name).size` | Sets `activeKPI = "totalChannels"` | Integer; delta = active promo count |
| **Volume Sold** (`volumeSold`) | `enriched` / portfolio view | `Σ (incremental_units ?? units_sold)` | Sets `activeKPI = "volumeSold"` | Compact integer; delta = `"units across all promos"` |
| **Run Insight Engine button** | — | POST `/api/insights/run-engine` mutation | `isPending` disables + shows spinner | On success: toast `"N insights generated"` + invalidates `/api/insights`; on error: destructive toast |

**Active card styling:** `border-l-4 border-l-[#F5C518] shadow-sm` on active, `border-transparent hover:border-border` on inactive.

---

### 1.2 Filter Bar (sticky)

| Widget | Data Source | Logic | State | Render |
|---|---|---|---|---|
| **Filters toggle button** | — | Toggles `showFilters` | `showFilters: boolean` | `"Filters"` with `ChevronDown` (rotates 180° when open) |
| **Time mode toggle** | — | Sets `timeMode: "monthly" \| "quarterly"` — affects panel chart X-axis grouping key | `timeMode` | Two-segment toggle; active = `bg-primary text-primary-foreground` |
| **Region multi-select** | Derived from `promotions` | `toggleRegion(r)`: adds/removes region from `regionFilter[]`; filters `filtered` array | `regionFilter: string[]` | Badge per selected region with ×; expanded panel shows all regions as badge toggles |
| **Channel multi-select** | Derived from `promotions` | `toggleChannel(c)`: adds/removes from `channelFilter[]`; filters `filtered` array | `channelFilter: string[]` | Badge per selected channel with ×; expanded panel shows all channels |
| **Clear all button** | — | Resets `regionFilter = []`, `channelFilter = []` | Shown when any filter active | Ghost `"Clear all"` button |
| **Filter count** | `enriched.length` | Displays filtered promo count + `" (filtered)"` suffix if any filter active | — | Right-aligned `X promos` text |

---

### 1.3 Active Panel (keyed to `activeKPI`)

Each panel renders two sections: **Section A — Insights** (4 `AnalyticalInsightCard` components) and **Section B — Charts**. Insight card priority and narrative copy are computed inline using the same `enriched` data.

#### Panel: Total Trade Spend (`spend`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Spend Trend chart** | `trendData` | Groups `trade_spend` by `getTimePeriodKey(start_date, timeMode)` → `{period, actual, planned}`. `planned = baseline_sales × 0.9`. Line chart with two lines: actual (gold) and planned (muted). | LineChart, X = period label, Y = compact currency |
| **Channel Spend PieChart** | `channelSpend` | `Σ trade_spend` per `channel_name`, sorted descending | PieChart with `BRAND_COLORS` |
| **Brand Spend BarChart** | `brandSpend` | `Σ trade_spend` per `brand_name`, sorted descending | BarChart |
| **Pareto chart** | `paretoData` | Promotions sorted by `trade_spend` desc; cumulative % computed as running sum / totalSpend | ComposedChart: bars + cumulative % line |
| **Insight: Spend Trajectory** | `trendData` | `spendChangePct = (last.actual − first.actual) / first.actual × 100`; `planAdherence = totalActual / totalPlanned × 100` | Priority: high if `spendChangePct > 20 AND planAdherence > 110` |
| **Insight: Channel Concentration** | `channelSpend` | Top 3 channels' combined spend % of total | Priority: high if >75%, medium if >55% |
| **Insight: Budget Discipline** | `enriched` | `overspend = Σ max(0, trade_spend − baseline_sales × 0.9)` | Priority: high if overspendPct >15% |
| **Insight: Promo Concentration** | `enriched` | Top 10 promos' spend / totalSpend × 100 | Priority: high if >70% |

#### Panel: Incremental Revenue (`revenue`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Revenue Trend chart** | Grouped by period | `Σ incr` per period (monthly/quarterly) | LineChart |
| **Revenue by Brand BarChart** | Per brand | `Σ incr` grouped by `brand_name` | BarChart with `BRAND_COLORS` |
| **Revenue by Channel PieChart** | Per channel | `Σ incr` grouped by `channel_name` | PieChart |
| **Insights (4 cards)** | `enriched` | Top/bottom brand by incremental revenue, lift concentration, negative lift detection | Priority based on negative lift % and concentration |

#### Panel: Average ROI (`roi`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **ROI Distribution BarChart** | `enriched` | Promos bucketed into High (≥2×), Medium (1–2×), Low (0–1×), Negative (<0) | BarChart with ROI band colors |
| **Scatter: Spend vs ROI** | `enriched` | X = `trade_spend`, Y = `roi`, Z = `incr` (bubble size) | ScatterChart; dots colored by `getRoiColor(roi)` |
| **ROI by Channel BarChart** | Per channel | `Σ incr / Σ spend` per channel | BarChart |
| **Insights (4 cards)** | `enriched` | Portfolio ROI vs benchmark 1×, % promos below 1×, top/bottom performers | Priority based on negative ROI concentration |

#### Panel: Net Margin Impact (`margin`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Margin Trend chart** | Grouped by period | `Σ netMarginImpact` per period | LineChart |
| **Margin by Brand** | Per brand | `Σ netMarginImpact` grouped by `brand_name` | BarChart |
| **Margin Waterfall** | `enriched` sorted | Running cumulative margin impact | ComposedChart |
| **Insights (4 cards)** | `enriched` | Margin-positive promo count, worst margin brands, EBITDA risk | — |

#### Panel: % Spend in Negative ROI (`negativeRoi`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Negative ROI promo list** | `enriched` where `roi < 0` | Filtered list showing promo name, spend, ROI | Scrollable table |
| **Spend at risk** | `enriched` | `negativeROISpend / totalSpend × 100` | Display metric |
| **Insights (4 cards)** | `enriched` | Count and spend concentration of loss-making promos | Priority: high if >20% spend in negative ROI |

#### Panel: Total Active Promos (`activePromos`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Promos by channel BarChart** | `enriched` | Count of promos grouped by `channel_name` | BarChart |
| **Promos by brand PieChart** | `enriched` | Count grouped by `brand_name` | PieChart |
| **Insights (4 cards)** | `enriched` | Channel/brand distribution, over-concentration | — |

#### Panel: Promo Dependency Ratio (`promoDependency`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Dependency by brand BarChart** | Per brand | `Σ spend / Σ (fitted_sales ?? promo_sales)` per brand | BarChart |
| **Dependency by channel BarChart** | Per channel | Same formula grouped by channel | BarChart |
| **Insights (4 cards)** | `enriched` | Brands/channels with dep >30%, trend direction | Priority: high if portfolio dep >30% |

#### Panel: Total Brands (`totalBrands`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Brand comparison table** | Per brand | `Σ spend`, `Σ incr`, avg ROI per brand | Sortable table |
| **Insights (4 cards)** | `enriched` | Brand ROI dispersion, over-reliance on top brand | — |

#### Panel: Total Channels (`totalChannels`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Channel comparison table** | Per channel | `Σ spend`, `Σ incr`, avg ROI per channel | Sortable table |
| **Insights (4 cards)** | `enriched` | Channel ROI spread, under-invested channels | — |

#### Panel: Volume Sold (`volumeSold`)

| Sub-widget | Data | Logic | Render |
|---|---|---|---|
| **Volume by brand BarChart** | `enriched` | `Σ (incremental_units ?? units_sold)` per brand | BarChart |
| **Volume by channel PieChart** | `enriched` | Same grouped by channel | PieChart |
| **Insights (4 cards)** | `enriched` | Volume concentration, channel volume efficiency | — |

---

## 2. Promo Overview Page

**Route:** `/promo-overview`
**File:** `client/src/pages/promo-overview.tsx`
**Data sources:** `GET /api/promotions`, `GET /api/metrics/quadrants`
**Layout:** Fixed-height two-column — left KPI sidebar (250 px) + right panel (sticky filter bar → tab header → tab content).
**Persistence:** `localStorage["promoOverviewTab"]` → `"intelligence" | "promos"`; `localStorage["promoOverviewViewMode"]` → `"grid" | "card"`. URL param `?kpi=` sets initial `activeKpi`.

**EnrichedPromo construction:**

| Field | Logic |
|---|---|
| `roi` | `p.roi_pct ?? ((promo_sales − baseline_sales) / trade_spend)` |
| `incremental_revenue` | `p.incremental_revenue ?? (promo_sales − baseline_sales)` |
| `isCurrent` | `new Date(end_date) >= today` |
| `quadrant` | Looked up from `/api/metrics/quadrants` quadrantMap; values: `Scale \| Optimize \| Experiment \| Stop` |

---

### 2.1 KPI Sidebar (250 px, left)

| Widget | Data | Logic | Render |
|---|---|---|---|
| **Promo Insights special card** | `allInsights.length` | Aggregate count of all `generateInsights()` results across all 11 KPIs against `filteredData`; stores as `NarrativeInsight[]` with composite id `{kpi_id}__{insight_id}` | Value = total insight count; click sets `activeKpi = "promo_insights"` |
| **KPI cards (11)** | `filteredData: EnrichedPromo[]` | Each `KPI_DEF.compute(filteredData)` returns formatted string | Clicking sets `activeKpi = kpi.id`; active = `border-l-4 border-l-[#F5C518]`; inactive = `border-transparent hover:border-border` |

**KPI_DEFS (11 KPIs):**

| KPI ID | Label | Formula |
|---|---|---|
| `avg_roi` | Avg ROI | `Σ incr / Σ spend` |
| `total_spend` | Total Spend | `Σ trade_spend` |
| `total_incremental_revenue` | Total Incr. Revenue | `Σ incremental_revenue` |
| `active_promos` | Active Promos | `count where isCurrent = true` |
| `promo_count` | Total Promos | `filteredData.length` |
| `avg_discount` | Avg Discount | `Σ discount_pct / N` |
| `roi_dispersion` | ROI Dispersion | `stddev(roi_per_promo)` |
| `high_roi_share` | High ROI Share | `count(roi ≥ 2) / N × 100` |
| `margin_impact` | Margin Impact | `Σ (incr × gross_margin_pct / 100)` |
| `promo_dependency` | Promo Dependency | `Σ spend / Σ fitted_sales × 100` |
| `uplift_rate` | Uplift Rate | `Σ uplift_pct / N` |

---

### 2.2 Filter Bar (sticky)

| Widget | Data | Logic | State | Render |
|---|---|---|---|---|
| **Filters toggle button** | — | Toggles `showFilters` | `showFilters: boolean` | Chevron rotates 180° when open |
| **Time period toggle** | — | Sets `timePeriod: "monthly" \| "quarterly"` (passed to `KpiCharts`) | `filters.timePeriod` | Segmented control |
| **Active filter badges** | Current filter state | Each active filter (brand/channel/region/promoStatus/roiBand) shows as inline Badge with × to reset individual filter | One badge per active filter | Clickable × resets that single filter |
| **Clear all** | — | Resets brand/channel/region/promoStatus/roiBand to `"all"` | Visible when `hasFilters = true` | Ghost button |
| **Filter count** | `filteredData.length` | Shows `"N promos"` or `"N promos (filtered)"` | — | Right-aligned text |
| **Expanded filter panel** | `filterOptions` | Brand badges (toggle), Channel badges, Region badges, Promo Status badges (`all / active / completed`), ROI Band badges (`all / high (≥2×) / medium (1–2×) / low (<1×)`) | `showFilters` | 3-col grid of badge groups |

**Filter logic:**
- `brand`: exact match on `brand_name`
- `channel`: exact match on `channel_name`
- `region`: exact match on `region`
- `promoStatus` `"active"`: `isCurrent = true`; `"completed"`: `isCurrent = false`
- `roiBand` `"high"`: `roi ≥ 2`; `"medium"`: `roi ≥ 1 AND roi < 2`; `"low"`: `roi < 1`

---

### 2.3 Tab: Intelligence

Conditional based on `activeKpi`:

**If `activeKpi === "promo_insights"`:**

| Widget | Data | Logic | Render |
|---|---|---|---|
| **All Insights grid** | `allInsights` | Full array of `NarrativeInsight` across all 11 KPIs; each insight id = `"{kpi_id}__{insight_id}"` | 2-col `NarrativeInsightCard` grid |

**If `activeKpi !== "promo_insights"` (regular KPI selected):**

| Widget | Data | Logic | State | Render |
|---|---|---|---|---|
| **Section 2A — Insights header** | `activeKpiDef.label` | Label shows `"Insights: {kpiLabel}"` | — | Section title + `"View all insights →"` link (sets `activeKpi = "promo_insights"`) |
| **Section 2A — Insight cards** | `activeKpiInsights` | `generateInsights(activeKpi, filteredData).slice(0, 4)` | — | Up to 4 `NarrativeInsightCard` in 2-col grid; empty state if no insights |
| **Section 2B — Charts header** | `activeKpiDef.label` | `"Charts: {kpiLabel}"` | — | Section title |
| **Section 2B — KpiCharts** | `filteredData`, `timePeriod` | `<KpiCharts kpiId={activeKpi} data={filteredData} timePeriod={filters.timePeriod} />` | — | Recharts panel specific to the active KPI |

---

### 2.4 Tab: Promos

| Widget | Data | Logic | State | Render |
|---|---|---|---|---|
| **Section header** | `filteredData.length` | Shows `"N promos"` with optional `"(filtered)"` and active KPI label | — | Text row |
| **Card/Grid toggle** | — | `CardGridToggle` component | `viewMode: "grid" \| "card"` (persisted to `localStorage`) | Icon pair toggle |
| **Grid view** (`viewMode = "grid"`) | `filteredData` | `<PromoGrid>` — sortable table with columns: Promo Name, Brand, Channel, Start, End, Trade Spend, ROI (colored), Inc. Revenue, Quadrant badge, View Details + Simulate actions | — | Table |
| **Card view** (`viewMode = "card"`) | `filteredData` | `<PromoCardList>` — paginated cards at `CARD_PAGE_SIZE` increments | `visibleCount` resets on data change | 3-col card grid |

**PromoCardList card fields:**

| Field | Logic |
|---|---|
| Promo name + Brand · Channel | Direct fields |
| Quadrant badge | `quadrantBadgeClass(p.quadrant)`: Scale=green, Optimize=amber, Experiment=blue, Stop=red |
| Spend | `formatCurrency(p.trade_spend)` |
| ROI | `p.roi.toFixed(2)x` colored by `roiBandColor(roi)`: ≥2 = `#22c55e`, 1–2 = `#eab308`, <1 = `#ef4444` |
| Inc. Rev | `formatCurrency(p.incremental_revenue)` |
| Discount | `p.discount_pct.toFixed(0)%` |
| Uplift | `p.uplift_pct.toFixed(0)%` |
| Trend sparkline | Simulated 4-bar bars at `roi × [0.6, 0.75, 0.9, 1.0]`, height proportional to max; colored by ROI band |
| View Details | Navigates to `/promo-details/{promotion_id}` |
| Simulate | Navigates to `/simulation?promoId={promotion_id}` |
| Load more | Increments `visibleCount` by `CARD_PAGE_SIZE` when `hasMore` |

---

## 3. Promo Detail Page

**Route:** `/promo-details/:promotion_id`
**File:** `client/src/pages/promo-details.tsx`
**Data sources:** `GET /api/promotions/:id`, `GET /api/promotions` (all, for benchmark/cannib), `GET /api/promotions/:id/decomposition`, `GET /api/promotions/:id/benchmark`, `GET /api/config`, `GET /api/forecasts/:id`

**Derived values (computed once from `promo` + `appConfig`):**

| Field | Formula |
|---|---|
| `incremental_revenue` | `promo.incremental_revenue ?? (promo_sales − baseline_sales)` |
| `roi` | `promo.roi_pct ?? (promo_spends > 0 ? incr / promo_spends : incr / trade_spend)` |
| `duration_days` | `ceil((end_date − start_date) / 86400000)`, min 1 |
| `margin_impact` | `promo.incremental_profit ?? (incr × gross_margin_pct / 100 − spend)` |
| `net_profit` | `incr × gross_margin_pct / 100` |
| `ebitda_impact` | `margin_impact × ebitda_conversion_factor` (from `/api/config`, default `0.85`) |
| `incremental_volume` | `promo.incremental_units ?? (units_sold × incr / promo_sales)`, fallback `incr / 10` |

**Page header badges:**
- **Status badge**: `margin_impact ≥ 0` → `"Profitable"` (green); `roi ≥ 0.9` → `"Break-even"` (amber); else `"Margin Erosion"` (red)
- **Repeat badge**: `roi ≥ 2` → `"Scale"` (green); `roi ≥ 1` → `"Optimize"` (amber); else `"Redesign or Stop"` (red)

---

### 3.1 Ribbon KPIs (8 cards)

| KPI | Source field | Formula | Color |
|---|---|---|---|
| Baseline Sales | `promo.base_sales ?? promo.baseline_sales` | Direct | — |
| Promo Sales | `promo.fitted_sales ?? promo.promo_sales` | Direct | — |
| Incr. Volume | `derived.incremental_volume` | See table above | Accent (green) |
| Incr. Revenue | `derived.incremental_revenue` | See table above | Accent (green) |
| Trade Spend | `promo.promo_spends ?? promo.trade_spend` | Direct | — |
| Net Profit | `derived.net_profit` | `incr × gross_margin_pct / 100` | Green if ≥0, red if <0 |
| ROI | `derived.roi` | See table above | Green if ≥1, red if <1 |
| ROI vs Cat. | `(derived.roi / categoryAvgROI − 1) × 100` | `categoryAvgROI = avg(roi_pct)` across all promos | Green if ≥0, red if <0 |

---

### 3.2 Baseline vs Actual + Post-Promo Dip Chart

| Aspect | Logic |
|---|---|
| **Primary data source** | `GET /api/forecasts/:promotion_id` → `ForecastRow[]` with `forecast_period`, `forecasted_baseline_sales`, `forecasted_actual_sales`; each row maps to `{day, baseline, actual, uplift = max(0, actual − baseline)}` |
| **Fallback (synthetic)** | When no forecast rows: synthetic wave over `min(duration_days, 14)` points + 4 post-promo dip days. Formula: `promoShape = rampUp × rampDown × wave`; `actual = baseDailySales + (promoDailySales − baseDailySales) × promoShape × 1.3`. Post-dip: `actual = baseDailySales − dipMagnitude × (1 − dipFrac)` where `dipMagnitude = (promoDailySales − baseDailySales) × dipPct`. |
| **Post-promo dip %** | `appConfig.post_promo_dip_pct ?? 0.15` |
| **Chart type** | `AreaChart` with three layers: `uplift` area (gold, 15% opacity), `baseline` dashed line (muted), `actual` gold solid line |
| **Post-dip label** | X-axis labels after promo end = `"+Nd"` (e.g. `"+1d"`) |

---

### 3.3 Uplift Decomposition Panel (right of chart)

| Row | Logic |
|---|---|
| Total Uplift | `+{fmt(incremental_revenue)}` (green) |
| Uplift % | `incremental_revenue / baseline_sales × 100` |
| Post-Promo Dip | `−{fmt(dipAmount)}` where `dipAmount = incremental_revenue × post_promo_dip_pct` |
| Pull-Forward % | `dipAmount / incremental_revenue × 100` |
| **Inline flags** | Duration exceeds median: `duration_days > medianDuration` (amber); High discount depth: `discount_pct > 30` (amber); Long duration: `duration_days > 45` (amber); Healthy: none of the above (green) |

`medianDuration` = median of `ceil((end − start) / 86400000)` across all promotions.

---

### 3.4 Financial Breakdown Card

| Row | Formula |
|---|---|
| Gross Margin % | `promo.gross_margin_pct.toFixed(1)%` |
| Incr. Revenue | `+{fmt(incremental_revenue)}` |
| Net Profit | `fmt(net_profit)` — red if negative |
| Trade Spend | `fmt(promo_spends ?? trade_spend)` |
| EBITDA Impact | `fmt(ebitda_impact)` — red if negative |
| Margin Impact | `fmt(margin_impact)` — red if negative |
| **Waterfall bars** | Three horizontal bars: Revenue (100%), Margin (`gross_margin_pct %`), Net after Spend (`max(0, margin_impact / incr × 100)%`) |

---

### 3.5 Driver Attribution Card

Driver scores (0–100 scale, horizontal progress bars):

| Driver | Primary source | Fallback |
|---|---|---|
| **discountScore** | `decomposition.discount_effect_sales_rc / decomposition.incremental_revenue_rc × 100` | `discount_pct / (max_discount_depth_normalizer × 100) × 100`; `max_discount_depth_normalizer` from `/api/config`, default `0.40` |
| **durationScore** | `duration_days / max_promo_duration_days × 100`; `max_promo_duration_days` from `/api/config`, default `60` | Same formula (config always used) |
| **channelScore** | `(decomposition.display_effect_sales_rc + decomposition.feature_effect_sales_rc) / decomposition.incremental_revenue_rc × 100` | `CHANNEL_FACTORS[channel_name] × 70` (static map; E-commerce=1.1, Grocery=1.0, Club=0.95, Drug=0.9, Convenience=0.85, Mass=1.0) |
| **primaryDriver** | `max(discountScore, durationScore, channelScore)` → label: `"High Discount Depth" \| "Strong Channel Performance" \| "Duration Dependency"` | — |

---

### 3.6 Cannibalization Analysis Card

| Field | Formula |
|---|---|
| `concurrentCount` | Count of other promos with same `brand_name` whose date range overlaps this promo's date range |
| `brandPct` | `this.incremental_revenue / Σ brand_incremental_revenue × 100` |
| `risk` | `"High"` if `discount_pct > 25 AND concurrentCount > 3`; `"Medium"` if `discount_pct > 20 OR concurrentCount > 2`; else `"Low"` |
| Color | High = red, Medium = amber, Low = green |

---

### 3.7 Benchmark Comparison Card

| Aspect | Logic |
|---|---|
| **Primary data** | `GET /api/promotions/:id/benchmark` → array of similar promo records. Averages `roi_pct`, `incremental_revenue_rc`, `incremental_profit_rc`. Label = `"Similar Promos"` |
| **Fallback** | Filters all promos: same `brand_name + channel_name` with `|discount_pct − this| ≤ 5`; if <2 similar found, uses all promos. Label = `"Similar Promos"` or `"Category"` |
| **Displayed metrics** | ROI, Incr. Revenue, Margin Impact — each shows: This promo value, Benchmark avg, Delta `(current/benchmark − 1) × 100%` (green if ≥0) |

---

## 4. Brand Overview Page

**Route:** `/brand-overview`
**File:** `client/src/pages/brand-overview.tsx`
**Data sources:** `GET /api/promotions`, `GET /api/metrics/brands`
**Layout:** Fixed-height — left KPI navigator sidebar (220 px) + right panel (sticky filter bar → tabs).
**Persistence:** `localStorage["brandOverview_activeTab"]`, `localStorage["brandOverview_viewMode"]`.

**BrandMetrics construction (priority: `/api/metrics/brands` view → local aggregation):**

| Field | API field (priority) | Local fallback formula |
|---|---|---|
| `total_spend` | `total_spend` | `Σ (promo_spends ?? trade_spend)` |
| `total_promo_sales` | `total_promo_sales` | `Σ (fitted_sales ?? promo_sales)` |
| `total_baseline_sales` | `total_baseline_sales` | `Σ (base_sales ?? baseline_sales)` |
| `incremental_revenue` | `total_incremental_revenue` | `total_promo_sales − total_baseline_sales` |
| `avg_roi` | `brand_roi` | `incremental_revenue / total_spend` |
| `promo_dependency_ratio` | `promo_dependency_ratio` | `total_spend / total_promo_sales` |
| `avg_margin` | — (local always) | `avg(gross_margin_pct)` across brand promos |
| `profitable_promo_pct` | `pct_profitable × 100` | 0 (not locally computed) |
| `growth_vs_ly` | — (local always) | `(recentSales − earlySales) / earlySales × 100` where recent = last 1/3 promos, early = first 1/3 |
| `roi_trend` | — (local always) | Array of `N` ROI values (N=6 monthly, N=4 quarterly), each = `Σ incr / Σ spend` for that time chunk |
| `risk_score` | — (local always) | `computeRisk(promo_dependency_ratio, avg_roi)` |
| `channels` | — (local always) | Per-channel: `{roi, band, spend_pct}` |

---

### 4.1 KPI Navigator Sidebar

| Widget | Data | Logic | Render |
|---|---|---|---|
| **KPI nav buttons** | `filteredBrands` | `BRAND_KPI_DEFS` — each `kpi.compute(filteredBrands)` → displayed value | Clicking sets `activeKpi`; resets `showAllInsights = false`; active = `bg-primary text-primary-foreground` |

**BRAND_KPI_DEFS (representative set):**

| KPI ID | Formula |
|---|---|
| `brand_insights` | Total count of all brand insights across all KPIs |
| `total_brands` | `filteredBrands.length` |
| `total_spend` | `Σ total_spend` |
| `avg_roi` | `Σ incremental_revenue / Σ total_spend` |
| `incr_revenue` | `Σ incremental_revenue` |
| `promo_dependency` | `avg(promo_dependency_ratio × 100)%` |
| `margin_impact` | `avg(avg_margin)` |
| `high_roi_share` | `count(avg_roi ≥ 2) / N × 100` |
| `risk_score` | Count of high-risk brands |
| `growth` | `avg(growth_vs_ly)%` |

---

### 4.2 Filter Bar

| Widget | Data | Logic | State | Render |
|---|---|---|---|---|
| **Filters toggle** | — | Toggles `showFilters` | `showFilters` | Chevron toggles |
| **Time period toggle** | — | `monthly` → 6 ROI trend chunks; `quarterly` → 4 chunks | `filters.timePeriod` | Segmented control |
| **Channel filter** | `allChannels` | `brand must have at least one promo in selected channel: Object.keys(b.channels).includes(filter)` | `filters.channel` | Select dropdown |
| **Region filter** | `allRegions` | `b.regions.includes(filter)` | `filters.region` | Select dropdown |
| **ROI Band filter** | — | `"high"` → `avg_roi ≥ 2`; `"medium"` → `1–2`; `"low"` → `<1` | `filters.roiBand` | Select dropdown |
| **Clear all** | — | Resets channel/region/roiBand to `"all"` | Visible when `hasFilters` | Ghost button |

---

### 4.3 Tab: Intelligence

| Widget | Data | Logic | Render |
|---|---|---|---|
| **Insight cards** | `insights = generateBrandInsights(activeKpi, filteredBrands)` | If `activeKpi === "brand_insights"`: `allInsights = generateBrandInsights("brand_insights", filteredBrands)` (all); else top 4 by default, all if `showAllInsights = true` | `InsightCard` grid |
| **Show all / Show less** | `showAllInsights` | Toggle between `insights.slice(0, 4)` and full `insights` | Button |
| **BrandKpiCharts** | `filteredBrands`, `timePeriod` | Chart panel specific to `activeKpi` | Recharts panel |

---

### 4.4 Tab: Brands

| Widget | Data | Logic | State | Render |
|---|---|---|---|---|
| **Card/Grid toggle** | — | Toggles `viewMode` | `viewMode` (localStorage persisted) | Icon toggle |
| **Grid view** (`BrandGrid`) | `filteredBrands` (paginated at `BRAND_PAGE_SIZE`) | Table columns: Brand Name, Total Spend, Inc. Revenue, Avg ROI (colored), Promo Dep%, Margin Impact, Promo Freq, Growth vs LY, Details button | `page` state | Table with prev/next pagination |
| **Card view** (`BrandCardList`) | `filteredBrands` (paginated at `BRAND_CARD_PAGE_SIZE`) | 3-col card grid | `visibleCount` | Cards with load-more |

**BrandCardList card fields:**

| Field | Logic |
|---|---|
| Brand name | Direct |
| Subtitle | `"N promos · ±X.X% vs LY"` |
| ROI band badge | `roiBand(avg_roi)`: High/Medium/Low → green/amber/red badge |
| Spend | `formatCurrency(total_spend)` |
| Inc. Rev | `formatCurrency(incremental_revenue)` |
| Avg ROI | Colored by `ROI_BAND_COLORS[band]` |
| Promo Dep | `(promo_dependency_ratio × 100).toFixed(0)%` |
| Margin | `avg_margin.toFixed(1)%` |
| Freq | `promo_frequency` (= `promo_count`) |
| Sparkline | `BrandMiniSparkline`: renders `roi_trend` array as proportional bars; bar height = `(v / max) × 100%`; color = `ROI_BAND_COLORS[roiBand(avg_roi)]` |
| View Details | Navigates to `/brand-details/{encodeURIComponent(brand_name)}` |

---

## 5. Brand Detail Page

**Route:** `/brand-details/:brand_name`
**File:** `client/src/pages/brand-details.tsx`
**Data sources:** `GET /api/promotions` (filtered by `brand_name`)

**Strategy classification:**

| Tag | Condition |
|---|---|
| `"Efficient Growth Brand"` | `avg_roi > 1.8 AND promo_dep < 0.5` |
| `"Discount Addicted"` | `avg_roi < 1.2 AND promo_dep > 0.6` |
| `"Balanced"` | All other cases |

**Dependency flag:**

| Flag | Condition |
|---|---|
| `"High Dependency"` | `promo_dep ≥ 0.6` |
| `"Moderate"` | `promo_dep ≥ 0.5` |
| `"Healthy"` | `promo_dep < 0.5` |

---

### 5.1 Ribbon KPIs (7 cards)

| KPI | Formula | Notes |
|---|---|---|
| Baseline Rev | `Σ (base_sales ?? baseline_sales)` | — |
| Promo Rev | `Σ (fitted_sales ?? promo_sales)` | — |
| Promo Dep. | `totalSpend / (totalPromoSales + totalBaseline) × 100%` + inline dep flag | `totalSales = promoSales + baseline` |
| Avg ROI | `totalIncrRev / totalSpend` | Green if ≥1, red if <1 |
| Avg Discount | `avg(discount_pct)%` | — |
| Elasticity Score | `avg[(incrUnits / baseUnits) / (discount_pct / 100)]` per promo; fallback: `avg[incr / (discount_pct × spend)]` | Uses `incremental_units / base_units` when available |
| Margin Trend | Compare `avg(gross_margin_pct)` of last 1/3 vs first 1/3 promos (by start_date); diff > +1pp → `"up"` (green), < −1pp → `"down"` (red), else → `"flat"` | — |

---

### 5.2 Performance & Dependency Trend Chart

| Aspect | Logic |
|---|---|
| **Data** | Promos sorted by `start_date`, chunked into 8 equal buckets → `{period: "P1"…"P8", revenue, margin, roi, dependency}` |
| **Revenue** | `Σ incremental_revenue` per chunk |
| **Margin** | `avg(gross_margin_pct)` per chunk |
| **ROI** | `Σ incr / Σ spend` per chunk |
| **Dependency** | `Σ spend / (Σ fitted_sales + Σ base_sales) × 100` per chunk |
| **Metric toggle** | 3-button toggle: `revenue \| margin \| roi` → switches left Y-axis `dataKey` |
| **Left Y-axis line** | Yellow solid, selected metric |
| **Right Y-axis line** | Red dashed, `dependency %` |

---

### 5.3 Promo Intensity Panel

| Field | Formula |
|---|---|
| Total Promos | `brandPromos.length` |
| Avg Duration | `avg(ceil((end_date − start_date) / 86400000))` days |
| Avg Discount | `avg(discount_pct)%` |
| % Profitable | `count(incremental_profit ?? (incr − spend) > 0) / N × 100` |
| **Top 20% Contribution bar** | Sort by `incremental_revenue` desc; top `ceil(N × 0.2)` promos' sum / `totalIncrRev × 100`. Bar: green if ≤60%, red if >60%. Warning badge `"High Concentration Risk"` if >60%. |

---

### 5.4 Channel Performance Matrix (table)

| Column | Formula |
|---|---|
| Channel | `channel_name` |
| Spend % | `channel.totalSpend / brandTotal_spend × 100` |
| ROI | `channel.totalIncr / channel.totalSpend` — colored by `roiBand` |
| Incr. Rev | `Σ (incremental_revenue)` for that channel |
| Elasticity | `avg[incr / (discount_pct × spend)]` per promo in channel |
| Flag | `"Overweight"` badge (amber) if `spendShare > revShare AND roi < 1.2` |

---

### 5.5 Channel Quadrant Scatter Chart

| Aspect | Logic |
|---|---|
| **Axes** | X = `spendShare %`, Y = `roi` |
| **Reference lines** | Vertical at `medianSpendShare` (median of all channel spend shares); horizontal at `medianROI` (median of all channel ROIs) |
| **Quadrant legend** | Scale (high ROI, low spend) = green; Optimize (low ROI, low spend); Protect (high ROI, high spend); Review (low ROI, high spend) |
| **Cell color** | `roi ≥ 2` → green; `roi ≥ 1` → amber; `roi < 1` → red |
| **Bubble size (Z-axis)** | Absolute `spend` value |

---

### 5.6 Top 5 / Bottom 5 Promos Table

Sorted by `roi_pct ?? computedROI` descending. Columns: Promo Name, Channel, Start Date, Duration (days), Discount %, ROI (colored), Incremental Revenue. Bottom 5 = `[...sortedByRoi].reverse().slice(0, 5)`. Toggled via `promosExpanded` state.

---

### 5.7 Recommendations Engine (conditional, up to 4 rules)

| Trigger condition | Message | Impact |
|---|---|---|
| `avgDiscount > 30 AND avgRoi < 1.5` | Reduce discount depth by 3% | Projected ROI = `avgRoi × 1.08x` |
| Per channel: `roi > 2 AND spendShare < 20%` | Increase allocation to {channel} | `+{incrRev × 0.15}` projected incremental |
| `promoDep > 0.6` | Reduce promo frequency by 10% | Projected dep = `dep × 90%` |
| `profitablePct < 50%` | Review underperforming promos | `~0.15x ROI uplift` by cutting bottom 20% |

---

## 6. Channel Overview Page

**Route:** `/channel-overview`
**File:** `client/src/pages/channel-overview.tsx`
**Data sources:** `GET /api/promotions`
**Layout:** Fixed-height — left KPI navigator sidebar (220 px) + right panel (sticky filter bar → tabs).
**Persistence:** `localStorage["channelOverview_activeTab"]`, `localStorage["channelOverview_viewMode"]`.

**ChannelMetrics construction (computed from `promotionSubset`):**

| Field | Formula |
|---|---|
| `total_spend` | `Σ (promo_spends ?? trade_spend)` per channel |
| `total_incr_revenue` | `Σ (incremental_revenue ?? (promo_sales − baseline_sales))` per channel |
| `avg_roi` | `total_incr_revenue / total_spend` |
| `spend_efficiency` | `= avg_roi` (alias) |
| `avg_margin` | `avg(gross_margin_pct)` per channel promos |
| `margin_impact` | `avg_margin − 35` (35 = baseline margin assumption in pp) |
| `avg_discount` | `avg(discount_pct)` |
| `spend_share` | `total_spend / portfolioTotalSpend` |
| `revenue_share` | `total_incr_revenue / portfolioTotalIncr` |
| `roi_variance` | `sqrt(variance of roi_pct_per_promo)` |
| `forecast_accuracy_score` | `max(0, 1 − min(CV, 1))` where `CV = roi_variance / abs(mean_roi)` (coefficient of variation of per-promo ROI) |
| `growth_vs_ly` | `(second_half_incr − first_half_incr) / abs(first_half_incr)` — promos split by index |
| `promo_intensity` | `channel_promo_count / max_promo_count_across_all_channels` |
| `roi_series` | Chronological array of per-promo `roi_pct ?? computed_roi` |
| `elasticity_slope` | OLS linear slope of `{x: discount_band_midpoint, y: avg_roi_in_band}` pairs (bands: 5, 15, 25, 35, 45) |
| `optimal_discount` | Band midpoint with highest avg ROI |
| `composite_strength` | `roiNorm × 0.30 + incrNorm × 0.25 + effNorm × 0.20 + marginNorm × 0.15 + faScore × 0.10` (all normalized 0–100) |

**Risk alerts (rule-based, per channel):**

| Alert | Condition | Severity |
|---|---|---|
| Sustained Underperformance | `avg_roi < 1.1` | High |
| Margin Destruction Risk | `margin_impact < 0` | High |
| Overweight Weak Channel | `spend_share > 0.3 AND avg_roi < portfolioROI` | Medium |
| Discount Fatigue Risk | `elasticity_slope < −0.03` | Medium |
| Over-discounted | `avg_discount > optimal_discount + 5` | Medium |

**risk_score:** `"High"` if ≥2 high-severity alerts; `"Medium"` if ≥2 total or 1 high; `"Low"` otherwise.

---

### 6.1 KPI Sidebar

**CHANNEL_KPI_DEFS (9 KPIs):**

| KPI ID | Label | Formula |
|---|---|---|
| `total_channels` | Total Channels | `filteredChannels.length` |
| `total_spend` | Total Spend | `Σ total_spend` |
| `avg_roi` | Avg Channel ROI | `Σ total_incr_revenue / Σ total_spend` |
| `incr_revenue` | Incremental Revenue | `Σ total_incr_revenue` |
| `spend_efficiency` | Spend Efficiency | `Σ incr / Σ spend` (= portfolio avg ROI) |
| `margin_impact` | Avg Margin Impact | `avg(margin_impact)pp` |
| `promo_intensity` | Promo Intensity | `avg(promo_intensity × 100)%` |
| `forecast_accuracy` | Forecast Accuracy | `avg(forecast_accuracy_score × 100)%` |
| `channel_insights` | Channel Insights | Count of all insights across 5 KPI categories |

**Filters:**

| Filter | Logic |
|---|---|
| `brand` | `p.brand_name === filter` applied to `promotionSubset` |
| `region` | `p.region === filter` applied to `promotionSubset` |
| `roiBand` | `"high"` = `avg_roi ≥ 2`; `"medium"` = `1–2`; `"low"` = `<1` applied to `filteredChannels` |
| `timePeriod` | `"monthly" \| "quarterly"` — affects `channelTrendData` grouping |

---

### 6.2 Tab: Intelligence

**If `activeKpi === "channel_insights"`:** All insights across `["avg_roi", "margin_impact", "forecast_accuracy", "promo_intensity", "spend_efficiency"]`.

**If regular KPI:** Top 4 insights (or all if `showAllInsights = true`) + `ChannelKpiCharts`.

**`generateChannelInsights` rules:**

| KPI | Insight ID | Trigger |
|---|---|---|
| `avg_roi` | `roi-spread` | Best/worst ROI gap; priority high if gap > 1.0× |
| `avg_roi` | `roi-underperformers` | Channels with `avg_roi < portfolioROI × 0.8`; priority high if >30% spend |
| `margin_impact` | `margin-destruction` | Channels where `margin_impact < 0` |
| `margin_impact` | `spend-revenue-misalignment` | `spend_share > revenue_share + 0.05` |
| `forecast_accuracy` | `forecast-reliability` | Channels with `forecast_accuracy_score < 0.6` |
| `promo_intensity` | `discount-fatigue` | `promo_intensity > 0.8 AND avg_roi < portfolioROI` |
| `spend_efficiency` | `under-invested` | `avg_roi > portfolioROI × 1.2 AND spend_share < 0.15` |

---

### 6.3 ChannelKpiCharts

| Chart | Data | Logic | Render |
|---|---|---|---|
| **Channel ROI Trend** | `channelTrendData` | Top 5 channels by composite_strength; grouped by `start_date` into monthly (last 12) or quarterly (last 8) periods; Y = `avg(roi_pct)` per period per channel | LineChart; one Line per channel with `CHANNEL_COLORS`; break-even ReferenceLine at Y=1 |
| **Structural Strength Radar** | `radarData` | 5 axes: ROI, Incr. Revenue, Efficiency, Margin, Forecast Acc. — each normalized 0–100 against max across channels. `Margin = (margin_impact + maxMarginAbs) / (2 × maxMarginAbs) × 100` (centers at 50) | RadarChart; one Radar series per channel; composite_strength bar chart below |
| **ROI Elasticity by Discount Band** | `elasticityLines` | 5 band midpoints (5, 15, 25, 35, 45%); Y = `Σ incr / Σ spend` per band per channel; elasticity_slope shown below with ↑↓ arrows; Over-discounted badge | LineChart; one Line per channel; slope table below |
| **Allocation: Spend vs Revenue Share** | `allocationData` | Per channel: `spend_pct = spend_share × 100`, `revenue_pct = revenue_share × 100`; `overweight = spend_share > revenue_share AND avg_roi < 1.2` | ComposedChart: Bar (spend%) colored red if overweight / blue if not; Line (revenue%) in gold |
| **Risk Alert Panel** | `structuredAlerts` | Flattens all `channel.risk_alerts` across filtered channels; sorted by severity (high first) | Scrollable list; red bg for high, amber for medium |

---

### 6.4 Tab: Channels

| Widget | Data | Logic | Render |
|---|---|---|---|
| **Card/Grid toggle** | — | `viewMode` state (localStorage persisted) | Icon toggle |
| **Grid view** | `sortedChannels` | Sortable table; columns: Channel, Total Spend, Inc. Revenue, Avg ROI (colored; green ≥1.2, amber 1–1.2, red <1), Margin Impact (pp, ±), Promo Count, Risk Score badge, ROI vs Portfolio (`roiGap = avg_roi − portfolioROI`; shown as `±X.XXx vs Portfolio Avg`; green/red), Details link | Table with sort controls |
| **Card view** | `filteredChannels` | Per card: same 6 metrics + ROI trend sparkline (`SparkLine` SVG polyline from `roi_series`), View Channel Details button, `StructuralRiskTags` badges | Card grid |

**`StructuralRiskTags`:** Renders each `risk_alerts` entry as a small colored badge (high = red, medium = amber, low = muted) on the channel card.

---

## 7. Channel Detail Page

**Route:** `/channel-details/:channel_name`
**File:** `client/src/pages/channel-details.tsx`
**Data sources:** `GET /api/promotions` (filtered by channel), `GET /api/metrics/discount-elasticity?channel=:name`
**Header:** `"N promos · M brands · Optimization Cockpit"`

**Core metrics (computed from `channelPromos`):**

| Field | Formula |
|---|---|
| `totalSpend` | `Σ (promo_spends ?? trade_spend)` |
| `totalIncrRev` | `Σ (incremental_revenue ?? (promo_sales − baseline_sales))` |
| `avgRoi` | `totalIncrRev / totalSpend` |
| `avgDiscount` | `avg(discount_pct)` |
| `avgMargin` | `avg(gross_margin_pct)` |
| `marginImpact` | `totalIncrRev × (avgMargin / 100)` |
| `promoResponsiveness` | `min(100, max(0, avgRoi / maxChannelRoi × 100))` where `maxChannelRoi = max(roi_pct ?? 0)` across channel promos |
| `promoCount` | `channelPromos.length` |

---

### 7.1 Layer 1 — Channel Strategy Snapshot

8 KPI cards in a responsive grid (4-col / 8-col):

| KPI | Value | Color |
|---|---|---|
| Total Spend | `formatCurrency(totalSpend)` | — |
| Incr. Revenue | `formatCurrency(totalIncrRev)` | Green |
| Avg ROI | `avgRoi.toFixed(2)x` | Green if ≥1, red if <1 |
| Avg Discount | `avgDiscount.toFixed(1)%` | — |
| Elasticity Index | `elasticityIndex/100` | Purple |
| Promo Response | `promoResponsiveness.toFixed(0)/100` | Blue |
| Margin Impact | `formatCurrency(marginImpact)` | Green if ≥0, red if <0 |
| Optimal Band | `elasticityData.optimalBucket.label` | Green text |

**Green callout banner:** `"Optimal ROI occurs at {optimalBucket.label} discount — peak avg ROI in this band."`

---

### 7.2 Layer 2 — Elasticity & Discount Diagnostics

#### Discount Buckets (local computation):

5 buckets: `0–10%, 10–20%, 20–30%, 30–40%, 40%+`. Each: `{totalIncr, totalSpend, count}` → `roi = totalIncr / totalSpend`.

#### ElasticityIndex computation:

| Step | Logic |
|---|---|
| If `/api/metrics/discount-elasticity` returns rows with `price_elasticity > 0` | `elasticityIndex = min(100, max(0, avg(price_elasticity) × 50))` |
| Fallback (local bucket slope) | `slope = roiValues[last] − roiValues[first]`; `elasticityIndex = min(100, abs(slope) / maxRoi × 100)` |
| Classification | `>60` → `"High Sensitivity"` (red); `>30` → `"Moderate"` (amber); else `"Low"` (green) |
| `optimalBucket` | Bucket index with highest `roi`; its `label` and `midpoint` used throughout |

#### Chart: Discount Effect Curve (LineChart)

| Aspect | Logic |
|---|---|
| Data | `elasticityData.curve = [{label, roi}]` filtered buckets with non-null roi |
| X-axis | Bucket labels (`0–10%`, `10–20%`, etc.) |
| Y-axis | ROI (xN format) |
| Break-even line | ReferenceLine at Y=1, red dashed; ReferenceArea fill below Y=1 (`#ef444415`) |
| Dots | Optimal bucket dot radius 5, `#22c55e`; all others radius 3, gold |
| Warning | If `slope < −0.3`: amber text `"ROI drops sharply beyond {optimalBucket.label} discount"` |

#### Panel: Elasticity Diagnostic

| Widget | Logic |
|---|---|
| Classification box | `elasticityData.classification` + `elasticityIndex/100` |
| Optimal Band box | `optimalBucket.label` + `"Peak ROI bucket"` |
| **Over-Discounting flag** | `avgDiscount > optimalBucket.midpoint` → amber warning box. Shows: `avgDiscount.toFixed(0)%` vs `optimalBucket.midpoint%`; `pctAboveOptimal = count(promo.discount_pct > optimalBucket.midpoint) / N × 100%` of promos above optimal |
| **Discount Health** (no over-discounting) | `avgDiscount ≤ midpoint` → green box `"Discount Depth On Target"` |
| **ROI by bucket mini-bars** | 5 bars, width = `min(100, (roi / 3) × 100)%`; optimal bucket = green, roi<1 = red, else amber |

---

### 7.3 Layer 3 — Brand Performance in Channel

#### Brand data construction:

| Field | Formula |
|---|---|
| `spend` | `Σ (promo_spends ?? trade_spend)` per brand within channel |
| `incr` | `Σ (incremental_revenue ?? (promo_sales − baseline_sales))` per brand |
| `roi` | `incr / spend` |
| `spendShare` | `brand_spend / total_channel_spend × 100` |
| `revenueShare` | `brand_incr / total_channel_incr × 100` |
| `overInvested` | `spendShare > revenueShare AND roi < 1.2` |

Sorted by `spendShare` descending.

#### Chart: Brand Efficiency Matrix (BarChart)

- Horizontal grouped bars per brand: `spend %` (gray/red if overInvested) vs `revenue %` (colored by ROI band)
- Legend: green >2x, amber 1–2x, red <1x

#### Panel: Brand ROI Table

Columns: Brand, Spend%, Rev%, ROI (colored: green ≥2, amber 1–2, red <1), Over-Invested badge (red if `overInvested`).

---

### 7.4 Layer 4 — Seasonal Performance (LineChart)

| Aspect | Logic |
|---|---|
| **Data grouping** | `channelPromos` grouped by `YYYY-MM` key from `start_date`; each month: `{totalIncr, totalSpend, count}` → `roi = totalIncr / totalSpend` |
| **Labels** | `new Date(year, month).toLocaleDateString("en-US", {month:"short", year:"2-digit"})` (e.g. `"Jan '24"`) |
| **Sorted** | Chronological by `YYYY-MM` key |
| **topMonths** | 2 months with highest `roi` (used for annotation) |
| **highVariance flag** | `(maxRoi − minRoi) / maxRoi > 0.30` — renders amber warning banner |
| **Chart** | LineChart with two lines: `roi` (gold) and `incr` (blue, second Y-axis) |

---

### 7.5 AI Recommendations (rule-based, up to 4)

| Trigger | Message | ROI uplift label |
|---|---|---|
| `optimalBucket.midpoint < 25 AND avgDiscount > 30` | Reduce avg discount by ~5%; optimal band is `{optimalBucket.label}` but avg is `{avgDiscount}%` | `"+0.12x"` |
| Per brand: `brand.roi > channelAvgRoi AND spendShare < 20` | Increase `{brand}` allocation. ROI `{roi}x` but spend share only `{spendShare}%` | `"+0.10x"` |
| `elasticityData.slope < −0.5` | Avoid high-discount flash promos. Strongly negative slope — deep discounts destroy ROI | `"+0.08x"` |
| `marginImpact < 0` | Channel is structurally margin destructive. Review promo mechanics | `"Risk"` (danger type) |
| None of the above | Channel performing well. Maintain current discount band and monitor high-ROI brands | `"Stable"` (info type) |

Type mapping: `"warn"` → amber; `"danger"` → red; `"info"` → blue/neutral.

---

## Appendix: Shared Constants & Color Bands

### ROI Band Colors (used on all pages)

| Band | Condition | Hex Color |
|---|---|---|
| High | `roi ≥ 2` | `#22c55e` (green) |
| Medium | `1 ≤ roi < 2` | `#eab308` (amber) |
| Low | `roi < 1` | `#ef4444` (red) |

### Quadrant Classification (from `/api/metrics/quadrants`)

| Quadrant | Meaning |
|---|---|
| `Scale` | High ROI + High incremental revenue (above 60th percentile) |
| `Optimize` | Low ROI + High incremental revenue |
| `Experiment` | High ROI + Low incremental revenue |
| `Stop` | Low ROI + Low incremental revenue (below 40th percentile) |

Thresholds: 40th and 60th percentile of sorted `incremental_revenue` across all promos.

### Config Fields (from `/api/config`)

| Key | Default | Used in |
|---|---|---|
| `post_promo_dip_pct` | `0.15` | Promo Detail: post-promo dip amount |
| `ebitda_conversion_factor` | `0.85` | Promo Detail: EBITDA impact |
| `max_discount_depth_normalizer` | `0.40` | Promo Detail: discountScore fallback |
| `max_promo_duration_days` | `60` | Promo Detail: durationScore |

### formatCurrency (shared utility)

| Range | Format |
|---|---|
| ≥ 1,000,000 | `$X.XM` |
| ≥ 1,000 | `$X.XK` or `$XK` (varies by page) |
| < 1,000 | `$X` |
