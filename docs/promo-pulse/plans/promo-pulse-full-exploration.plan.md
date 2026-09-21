# Promo Pulse Platform - Full Feature Test Plan

## Application Overview

This test plan covers the full exploration of the Promo Pulse Platform after login, including all major modules, dashboards, ETL pipelines, monitoring, and insights. Each section and subpage is visited and its features are mapped for comprehensive test coverage.

## Test Scenarios

### 1. Authentication & Navigation

**Seed:** `tests/setup/seed.spec.ts`

#### 1.1. Login and Landing Page

**File:** `tests/e2e/authentication.spec.js`

**Steps:**
  1. Navigate to http://135.235.180.85:30000/
    - expect: Login page loads with email and password fields
  2. Enter valid credentials and click LOGIN
    - expect: Redirected to landing page
    - expect: Landing page header and navigation visible

### 2. App & Module Access

**Seed:** `tests/setup/seed.spec.ts`

#### 2.1. App Switcher and App List

**File:** `tests/e2e/app-switcher.spec.js`

**Steps:**
  1. Click 'S Select App Click to switch'
    - expect: App switcher dialog opens with list of available apps
  2. Search and select 'RGM - Promo Pulse'
    - expect: Promo Pulse app opens and dashboard loads

### 3. Promo Pulse Dashboard Navigation

**Seed:** `tests/setup/seed.spec.ts`

#### 3.1. Dashboard Main Sections

**File:** `tests/e2e/dashboard-nav.spec.js`

**Steps:**
  1. Expand 'PROMO PULSE DASHBOARD'
    - expect: Overview, Promo Overview, Brand Overview, Channel Overview, Customer Overview buttons visible
  2. Visit each section (Overview, Promo Overview, Brand Overview, Channel Overview, Customer Overview)
    - expect: Each dashboard page loads with correct widgets, tables, and charts

### 4. ETL Module

**Seed:** `tests/setup/seed.spec.ts`

#### 4.1. Connections Page

**File:** `tests/e2e/etl-connections.spec.js`

**Steps:**
  1. Expand 'ETL' and click 'Connections'
    - expect: Connections page loads with table and actions

#### 4.2. Ingestion Pipeline Page

**File:** `tests/e2e/etl-ingestion.spec.js`

**Steps:**
  1. Click 'Ingestion Pipeline'
    - expect: Ingestion Pipeline page loads with pipeline list and controls

#### 4.3. Transformation Pipeline Page

**File:** `tests/e2e/etl-transformation.spec.js`

**Steps:**
  1. Click 'Transformation Pipeline'
    - expect: Transformation Pipeline page loads with pipeline list and controls

#### 4.4. Orchestrator Page

**File:** `tests/e2e/etl-orchestrator.spec.js`

**Steps:**
  1. Click 'Orchestrator'
    - expect: Orchestrator page loads with orchestration controls

#### 4.5. Monitoring Page

**File:** `tests/e2e/etl-monitoring.spec.js`

**Steps:**
  1. Click 'Monitoring'
    - expect: Monitoring page loads with tabs and monitoring data

### 5. Insights Portal

**Seed:** `tests/setup/seed.spec.ts`

#### 5.1. AI Insights and Signal Repository

**File:** `tests/e2e/insights-portal.spec.js`

**Steps:**
  1. Expand 'INSIGHTS PORTAL' and click 'AI Insights'
    - expect: AI Insights page loads with insights and controls
  2. Click 'Signal Repository'
    - expect: Signal Repository page loads with signal list and management features
