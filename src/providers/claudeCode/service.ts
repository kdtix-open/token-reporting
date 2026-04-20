import { buildSpendProjection } from "../../lib/projections";
import type { DailySpend } from "../../lib/types";
import type {
  ClaudeCodeSnapshot,
  ClaudeCodeReportSummary,
  ClaudeCodePerModelBreakdown
} from "./types";

/** Return the number of days in a given month (1-indexed). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Spread the flat monthly seat cost across the calendar days covered by
 * the daily buckets. Each day's cost = monthlySeatCost / daysInThatMonth.
 */
function buildSeatBasedDailySpend(
  dates: string[],
  monthlySeatCost: number
): DailySpend[] {
  const cache = new Map<string, number>();
  return dates.map((date) => {
    const yearMonth = date.slice(0, 7);
    if (!cache.has(yearMonth)) {
      const [y, m] = yearMonth.split("-").map(Number);
      cache.set(yearMonth, monthlySeatCost / daysInMonth(y, m));
    }
    return { date, costUsd: cache.get(yearMonth)! };
  });
}

function aggregateModelBreakdowns(
  snapshot: ClaudeCodeSnapshot
): ClaudeCodePerModelBreakdown[] {
  const map = new Map<string, ClaudeCodePerModelBreakdown>();

  for (const bucket of snapshot.dailyBuckets) {
    for (const [model, m] of Object.entries(bucket.models)) {
      if (!map.has(model)) {
        map.set(model, {
          model,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          requestCount: 0
        });
      }
      const agg = map.get(model)!;
      agg.inputTokens += m.inputTokens;
      agg.outputTokens += m.outputTokens;
      agg.cacheReadTokens += m.cacheReadTokens;
      agg.cacheCreationTokens += m.cacheCreationTokens;
      agg.requestCount += m.requestCount;
    }
  }

  return [...map.values()].sort(
    (a, b) => b.inputTokens + b.cacheReadTokens - (a.inputTokens + a.cacheReadTokens)
  );
}

export function createClaudeCodeReportSummary(
  snapshot: ClaudeCodeSnapshot
): ClaudeCodeReportSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let requestCount = 0;
  let webSearchRequests = 0;
  let webFetchRequests = 0;

  for (const b of snapshot.dailyBuckets) {
    inputTokens += b.inputTokens;
    outputTokens += b.outputTokens;
    cacheReadTokens += b.cacheReadTokens;
    cacheCreationTokens += b.cacheCreationTokens;
    requestCount += b.requestCount;
    webSearchRequests += b.webSearchRequests;
    webFetchRequests += b.webFetchRequests;
  }

  const dates = snapshot.dailyBuckets.map((b) => b.date);
  const reportStartDay = dates[0] ?? new Date().toISOString().slice(0, 10);
  const reportEndDay = dates[dates.length - 1] ?? reportStartDay;

  const dailyBreakdown = buildSeatBasedDailySpend(
    dates,
    snapshot.monthlySeatCost
  );
  const costNote = `Flat $${snapshot.monthlySeatCost}/mo subscription`;
  const spendProjection = buildSpendProjection(
    dailyBreakdown,
    "seat_based",
    costNote
  );

  const totalInput = inputTokens + cacheReadTokens;
  const cacheHitRate =
    totalInput > 0 ? cacheReadTokens / totalInput : null;

  const windowDays = snapshot.dailyBuckets.length;
  const reportAgeLabel =
    windowDays > 0 ? `${windowDays}-day window` : "no data";

  return {
    providerId: "claude-code",
    providerLabel: "Claude Code",
    reportStartDay,
    reportEndDay,
    reportAgeLabel,
    comparisonMetric: {
      value: requestCount,
      label: "requests",
      unit: "requests"
    },
    spendProjection,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    requestCount,
    sessionCount: snapshot.sessionCount,
    monthlySeatCost: snapshot.monthlySeatCost,
    cacheHitRate,
    modelsUsed: snapshot.modelsUsed,
    perModelBreakdown: aggregateModelBreakdowns(snapshot),
    webSearchRequests,
    webFetchRequests
  };
}
