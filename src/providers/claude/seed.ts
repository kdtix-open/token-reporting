import { buildSpendProjection } from "../../lib/projections";
import type { ClaudeReportSummary } from "./types";

const INPUT = 48_500_000;
const OUTPUT = 12_300_000;
const CACHE_READ = 9_800_000;
const CACHE_CREATE = 2_100_000;

const SEED_COST =
  (INPUT / 1_000_000) * 3.0 +
  (OUTPUT / 1_000_000) * 15.0 +
  (CACHE_READ / 1_000_000) * 0.3 +
  (CACHE_CREATE / 1_000_000) * 3.75;

const SEED_DAILY = SEED_COST / 28;
const seedDailyBreakdown = Array.from({ length: 28 }, (_, i) => ({
  date: `2026-03-${String(i + 1).padStart(2, "0")}`,
  costUsd: SEED_DAILY
}));

export const seededClaudeReportSummary: ClaudeReportSummary = {
  providerId: "claude",
  providerLabel: "Claude",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 12_300_000, label: "output tokens", unit: "tokens" },
  inputTokens: INPUT,
  outputTokens: OUTPUT,
  cacheReadTokens: CACHE_READ,
  cacheCreationTokens: CACHE_CREATE,
  estimatedCostUsd: SEED_COST,
  actualCostUsd: null,
  cacheHitRate: null,
  modelsUsed: [],
  perModelBreakdown: [],
  webSearchRequests: 0,
  unattributedCostUsd: null,
  spendProjection: buildSpendProjection(seedDailyBreakdown, "estimated", "Blended claude-3-5-sonnet rate assumed")
};
