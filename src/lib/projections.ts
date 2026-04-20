import type {
  DailySpend,
  SpendCostSource,
  SpendProjection,
  SpendTrend
} from "./types";

const MIN_DATA_POINTS_FOR_TREND = 7;

/**
 * Ordinary least-squares linear regression over (index, cost) pairs.
 * Returns slope in USD/day.
 */
function linearRegressionSlope(costs: number[]): number {
  const n = costs.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += costs[i];
    sumXY += i * costs[i];
    sumX2 += i * i;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Projects the average daily cost over `futureDays` days using the linear
 * trend, starting from the last observed data point.
 */
function trendedAvgOverFutureDays(
  costs: number[],
  slope: number,
  futureDays: number
): number {
  const n = costs.length;
  const lastCost = costs[n - 1];

  let total = 0;
  for (let i = 1; i <= futureDays; i++) {
    total += Math.max(0, lastCost + slope * i);
  }
  return total / futureDays;
}

export function buildSpendProjection(
  dailyBreakdown: DailySpend[],
  costSource: SpendCostSource,
  note?: string
): SpendProjection {
  const costs = dailyBreakdown.map((d) => d.costUsd);
  const windowDays = costs.length;
  const totalUsd = costs.reduce((s, c) => s + c, 0);
  const dailyAvgUsd = windowDays > 0 ? totalUsd / windowDays : 0;

  const projectedMonthlyUsd = dailyAvgUsd * 30;
  const projectedAnnualUsd = dailyAvgUsd * 365;

  let trend: SpendTrend = "insufficient_data";
  let trendedMonthlyUsd: number | null = null;
  let trendedAnnualUsd: number | null = null;

  if (windowDays >= MIN_DATA_POINTS_FOR_TREND) {
    const half = Math.floor(windowDays / 2);
    const firstHalfAvg =
      costs.slice(0, half).reduce((s, c) => s + c, 0) / half;
    const secondHalfAvg =
      costs.slice(windowDays - half).reduce((s, c) => s + c, 0) / half;

    if (firstHalfAvg === 0 && secondHalfAvg === 0) {
      trend = "flat";
    } else if (firstHalfAvg === 0 || secondHalfAvg / firstHalfAvg > 1.1) {
      trend = "ramp";
    } else if (secondHalfAvg / firstHalfAvg < 0.9) {
      trend = "decline";
    } else {
      trend = "flat";
    }

    if (trend === "ramp" || trend === "decline") {
      const slope = linearRegressionSlope(costs);
      const futureMonthlyAvg = trendedAvgOverFutureDays(costs, slope, 30);
      const futureAnnualAvg = trendedAvgOverFutureDays(costs, slope, 365);
      trendedMonthlyUsd = futureMonthlyAvg * 30;
      trendedAnnualUsd = futureAnnualAvg * 365;
    }
  }

  return {
    windowDays,
    totalUsd,
    dailyAvgUsd,
    projectedMonthlyUsd,
    projectedAnnualUsd,
    trendedMonthlyUsd,
    trendedAnnualUsd,
    trend,
    costSource,
    note,
    dailyBreakdown
  };
}
