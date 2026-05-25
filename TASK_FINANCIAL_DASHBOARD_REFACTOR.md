# Financial Dashboard Refactor Tasks

## Goal
Make the finance area easier to navigate, reduce visual clutter, and fix incorrect values caused by mixed brand/customer filtering.

## Execution Plan

- [x] 1. Split entity options by dimension in API and UI
  - Return `class` entities (brands) separately from `customer` entities.
  - Stop showing mixed `All brands/customers` option.
  - Ensure changing view resets entity selection safely.
  - Commit and push.

- [x] 2. Add left sidebar grouped navigation with sub-sections
  - Add collapsible `Financial Consolidation` group in sidebar.
  - Add sub-items: `Summary`, `Brand / SKU`, `P&L lines`, `Import`.
  - Keep active state synced between sidebar sub-item and content area.
  - Commit and push.

- [x] 3. Improve filter clarity and page readability
  - Update filter labels/help text to reflect dimension-specific entity filtering.
  - Tighten section spacing and panel hierarchy where needed.
  - Commit and push.

- [x] 4. Add regression checks for entity separation
  - Verify brand view only loads brand options.
  - Verify customer view only loads customer options.
  - Verify selected entities clear when switching view.
  - Commit and push.

- [x] 5. Make the refactor visually obvious and easier to read
  - Add a clearer finance sub-navigation label in sidebar.
  - Add sticky filter controls so context stays visible while scrolling.
  - Add a "current scope" strip for selected batch/company/entity/date context.
  - Commit and push.

## Notes
- Work in small commits so each completed item can be reviewed independently.
- Keep existing behavior intact unless directly related to the tasks above.
