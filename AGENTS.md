# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Token Reporting is a React + TypeScript dashboard for tracking AI/code-assistant token consumption and spending across five providers: GitHub Copilot, Cursor, Claude (Anthropic Admin API), Claude Code (local session telemetry), and OpenAI Codex. It fetches usage data via provider APIs and local session files, persists snapshots locally, and renders comparison charts, spend projections, and local-model migration analysis.

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (port 5173) |
| Build | `npm run build` (typecheck + Vite) |
| Preview prod build | `npm run preview` |
| Run all tests | `npm test` (Vitest + v8 coverage) |
| Watch tests | `npm run test:watch` |
| Run single test | `npx vitest run src/path/to/file.test.ts` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Load provider credentials | `set -a; source .env.admin.credentials; set +a` |
| Fetch Claude data | `npm run report:claude` |
| Fetch Cursor data | `npm run report:cursor` |
| Fetch Copilot data | `npm run report:copilot` |
| Fetch OpenAI Codex data | `npm run report:codex` |
| Fetch Claude Code data | `npm run report:claude-code` (no API key — reads ~/.claude/) |
| Analyze local sessions | `npm run report:local-sessions` |

## Architecture

### Provider Registry Pattern

Each provider follows a standardized structure in `src/providers/{provider}/`:

- **`types.ts`** — Zod schemas + TypeScript interfaces for API responses and report summaries
- **`client.ts`** — HTTP client for provider API calls
- **`service.ts`** — Business logic: aggregates raw data into `ProviderReportSummary`
- **`persistence.ts`** — Writes fetched data to `public/data/{provider}/latest-metadata.json`
- **`seed.ts`** — Static seeded data for offline/first-load fallback
- **`__tests__/`** — Unit tests for client and service

Providers are registered in `src/providers/registry.ts` via the `ProviderAdapter` interface. Adding a new provider means implementing this interface and registering it — no changes to `App.tsx` needed.

### Data Flow

1. CLI scripts (`scripts/fetch-*.ts`) call provider APIs and persist snapshots via the persistence layer
2. `App.tsx` loads snapshots from `/data/{provider}/latest-metadata.json` on mount, falling back to seeded data
3. Each provider's `transformSnapshot()` parses raw JSON → typed `ProviderReportSummary` using Zod `safeParse()` for backward compatibility
4. Summaries flow as props into section components (comparison charts, spend projections, migration panel, report cards)

### Key Shared Libraries

- **`src/lib/projections.ts`** — Linear regression-based spend trend detection and 30/365-day projections. Requires ≥7 days of data; classifies trends as ramp/flat/decline/insufficient_data.
- **`src/lib/permissions.ts`** — `TOKEN_REPORTING_READ_ONLY` env var blocks file writes (for CI/read-only deploys).
- **`src/lib/localModelReport.ts`** — Assesses local model fit using empirical p99 context window needs and throughput requirements against a catalogue of local model profiles.
- **`src/lib/types.ts`** — Shared types: `ProviderReportSummary`, `SpendProjection`, `ComparisonMetric`, `DailySpend`.

### State Management

Minimal React: `useState` + `useEffect` only. No Redux, Context, or external state library. Data is immutable after fetch; all derived data computed in the service layer.

## Conventions

- **Node ≥20**, ES modules (`"type": "module"`)
- **Strict TypeScript** — no implicit `any`, no unused locals/params
- **Zod 4** for all runtime schema validation of external data
- **2-space indentation**, camelCase functions, PascalCase components/classes
- **Plain CSS** (no CSS-in-JS) — `src/App.css` and `src/index.css`
- **Testing**: Vitest + jsdom + @testing-library. Arrange-Act-Assert pattern. Coverage target ≥80% for new code, 100% for critical paths.
- **Functions < 50 lines**, cyclomatic complexity < 10
- **JSDoc for public APIs**

## Testing

- Environment: jsdom via Vitest, setup in `src/test/setup.ts`
- Coverage: v8 provider, HTML + text reporters, covers `src/**/*.{ts,tsx}` (excludes `src/main.tsx`)
- Tests live in `__tests__/` directories adjacent to the code they test
