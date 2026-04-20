export interface ComparisonMetric {
  /** null means data is unavailable (not fetched yet). 0 means fetched but zero activity. */
  value: number | null;
  label: string;
  unit: "requests" | "tokens";
}

export interface DailySpend {
  /** ISO date string "YYYY-MM-DD" */
  date: string;
  costUsd: number;
}

/** How the cost figure was derived. */
export type SpendCostSource = "actual" | "estimated" | "seat_based";

/** Direction of spend over the reporting window. */
export type SpendTrend = "ramp" | "flat" | "decline" | "insufficient_data";

export interface SpendProjection {
  windowDays: number;
  totalUsd: number;
  dailyAvgUsd: number;
  /** Flat projection: dailyAvgUsd × 30 */
  projectedMonthlyUsd: number;
  /** Flat projection: dailyAvgUsd × 365 */
  projectedAnnualUsd: number;
  /** Trend-extrapolated 30-day projection; null when trend is not "ramp" or "decline". */
  trendedMonthlyUsd: number | null;
  /** Trend-extrapolated 365-day projection; null when trend is not "ramp" or "decline". */
  trendedAnnualUsd: number | null;
  trend: SpendTrend;
  costSource: SpendCostSource;
  /** Human-readable caveat, e.g. "Blended model rate assumed". */
  note?: string;
  dailyBreakdown: DailySpend[];
}

export interface ProviderReportSummary {
  providerId: string;
  providerLabel: string;
  reportStartDay: string;
  reportEndDay: string;
  reportAgeLabel: string;
  comparisonMetric: ComparisonMetric;
  spendProjection: SpendProjection;
}
