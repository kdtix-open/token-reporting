import { buildSpendProjection } from "../../lib/projections";
import type { DailySpend } from "../../lib/types";
import type {
  ClaudeUsageReport,
  ClaudeCostsReport,
  ClaudeReportSummary,
  ClaudePerModelBreakdown
} from "./types";

/** Per-model pricing in USD per million tokens: [input, output, cacheRead, cacheCreation] */
const MODEL_PRICING: Record<string, [number, number, number, number]> = {
  "claude-opus-4-5":       [15.0, 75.0, 1.50, 18.75],
  "claude-opus-4":         [15.0, 75.0, 1.50, 18.75],
  "claude-3-opus-20240229":[15.0, 75.0, 1.50, 18.75],
  "claude-sonnet-4-6":     [3.0,  15.0, 0.30, 3.75],
  "claude-sonnet-4-5":     [3.0,  15.0, 0.30, 3.75],
  "claude-sonnet-4":       [3.0,  15.0, 0.30, 3.75],
  "claude-3-5-sonnet-20241022": [3.0, 15.0, 0.30, 3.75],
  "claude-3-5-sonnet-20240620": [3.0, 15.0, 0.30, 3.75],
  "claude-3-sonnet-20240229":   [3.0, 15.0, 0.30, 3.75],
  "claude-haiku-4-5":      [0.80, 4.0,  0.08, 1.00],
  "claude-haiku-4-5-20251001": [0.80, 4.0, 0.08, 1.00],
  "claude-3-5-haiku-20241022":  [0.80, 4.0, 0.08, 1.00],
  "claude-3-haiku-20240307":    [0.25, 1.25, 0.03, 0.30],
};

/** Blended fallback when model is unknown */
const BLENDED: [number, number, number, number] = [3.0, 15.0, 0.30, 3.75];

/**
 * Anthropic's `cost_report` API returns `amount` in **cents** (1/100 USD), even
 * though the response advertises `currency: "USD"`. This is consistent across
 * every line item we've observed and reconciles exactly to the figures shown on
 * console.anthropic.com (Billing → Spend & Cost Dashboard). Without this divisor
 * our reported actual spend was ~100× the real number.
 */
const COST_AMOUNT_TO_USD = 1 / 100;

function costForResult(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
  model: string | null | undefined
): number {
  const [inp, out, cRead, cCreate] = MODEL_PRICING[model ?? ""] ?? BLENDED;
  return (
    (inputTokens / 1_000_000) * inp +
    (outputTokens / 1_000_000) * out +
    (cacheReadTokens / 1_000_000) * cRead +
    (cacheCreationTokens / 1_000_000) * cCreate
  );
}

export function createClaudeReportSummary(
  report: ClaudeUsageReport,
  costs?: ClaudeCostsReport,
  snapshotGeneratedAt?: string
): ClaudeReportSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let webSearchRequests = 0;

  // Per-model token aggregates (keyed by model name).
  interface PerModelAgg {
    uncachedInputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    outputTokens: number;
  }
  const perModel = new Map<string, PerModelAgg>();

  // Sort to guard against out-of-order buckets from the paginated API.
  const sorted = [...report.data].sort((a, b) =>
    a.starting_at.localeCompare(b.starting_at)
  );

  // Daily estimated-cost map (used only when `costs` is unavailable).
  const dailyCostMap = new Map<string, number>();

  for (const bucket of sorted) {
    const day = bucket.starting_at.slice(0, 10);
    let dayCost = 0;

    for (const result of bucket.results) {
      const bucketInput = result.uncached_input_tokens;
      const bucketOutput = result.output_tokens;
      const bucketCacheRead = result.cache_read_input_tokens;
      const bucketCacheCreate =
        (result.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
        (result.cache_creation?.ephemeral_1h_input_tokens ?? 0);

      inputTokens += bucketInput;
      outputTokens += bucketOutput;
      cacheReadTokens += bucketCacheRead;
      cacheCreationTokens += bucketCacheCreate;
      webSearchRequests += result.server_tool_use?.web_search_requests ?? 0;

      if (result.model) {
        const entry = perModel.get(result.model) ?? {
          uncachedInputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          outputTokens: 0
        };
        entry.uncachedInputTokens += bucketInput;
        entry.cacheReadTokens += bucketCacheRead;
        entry.cacheCreationTokens += bucketCacheCreate;
        entry.outputTokens += bucketOutput;
        perModel.set(result.model, entry);
      }

      dayCost += costForResult(
        bucketInput,
        bucketOutput,
        bucketCacheRead,
        bucketCacheCreate,
        result.model
      );
    }

    dailyCostMap.set(day, (dailyCostMap.get(day) ?? 0) + dayCost);
  }

  const estimatedCostUsd = costForResult(
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    null
  );

  // ── Cost aggregation from cost_report ──────────────────────────────────────
  let actualCostUsd: number | null = null;
  let unattributedCostUsd: number | null = null;
  const costByModel = new Map<string, number>();
  const dailyActualCostMap = new Map<string, number>();

  if (costs && costs.data.length > 0) {
    actualCostUsd = 0;
    unattributedCostUsd = 0;
    for (const bucket of costs.data) {
      const day = bucket.starting_at.slice(0, 10);
      let dayActual = 0;
      for (const result of bucket.results) {
        const value = result.amount * COST_AMOUNT_TO_USD;
        actualCostUsd += value;
        dayActual += value;
        if (result.model) {
          costByModel.set(result.model, (costByModel.get(result.model) ?? 0) + value);
        } else {
          // No model attribution (e.g. tool-use cost lines without a model).
          unattributedCostUsd += value;
        }
      }
      if (dayActual > 0) {
        dailyActualCostMap.set(day, (dailyActualCostMap.get(day) ?? 0) + dayActual);
      }
    }
  }

  // Prefer actual daily costs when available.
  let dailyBreakdown: DailySpend[];
  let costSource: "actual" | "estimated";
  if (dailyActualCostMap.size > 0) {
    dailyBreakdown = Array.from(dailyActualCostMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, costUsd]) => ({ date, costUsd }));
    costSource = "actual";
  } else {
    dailyBreakdown = Array.from(dailyCostMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, costUsd]) => ({ date, costUsd }));
    costSource = "estimated";
  }

  const hasModelData = sorted.some((b) => b.results.some((r) => r.model));
  const spendProjection = buildSpendProjection(
    dailyBreakdown,
    costSource,
    costSource === "estimated" && !hasModelData
      ? "Blended claude-3-5-sonnet rate assumed"
      : undefined
  );

  const startDay = sorted.length > 0 ? sorted[0].starting_at.slice(0, 10) : "";
  const endDay =
    sorted.length > 0 ? sorted[sorted.length - 1].ending_at.slice(0, 10) : "";

  // ── Derived enrichment fields ──────────────────────────────────────────────
  const totalInputVolume = inputTokens + cacheReadTokens;
  const cacheHitRate = totalInputVolume > 0 ? cacheReadTokens / totalInputVolume : null;

  const modelsUsed = Array.from(perModel.keys()).sort();

  const perModelBreakdown: ClaudePerModelBreakdown[] = Array.from(perModel.entries())
    .map(([model, agg]) => ({
      model,
      uncachedInputTokens: agg.uncachedInputTokens,
      cacheReadTokens: agg.cacheReadTokens,
      cacheCreationTokens: agg.cacheCreationTokens,
      outputTokens: agg.outputTokens,
      costUsd: costByModel.get(model) ?? null
    }))
    .sort(
      (a, b) =>
        b.uncachedInputTokens +
        b.cacheReadTokens -
        (a.uncachedInputTokens + a.cacheReadTokens)
    );

  return {
    providerId: "claude",
    providerLabel: "Claude",
    reportStartDay: startDay,
    reportEndDay: endDay,
    snapshotGeneratedAt,
    reportAgeLabel: "28-day window",
    comparisonMetric: {
      value: outputTokens,
      label: "output tokens",
      unit: "tokens"
    },
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    estimatedCostUsd,
    actualCostUsd,
    cacheHitRate,
    modelsUsed,
    perModelBreakdown,
    webSearchRequests,
    unattributedCostUsd,
    spendProjection
  };
}
