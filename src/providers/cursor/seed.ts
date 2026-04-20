import { buildSpendProjection } from "../../lib/projections";
import type { CursorReportSummary } from "./types";

const SEATS = 3;
const USAGE_BASED_REQS = 210;
const MONTHLY_COST = SEATS * 20 + USAGE_BASED_REQS * 0.04;
const DAILY_SEAT_COST = (SEATS * 20) / 30;
const DAILY_USAGE_COST = (USAGE_BASED_REQS * 0.04) / 28;

const seedDailyBreakdown = Array.from({ length: 28 }, (_, i) => ({
  date: `2026-03-${String(i + 1).padStart(2, "0")}`,
  costUsd: DAILY_SEAT_COST + DAILY_USAGE_COST
}));

export const seededCursorReportSummary: CursorReportSummary = {
  providerId: "cursor",
  providerLabel: "Cursor",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 11450, label: "requests", unit: "requests" },
  totalCmdkUsages: 1420,
  totalComposerRequests: 3850,
  totalChatRequests: 5200,
  totalAgentRequests: 980,
  totalUsageBasedReqs: USAGE_BASED_REQS,
  seatCount: SEATS,
  estimatedMonthlyCostUsd: MONTHLY_COST,
  actualCostUsd: null,
  includedSpendUsd: null,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cacheHitRate: null,
  modelsUsed: [],
  perModelBreakdown: [],
  requestUnitsConsumed: 0,
  usageEventCount: 0,
  kindBreakdown: {},
  subscriptionCycleStart: null,
  fastPremiumRequests: 0,
  spendProjection: buildSpendProjection(
    seedDailyBreakdown,
    "seat_based",
    "Active users × $20/seat/mo (Business plan assumed); usage-based @ $0.04/req"
  )
};
