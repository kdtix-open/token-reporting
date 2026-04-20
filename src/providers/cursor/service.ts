import { buildSpendProjection } from "../../lib/projections";
import type {
  CursorDailyUsageResponse,
  CursorFilteredUsageEventsResponse,
  CursorPerModelBreakdown,
  CursorReportSummary,
  CursorTeamSpendResponse
} from "./types";

const SEAT_COST_PER_MONTH = 20; // Business plan assumed
const USAGE_BASED_COST_PER_REQ = 0.04;
/** Cursor reports cents in event/spend payloads → divide for USD. */
const CENTS_TO_USD = 1 / 100;

function epochMsToIsoDay(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export interface CursorReportInput {
  daily: CursorDailyUsageResponse;
  spend?: CursorTeamSpendResponse;
  events?: CursorFilteredUsageEventsResponse;
}

/**
 * Backward-compatible entry point. Accepts either the raw daily usage response
 * (legacy snapshot shape) or the enriched `{ daily, spend?, events? }` snapshot.
 */
export function createCursorReportSummary(
  reportOrInput: CursorDailyUsageResponse | CursorReportInput
): CursorReportSummary {
  const input: CursorReportInput =
    "daily" in reportOrInput && "data" in (reportOrInput as CursorReportInput).daily
      ? (reportOrInput as CursorReportInput)
      : { daily: reportOrInput as CursorDailyUsageResponse };

  const { daily, spend, events } = input;

  // ── Legacy daily-usage aggregation (preserved) ─────────────────────────────
  let totalCmdkUsages = 0;
  let totalComposerRequests = 0;
  let totalChatRequests = 0;
  let totalAgentRequests = 0;
  let totalUsageBasedReqs = 0;

  const uniqueUsers = new Set<string>();
  const perDay = new Map<string, { users: Set<string>; usageBasedReqs: number }>();

  for (const item of daily.data) {
    totalCmdkUsages += item.cmdkUsages;
    totalComposerRequests += item.composerRequests;
    totalChatRequests += item.chatRequests;
    totalAgentRequests += item.agentRequests;
    totalUsageBasedReqs += item.usageBasedReqs;

    uniqueUsers.add(item.userId);

    const existing = perDay.get(item.day) ?? { users: new Set<string>(), usageBasedReqs: 0 };
    existing.users.add(item.userId);
    existing.usageBasedReqs += item.usageBasedReqs;
    perDay.set(item.day, existing);
  }

  const seatCount = uniqueUsers.size;
  const estimatedMonthlyCostUsd =
    seatCount * SEAT_COST_PER_MONTH + totalUsageBasedReqs * USAGE_BASED_COST_PER_REQ;

  // ── /teams/spend aggregation ───────────────────────────────────────────────
  let includedSpendUsd: number | null = null;
  let actualCostFromSpend: number | null = null;
  let fastPremiumRequests = 0;
  let subscriptionCycleStart: number | null = null;

  if (spend) {
    let inc = 0;
    let act = 0;
    for (const m of spend.teamMemberSpend) {
      inc += m.includedSpendCents;
      act += m.spendCents;
      fastPremiumRequests += m.fastPremiumRequests;
    }
    includedSpendUsd = inc * CENTS_TO_USD;
    actualCostFromSpend = act * CENTS_TO_USD;
    subscriptionCycleStart = spend.subscriptionCycleStart ?? null;
  }

  // ── /teams/filtered-usage-events aggregation ───────────────────────────────
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let requestUnitsConsumed = 0;
  let usageEventCount = 0;
  let actualCostFromEventsCents = 0;
  const kindBreakdown: Record<string, number> = {};
  const dailyEventCostCents = new Map<string, number>();

  interface PerModelAgg {
    eventCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    chargedCents: number;
    requestUnits: number;
    hasTokenData: boolean;
  }
  const perModel = new Map<string, PerModelAgg>();

  if (events) {
    for (const ev of events.usageEvents) {
      usageEventCount += 1;
      requestUnitsConsumed += ev.requestsCosts;
      actualCostFromEventsCents += ev.chargedCents;

      const tu = ev.tokenUsage;
      if (tu) {
        inputTokens += tu.inputTokens;
        outputTokens += tu.outputTokens;
        cacheReadTokens += tu.cacheReadTokens;
        cacheWriteTokens += tu.cacheWriteTokens;
      }

      const kindKey = ev.kind ?? "Unknown";
      kindBreakdown[kindKey] = (kindBreakdown[kindKey] ?? 0) + 1;

      const modelKey = ev.model ?? "unknown";
      const agg = perModel.get(modelKey) ?? {
        eventCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        chargedCents: 0,
        requestUnits: 0,
        hasTokenData: false
      };
      agg.eventCount += 1;
      agg.requestUnits += ev.requestsCosts;
      agg.chargedCents += ev.chargedCents;
      if (tu) {
        agg.inputTokens += tu.inputTokens;
        agg.outputTokens += tu.outputTokens;
        agg.cacheReadTokens += tu.cacheReadTokens;
        agg.cacheWriteTokens += tu.cacheWriteTokens;
        agg.hasTokenData = true;
      }
      perModel.set(modelKey, agg);

      // Bucket charged cost by event day for the spend projection.
      const tsMs = Number(ev.timestamp);
      if (Number.isFinite(tsMs)) {
        const day = epochMsToIsoDay(tsMs);
        dailyEventCostCents.set(day, (dailyEventCostCents.get(day) ?? 0) + ev.chargedCents);
      }
    }
  }

  // Prefer the events feed for actual cost (it's per-event truth); fall back to
  // /teams/spend's per-member aggregate when events aren't available.
  let actualCostUsd: number | null = null;
  if (events) actualCostUsd = actualCostFromEventsCents * CENTS_TO_USD;
  else if (actualCostFromSpend !== null) actualCostUsd = actualCostFromSpend;

  const totalInputVolume = inputTokens + cacheReadTokens;
  const cacheHitRate =
    totalInputVolume > 0 ? cacheReadTokens / totalInputVolume : null;

  const modelsUsed = Array.from(perModel.keys()).sort();
  const perModelBreakdown: CursorPerModelBreakdown[] = Array.from(perModel.entries())
    .map(([model, a]) => ({
      model,
      eventCount: a.eventCount,
      inputTokens: a.inputTokens,
      outputTokens: a.outputTokens,
      cacheReadTokens: a.cacheReadTokens,
      cacheWriteTokens: a.cacheWriteTokens,
      chargedCostUsd: a.hasTokenData || a.chargedCents > 0 ? a.chargedCents * CENTS_TO_USD : null,
      requestUnitsConsumed: a.requestUnits
    }))
    .sort(
      (a, b) =>
        b.inputTokens + b.cacheReadTokens - (a.inputTokens + a.cacheReadTokens)
    );

  // ── Daily breakdown for spend projection ───────────────────────────────────
  let dailyBreakdown: { date: string; costUsd: number }[];
  let costSource: "actual" | "estimated" | "seat_based";
  let costNote: string | undefined;

  if (dailyEventCostCents.size > 0) {
    dailyBreakdown = Array.from(dailyEventCostCents.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cents]) => ({ date, costUsd: cents * CENTS_TO_USD }));
    costSource = "actual";
  } else {
    dailyBreakdown = Array.from(perDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { users, usageBasedReqs }]) => ({
        date,
        costUsd:
          users.size * (SEAT_COST_PER_MONTH / 30) +
          usageBasedReqs * USAGE_BASED_COST_PER_REQ
      }));
    costSource = "seat_based";
    costNote =
      "Active users × $20/seat/mo (Business plan assumed); usage-based @ $0.04/req";
  }

  const spendProjection = buildSpendProjection(dailyBreakdown, costSource, costNote);

  return {
    providerId: "cursor",
    providerLabel: "Cursor",
    reportStartDay: epochMsToIsoDay(daily.period.startDate),
    reportEndDay: epochMsToIsoDay(daily.period.endDate),
    reportAgeLabel: "28-day window",
    comparisonMetric: {
      value:
        totalAgentRequests +
        totalChatRequests +
        totalComposerRequests +
        totalCmdkUsages,
      label: "requests",
      unit: "requests"
    },
    totalCmdkUsages,
    totalComposerRequests,
    totalChatRequests,
    totalAgentRequests,
    totalUsageBasedReqs,
    seatCount,
    estimatedMonthlyCostUsd,
    actualCostUsd,
    includedSpendUsd,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheHitRate,
    modelsUsed,
    perModelBreakdown,
    requestUnitsConsumed,
    usageEventCount,
    kindBreakdown,
    subscriptionCycleStart,
    fastPremiumRequests,
    spendProjection
  };
}
