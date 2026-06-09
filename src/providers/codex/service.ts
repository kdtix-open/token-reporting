import { buildSpendProjection } from "../../lib/projections";
import type { DailySpend } from "../../lib/types";
import type {
  CodexUsageReport,
  CodexCostsReport,
  CodexReportSummary,
  CodexPerModelBreakdown,
  CodexUsageResult
} from "./types";

/** Default blended pricing used only when actual line-item costs are unavailable. */
const CODEX_INPUT_COST_PER_MTOK = 2.5;
const CODEX_OUTPUT_COST_PER_MTOK = 10.0;

function unixSecToIsoDay(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

/** True when a usage result was returned by an enriched (group_by=model) snapshot. */
function isEnriched(result: CodexUsageResult): boolean {
  return (
    result.input_uncached_tokens !== undefined ||
    result.input_cached_tokens !== undefined ||
    result.model !== undefined
  );
}

interface ParsedLineItem {
  model: string;
  tier: string | null;
  modality: "text" | "audio" | "image" | null;
  /** "input", "cached input", or "output" */
  bucket: "input" | "cached input" | "output";
}

/**
 * Parse line_item strings like:
 *   "gpt-5.3-codex, input"
 *   "gpt-5.3-codex, cached input"
 *   "priority | gpt-5.4-2026-03-05, input"
 *   "gpt-realtime-1.5 audio, output"
 * Returns null for items that don't match (e.g. "web search tool calls").
 */
function parseLineItem(raw: string): ParsedLineItem | null {
  const trimmed = raw.trim();
  // Split off optional "<tier> | " prefix.
  let tier: string | null = null;
  let body = trimmed;
  const tierMatch = /^([\w-]+)\s+\|\s+(.+)$/.exec(trimmed);
  if (tierMatch) {
    tier = tierMatch[1];
    body = tierMatch[2];
  }

  // Body must be "<model>[ <modality>], <bucket>"
  const bodyMatch = /^(.+?),\s*(input|cached input|output)$/.exec(body);
  if (!bodyMatch) return null;

  let modelPart = bodyMatch[1].trim();
  const bucket = bodyMatch[2] as "input" | "cached input" | "output";

  let modality: "text" | "audio" | "image" | null = null;
  const modalityMatch = /^(.+?)\s+(audio|text|image)$/.exec(modelPart);
  if (modalityMatch) {
    modelPart = modalityMatch[1];
    modality = modalityMatch[2] as "text" | "audio" | "image";
  }

  return { model: modelPart, tier, modality, bucket };
}

export function createCodexReportSummary(
  usage: CodexUsageReport,
  costs?: CodexCostsReport,
  snapshotGeneratedAt?: string
): CodexReportSummary {
  let inputTokens = 0;
  let outputTokens = 0;
  let requestCount = 0;
  let cachedInputTokens = 0;
  let uncachedInputTokens = 0;
  let audioInputTokens = 0;
  let audioOutputTokens = 0;
  let anyEnriched = false;

  // Per-model token aggregates.
  const perModel = new Map<
    string,
    {
      inputTokens: number;
      cachedInputTokens: number;
      uncachedInputTokens: number;
      outputTokens: number;
      requestCount: number;
    }
  >();

  const sortedUsage = [...usage.data].sort((a, b) => a.start_time - b.start_time);

  for (const bucket of sortedUsage) {
    for (const result of bucket.results) {
      inputTokens += result.input_tokens;
      outputTokens += result.output_tokens;
      requestCount += result.num_model_requests;

      if (isEnriched(result)) {
        anyEnriched = true;
        cachedInputTokens += result.input_cached_tokens ?? 0;
        // Fall back to (input - cached) when uncached is absent but cached present.
        uncachedInputTokens +=
          result.input_uncached_tokens ??
          Math.max(0, result.input_tokens - (result.input_cached_tokens ?? 0));
        audioInputTokens += result.input_audio_tokens ?? 0;
        audioOutputTokens += result.output_audio_tokens ?? 0;

        const modelKey = result.model ?? "unknown";
        if (modelKey !== "unknown") {
          const entry = perModel.get(modelKey) ?? {
            inputTokens: 0,
            cachedInputTokens: 0,
            uncachedInputTokens: 0,
            outputTokens: 0,
            requestCount: 0
          };
          entry.inputTokens += result.input_tokens;
          entry.cachedInputTokens += result.input_cached_tokens ?? 0;
          entry.uncachedInputTokens +=
            result.input_uncached_tokens ??
            Math.max(0, result.input_tokens - (result.input_cached_tokens ?? 0));
          entry.outputTokens += result.output_tokens;
          entry.requestCount += result.num_model_requests;
          perModel.set(modelKey, entry);
        }
      }
    }
  }

  // ── Cost aggregation ───────────────────────────────────────────────────────
  let actualCostUsd: number | null = null;
  let unattributedCostUsd: number | null = null;
  const costByModel = new Map<string, number>();

  if (costs && costs.data.length > 0) {
    actualCostUsd = 0;
    unattributedCostUsd = 0;
    for (const bucket of costs.data) {
      for (const result of bucket.results) {
        const value = result.amount.value;
        actualCostUsd += value;
        if (result.line_item) {
          const parsed = parseLineItem(result.line_item);
          if (parsed) {
            costByModel.set(parsed.model, (costByModel.get(parsed.model) ?? 0) + value);
          } else {
            unattributedCostUsd += value;
          }
        } else {
          // No line_item grouping in this snapshot — treat as unattributed.
          unattributedCostUsd += value;
        }
      }
    }
  }

  const estimatedCostUsd =
    (inputTokens / 1_000_000) * CODEX_INPUT_COST_PER_MTOK +
    (outputTokens / 1_000_000) * CODEX_OUTPUT_COST_PER_MTOK;

  const startTime = sortedUsage.length > 0 ? sortedUsage[0].start_time : 0;
  const endTime = sortedUsage.length > 0 ? sortedUsage[sortedUsage.length - 1].end_time : 0;

  // Build daily spend breakdown — prefer actual costs when available.
  let dailyBreakdown: DailySpend[];
  let costSource: "actual" | "estimated";

  if (costs && costs.data.length > 0) {
    const sortedCosts = [...costs.data].sort((a, b) => a.start_time - b.start_time);
    dailyBreakdown = sortedCosts.map((bucket) => ({
      date: unixSecToIsoDay(bucket.start_time),
      costUsd: bucket.results.reduce((s, r) => s + r.amount.value, 0)
    }));
    costSource = "actual";
  } else {
    dailyBreakdown = sortedUsage.map((bucket) => {
      const bucketInput = bucket.results.reduce((s, r) => s + r.input_tokens, 0);
      const bucketOutput = bucket.results.reduce((s, r) => s + r.output_tokens, 0);
      return {
        date: unixSecToIsoDay(bucket.start_time),
        costUsd:
          (bucketInput / 1_000_000) * CODEX_INPUT_COST_PER_MTOK +
          (bucketOutput / 1_000_000) * CODEX_OUTPUT_COST_PER_MTOK
      };
    });
    costSource = "estimated";
  }

  const spendProjection = buildSpendProjection(
    dailyBreakdown,
    costSource,
    costSource === "estimated" ? "Blended gpt-4o rate assumed" : undefined
  );

  // ── Derived enrichment fields ──────────────────────────────────────────────
  const cacheHitRate =
    anyEnriched && inputTokens > 0 ? cachedInputTokens / inputTokens : null;

  const modelsUsed = Array.from(perModel.keys())
    .filter((m) => m !== "others")
    .sort();

  const perModelBreakdown: CodexPerModelBreakdown[] = Array.from(perModel.entries())
    .map(([model, agg]) => ({
      model,
      inputTokens: agg.inputTokens,
      cachedInputTokens: agg.cachedInputTokens,
      uncachedInputTokens: agg.uncachedInputTokens,
      outputTokens: agg.outputTokens,
      requestCount: agg.requestCount,
      costUsd: costByModel.get(model) ?? null
    }))
    .sort((a, b) => b.inputTokens - a.inputTokens);

  return {
    providerId: "codex",
    providerLabel: "OpenAI Codex",
    reportStartDay: unixSecToIsoDay(startTime),
    reportEndDay: unixSecToIsoDay(endTime),
    snapshotGeneratedAt,
    reportAgeLabel: "28-day window",
    comparisonMetric: {
      value: requestCount,
      label: "requests",
      unit: "requests"
    },
    inputTokens,
    outputTokens,
    requestCount,
    estimatedCostUsd,
    actualCostUsd,
    cacheReadTokens: anyEnriched ? cachedInputTokens : null,
    uncachedInputTokens: anyEnriched ? uncachedInputTokens : null,
    audioInputTokens: anyEnriched ? audioInputTokens : null,
    audioOutputTokens: anyEnriched ? audioOutputTokens : null,
    cacheHitRate,
    modelsUsed,
    perModelBreakdown,
    unattributedCostUsd,
    spendProjection
  };
}
