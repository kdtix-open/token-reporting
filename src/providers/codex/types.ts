import { z } from "zod";

import type { ProviderReportSummary } from "../../lib/types";

/** A single per-model, per-project usage row from /v1/organization/usage/completions. */
export const codexUsageResultSchema = z.object({
  /** Total input tokens (includes cached). */
  input_tokens: z.number().int().default(0),
  /** Total output tokens. */
  output_tokens: z.number().int().default(0),
  num_model_requests: z.number().int().default(0),
  // ── Enrichment fields (optional — older snapshots lack these). ────────────
  /** Cached input tokens (subset of input_tokens). */
  input_cached_tokens: z.number().int().optional(),
  /** Uncached input tokens (subset of input_tokens). */
  input_uncached_tokens: z.number().int().optional(),
  input_text_tokens: z.number().int().optional(),
  output_text_tokens: z.number().int().optional(),
  input_audio_tokens: z.number().int().optional(),
  output_audio_tokens: z.number().int().optional(),
  input_cached_text_tokens: z.number().int().optional(),
  input_cached_audio_tokens: z.number().int().optional(),
  input_image_tokens: z.number().int().optional(),
  input_cached_image_tokens: z.number().int().optional(),
  output_image_tokens: z.number().int().optional(),
  model: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  api_key_id: z.string().nullable().optional(),
  service_tier: z.string().nullable().optional(),
  batch: z.boolean().nullable().optional()
});

export const codexUsageBucketSchema = z.object({
  start_time: z.number(),
  end_time: z.number(),
  results: z.array(codexUsageResultSchema)
});

export const codexUsageReportSchema = z.object({
  data: z.array(codexUsageBucketSchema),
  has_more: z.boolean(),
  next_page: z.string().nullable()
});

export type CodexUsageReport = z.infer<typeof codexUsageReportSchema>;
export type CodexUsageResult = z.infer<typeof codexUsageResultSchema>;

/**
 * Costs API result. `value` is returned as a stringly-typed decimal by OpenAI
 * so we coerce; `line_item` is present only when group_by[]=line_item is sent.
 */
export const codexCostsResultSchema = z.object({
  amount: z.object({
    value: z.coerce.number().default(0),
    currency: z.string().default("usd")
  }),
  line_item: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  project_name: z.string().nullable().optional(),
  organization_id: z.string().nullable().optional()
});

export const codexCostsBucketSchema = z.object({
  start_time: z.number(),
  end_time: z.number(),
  results: z.array(codexCostsResultSchema)
});

export const codexCostsReportSchema = z.object({
  data: z.array(codexCostsBucketSchema),
  has_more: z.boolean(),
  next_page: z.string().nullable()
});

export type CodexCostsReport = z.infer<typeof codexCostsReportSchema>;

/** Combined snapshot persisted to public/data/codex/latest-metadata.json */
export const codexSnapshotSchema = z.object({
  usage: codexUsageReportSchema,
  costs: codexCostsReportSchema.optional()
});

export type CodexSnapshot = z.infer<typeof codexSnapshotSchema>;

/** Per-model token + cost breakdown derived from usage and costs aggregates. */
export interface CodexPerModelBreakdown {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  requestCount: number;
  /** Cost USD attributed to this model from line_item parsing (null if no costs data). */
  costUsd: number | null;
}

export interface CodexReportSummary extends ProviderReportSummary {
  providerId: "codex";
  providerLabel: "OpenAI Codex";
  /** Total input tokens (includes cached). Preserves legacy semantics. */
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  estimatedCostUsd: number;
  /** Actual USD spend from /v1/organization/costs (null when costs unavailable). */
  actualCostUsd: number | null;
  // ── Enrichment fields (null when snapshot lacks the data). ────────────────
  /** Sum of input_cached_tokens across all results. Null on legacy snapshots. */
  cacheReadTokens: number | null;
  /** Sum of input_uncached_tokens across all results. Null on legacy snapshots. */
  uncachedInputTokens: number | null;
  audioInputTokens: number | null;
  audioOutputTokens: number | null;
  /** Cached input as fraction of total input (0–1). Null when no token data. */
  cacheHitRate: number | null;
  /** Distinct models seen in usage results (excludes "others"/null). */
  modelsUsed: string[];
  /** Per-model breakdown sorted by input tokens descending. */
  perModelBreakdown: CodexPerModelBreakdown[];
  /** Cost USD that could not be attributed to a specific model (e.g. "web search tool calls"). */
  unattributedCostUsd: number | null;
}
