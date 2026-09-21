# Promo Pulse Logic Coverage Checklist

This checklist maps [logic-documentation.md](./logic-documentation.md) to the current Playwright suite.

| Document Section | Route | Coverage Status | Current Spec |
|---|---|---|---|
| Overview 1.1 KPI sidebar | `/` | Partial | `tests/e2e/promo-pulse-overview.spec.js` |
| Overview 1.2 filter bar | `/` | Partial | `tests/e2e/promo-pulse-overview.spec.js` |
| Overview 1.3 active KPI panels | `/` | Partial | `tests/e2e/promo-pulse-overview.spec.js` |
| Promo Overview 2.1 KPI sidebar | `/promo-overview` | Partial | `tests/e2e/promo-pulse-promo.spec.js` |
| Promo Overview 2.2 filter bar | `/promo-overview` | Partial | `tests/e2e/promo-pulse-promo.spec.js` |
| Promo Overview 2.3 intelligence tab | `/promo-overview` | Partial | `tests/e2e/promo-pulse-promo.spec.js` |
| Promo Overview 2.4 promos tab | `/promo-overview` | Partial | `tests/e2e/promo-pulse-promo.spec.js` |
| Promo Detail 3.1-3.7 | `/promo-details/:promotion_id` | Added partial UI coverage | `tests/e2e/promo-pulse-promo-detail.spec.js` |
| Brand Overview 4.1-4.4 | `/brand-overview` | Partial | `tests/e2e/promo-pulse-brand.spec.js` |
| Brand Detail 5.1-5.7 | `/brand-details/:brand_name` | Added partial UI coverage | `tests/e2e/promo-pulse-brand-detail.spec.js` |
| Channel Overview 6.1-6.4 | `/channel-overview` | Partial | `tests/e2e/promo-pulse-channel.spec.js` |
| Channel Detail 7.1-7.5 | `/channel-details/:channel_name` | Added partial UI coverage | `tests/e2e/promo-pulse-channel-detail.spec.js` |

## Remaining Gaps

- Formula-level verification is still limited. The suite mostly checks the rendered logic surfaces, not exact numeric computations.
- Filter-combination logic from the document is only lightly covered.
- Local storage persistence for active tabs and view modes is not covered yet.
- Mutation and toast behavior, including `Run Insight Engine`, is not covered yet.
- Detail-page coverage remains data-dependent in environments where no rows are available to open.