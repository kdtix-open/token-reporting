import { buildSpendProjection } from "../../lib/projections";
import type { ClaudeCodeReportSummary } from "./types";

const MONTHLY_COST = 200;
const WINDOW_DAYS = 28;
const DAILY_COST = MONTHLY_COST / 30;

const seedDailyBreakdown = Array.from({ length: WINDOW_DAYS }, (_, i) => ({
  date: `2026-03-${String(i + 1).padStart(2, "0")}`,
  costUsd: DAILY_COST
}));

export const seededClaudeCodeReportSummary: ClaudeCodeReportSummary = {
  providerId: "claude-code",
  providerLabel: "Claude Code",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 1_420, label: "requests", unit: "requests" },
  spendProjection: buildSpendProjection(
    seedDailyBreakdown,
    "seat_based",
    `Flat $${MONTHLY_COST}/mo subscription`
  ),
  inputTokens: 52_000_000,
  outputTokens: 18_500_000,
  cacheReadTokens: 310_000_000,
  cacheCreationTokens: 14_200_000,
  requestCount: 1_420,
  sessionCount: 86,
  monthlySeatCost: MONTHLY_COST,
  cacheHitRate: 310_000_000 / (52_000_000 + 310_000_000),
  modelsUsed: ["claude-opus-4-6", "claude-sonnet-4-6"],
  perModelBreakdown: [],
  webSearchRequests: 0,
  webFetchRequests: 0
};
