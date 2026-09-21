# Promo Pulse Dashboard Test Plan

## Application Overview

Comprehensive test plan for the Promo Pulse - AI Decision Cockpit dashboard at http://135.235.180.85:30000/landingpage. Covers all UI components including header, navigation, left KPI Navigator panel, top Filter Bar, Insights Section, Brand Performance Overview Table, Customer Portfolio Charts, Volume Sold Section, and footer. Includes dynamic behaviors like filtering and cross-updates. User stories covered: Dashboard Overview - Total Brands, Dashboard Overview - Total Customers KPI Analysis, Dashboard Overview - Volume Sold.

## Test Scenarios

### 1. Dashboard Load and Layout

**Seed:** `tests/setup/seed.spec.ts`

#### 1.1. Page Load and Basic Verification

**File:** `tests/e2e/dashboard-load.spec.ts`

**Steps:**
  1. Navigate to the dashboard URL
    - expect: Page loads without errors
    - expect: Title is 'Promo Pulse - AI Decision Cockpit'
    - expect: URL is correct
  2. Verify main heading
    - expect: 'Promo Pulse - AI Decision Cockpit' heading is visible
  3. Verify header and navigation
    - expect: Header is visible
    - expect: Navigation items are present
  4. Verify KPI Navigator panel
    - expect: Left panel with KPI cards is visible
  5. Verify Filter Bar
    - expect: Top filter bar with Time Period, Region, Channel selects is visible
  6. Verify Insights Section
    - expect: Insights section with AI-generated insights and 'View All' links is visible
  7. Verify Brand Performance Overview Table
    - expect: Table with columns Brand, Promotions, Trade Spend, etc. is visible
  8. Verify Customer Portfolio Charts
    - expect: Pareto Chart, Donut Chart, Bubble Chart are visible
  9. Verify Volume Sold Section
    - expect: Volume Sold KPI and charts are visible
  10. Verify Footer
    - expect: Footer is visible

### 2. KPI Navigator Interactions

**Seed:** `tests/setup/seed.spec.ts`

#### 2.1. KPI Card Clicks

**File:** `tests/e2e/kpi-interactions.spec.ts`

**Steps:**
  1. Click on Total Brands KPI card
    - expect: Navigates to brands detail page or opens modal
    - expect: Page URL changes to include /brands
  2. Go back to dashboard
    - expect: Returns to landing page
  3. Click on Total Customers KPI card
    - expect: Navigates to customers detail page
    - expect: URL changes to /customers
  4. Go back
    - expect: Returns to dashboard
  5. Click on Volume Sold KPI card
    - expect: Navigates to volume detail page
    - expect: URL changes to /volume

### 3. Filter Bar Functionality

**Seed:** `tests/setup/seed.spec.ts`

#### 3.1. Time Period Filter

**File:** `tests/e2e/filter-time.spec.ts`

**Steps:**
  1. Select 'Monthly' from Time Period
    - expect: Data updates
    - expect: KPIs reflect monthly data
  2. Select 'Quarterly'
    - expect: Data updates to quarterly
    - expect: KPIs change accordingly

#### 3.2. Region Filter

**File:** `tests/e2e/filter-region.spec.ts`

**Steps:**
  1. Select 'Midwest' from Region
    - expect: Filters apply
    - expect: All sections update to Midwest data
  2. Select 'Northeast'
    - expect: Updates to Northeast

#### 3.3. Channel Filter

**File:** `tests/e2e/filter-channel.spec.ts`

**Steps:**
  1. Select 'Grocery' from Channel
    - expect: Filters apply
    - expect: Data reflects Grocery channel
  2. Select 'E-commerce'
    - expect: Updates to E-commerce

#### 3.4. Cross-Filtering

**File:** `tests/e2e/cross-filter.spec.ts`

**Steps:**
  1. Apply multiple filters: Monthly, Midwest, Grocery
    - expect: All components update dynamically
    - expect: KPIs, table, charts reflect the filters

### 4. Insights Section

**Seed:** `tests/setup/seed.spec.ts`

#### 4.1. Insights Display and Navigation

**File:** `tests/e2e/insights.spec.ts`

**Steps:**
  1. Verify AI insights are displayed
    - expect: Brand Portfolio Overview, Top ROI Brand, etc. are visible
  2. Click on 'View All' link
    - expect: Navigates to full insights page
    - expect: URL changes to /insights

### 5. Brand Performance Overview

**Seed:** `tests/setup/seed.spec.ts`

#### 5.1. Table Verification and Interaction

**File:** `tests/e2e/brand-table.spec.ts`

**Steps:**
  1. Verify table columns
    - expect: Columns: Brand, Promotions, Trade Spend, Incremental Revenue, Average ROI, ROI Band are present
  2. Verify table data
    - expect: Rows contain valid data
    - expect: Brands like FreshBite, CleanEdge are listed
  3. Click on sort for ROI
    - expect: Table sorts by ROI
  4. Click on a brand row
    - expect: Opens brand details or navigates

### 6. Customer Portfolio Charts

**Seed:** `tests/setup/seed.spec.ts`

#### 6.1. Charts Rendering and Interaction

**File:** `tests/e2e/customer-charts.spec.ts`

**Steps:**
  1. Verify Pareto Chart
    - expect: Chart is rendered correctly
  2. Verify Donut Chart
    - expect: Chart visible
  3. Verify Bubble Chart
    - expect: Chart visible
  4. Hover over chart elements
    - expect: Tooltips appear with data

### 7. Volume Sold Section

**Seed:** `tests/setup/seed.spec.ts`

#### 7.1. Volume Sold KPI and Charts

**File:** `tests/e2e/volume-sold.spec.ts`

**Steps:**
  1. Verify Volume Sold KPI
    - expect: KPI value is displayed
  2. Verify Volume by Brand chart
    - expect: Chart is visible
  3. Verify Volume by Channel chart
    - expect: Chart is visible

### 8. User Stories

**Seed:** `tests/setup/seed.spec.ts`

#### 8.1. Dashboard Overview - Total Brands

**File:** `tests/e2e/user-story-brands.spec.ts`

**Steps:**
  1. Verify Total Brands KPI is visible and accurate
    - expect: Value is numeric >0
    - expect: Updates with filters
  2. Interact with Total Brands
    - expect: Click navigates correctly

#### 8.2. Dashboard Overview - Total Customers KPI Analysis

**File:** `tests/e2e/user-story-customers.spec.ts`

**Steps:**
  1. Verify Total Customers KPI
    - expect: Value accurate
    - expect: Reflects filters
  2. Analyze customer data in charts
    - expect: Charts show customer distribution

#### 8.3. Dashboard Overview - Volume Sold

**File:** `tests/e2e/user-story-volume.spec.ts`

**Steps:**
  1. Verify Volume Sold KPI
    - expect: Value displayed
    - expect: Updates with filters
  2. Check volume charts
    - expect: Charts reflect volume data
