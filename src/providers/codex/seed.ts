import { buildSpendProjection } from "../../lib/projections";
import type { CodexReportSummary } from "./types";

const SEED_INPUT = 32_000_000;
const SEED_OUTPUT = 8_400_000;
const SEED_COST =
  (SEED_INPUT / 1_000_000) * 2.5 + (SEED_OUTPUT / 1_000_000) * 10.0;

// Simulate 28 days of uniform spend for the seed
const SEED_DAILY_COST = SEED_COST / 28;
const seedDailyBreakdown = Array.from({ length: 28 }, (_, i) => ({
  date: `2026-03-${String(i + 1).padStart(2, "0")}`,
  costUsd: SEED_DAILY_COST
}));

export const seededCodexReportSummary: CodexReportSummary = {
  providerId: "codex",
  providerLabel: "OpenAI Codex",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 74_200, label: "requests", unit: "requests" },
  inputTokens: SEED_INPUT,
  outputTokens: SEED_OUTPUT,
  requestCount: 74_200,
  estimatedCostUsd: SEED_COST,
  actualCostUsd: null,
  cacheReadTokens: null,
  uncachedInputTokens: null,
  audioInputTokens: null,
  audioOutputTokens: null,
  cacheHitRate: null,
  modelsUsed: [],
  perModelBreakdown: [],
  unattributedCostUsd: null,
  spendProjection: buildSpendProjection(seedDailyBreakdown, "estimated", "Blended gpt-4o rate assumed")
};
