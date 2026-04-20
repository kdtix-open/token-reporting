# Bootstrap Plan

## Scope

### Must

- Initialize this folder as a git-backed local repo
- Create a reproducible Node/TypeScript environment
- Add a first GitHub Copilot report adapter for the latest 28-day organization users report
- Persist latest report metadata locally behind an explicit read-only guard
- Render a first dashboard card from seeded data
- Cover the first slice with automated tests

### Should

- Document setup, permissions, and endpoint assumptions
- Seed the dashboard with a representative local fixture

### Could

- Download and normalize the signed usage files returned by the API
- Add a provider registry for Cursor, Claude, and local custom adapters

### Won't (this time)

- Cross-provider normalization
- Authentication flows beyond environment variables
- Historical trend dashboards and charts

## Discovery summary

- GitHub now documents the org-level `users-28-day/latest` report endpoint under Copilot usage metrics.
- The current recommended API version is `2026-03-10`.
- The endpoint returns signed `download_links` plus `report_start_day` and `report_end_day`.
- A spike was not required because the API contract is now documented and the implementation path is straightforward.

## Baseline before implementation

- Repository state: empty folder, not yet initialized as git
- Existing tests: none
- Existing dependencies: none
