import { z } from "zod";

import type { ProviderReportSummary } from "../../lib/types";

const claudeCacheCreationSchema = z.object({
  ephemeral_1h_input_tokens: z.number().int().default(0),
  ephemeral_5m_input_tokens: z.number().int().default(0)
});

export const claudeUsageResultSchema = z.object({
  uncached_input_tokens: z.number().int().default(0),
  cache_creation: claudeCacheCreationSchema.optional(),
  cache_read_input_tokens: z.number().int().default(0),
  output_tokens: z.number().int().default(0),
  server_tool_use: z
    .object({ web_search_requests: z.number().int().default(0) })
    .optional(),
  api_key_id: z.string().nullable().optional(),
  workspace_id: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  service_account_id: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  service_tier: z.string().nullable().optional(),
  context_window: z.string().nullable().optional(),
  inference_geo: z.string().nullable().optional()
});

export const claudeUsageBucketSchema = z.object({
  starting_at: z.string(),
  ending_at: z.string(),
  results: z.array(claudeUsageResultSchema)
});

export const claudeUsageReportSchema = z.object({
  data: z.array(claudeUsageBucketSchema),
  has_more: z.boolean(),
  next_page: z.string().nullable()
});

export type ClaudeUsageReport = z.infer<typeof claudeUsageReportSchema>;
export type ClaudeUsageResult = z.infer<typeof claudeUsageResultSchema>;

/**
 * Result row from /v1/organizations/cost_report.
 * `amount` is a stringly-typed decimal, `token_type` enumerates which usage
 * field the line corresponds to (uncached_input_tokens, cache_read_input_tokens,
 * cache_creation.ephemeral_5m_input_tokens, output_tokens, etc.).
 */
export const claudeCostsResultSchema = z.object({
  currency: z.string().default("USD"),
  amount: z.coerce.number().default(0),
  workspace_id: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  cost_type: z.string().nullable().optional(),
  context_window: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  service_tier: z.string().nullable().optional(),
  token_type: z.string().nullable().optional(),
  inference_geo: z.string().nullable().optional()
});

export const claudeCostsBucketSchema = z.object({
  starting_at: z.string(),
  ending_at: z.string(),
  results: z.array(claudeCostsResultSchema)
});

export const claudeCostsReportSchema = z.object({
  data: z.array(claudeCostsBucketSchema),
  has_more: z.boolean(),
  next_page: z.string().nullable()
});

export type ClaudeCostsReport = z.infer<typeof claudeCostsReportSchema>;

/** Combined snapshot shape persisted to public/data/claude/latest-metadata.json. */
export const claudeSnapshotSchema = z.object({
  generatedAt: z.string().optional(),
  usage: claudeUsageReportSchema,
  costs: claudeCostsReportSchema.optional()
});

export type ClaudeSnapshot = z.infer<typeof claudeSnapshotSchema>;

export interface ClaudePerModelBreakdown {
  model: string;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
  /** Cost USD attributed from the cost report (null when costs unavailable). */
  costUsd: number | null;
}

export interface ClaudeReportSummary extends ProviderReportSummary {
  providerId: "claude";
  providerLabel: "Claude";
  /** Uncached input tokens (Anthropic's `uncached_input_tokens`). */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUsd: number;
  /** Actual USD spend from /v1/organizations/cost_report (null when unavailable). */
  actualCostUsd: number | null;
  /** Cache reads as fraction of (uncached + cacheRead) input volume. Null when no input. */
  cacheHitRate: number | null;
  /** Distinct models seen in usage results, sorted. */
  modelsUsed: string[];
  /** Per-model breakdown sorted by total input tokens (uncached + cacheRead) descending. */
  perModelBreakdown: ClaudePerModelBreakdown[];
  /** Total server-side web search requests across all results. */
  webSearchRequests: number;
  /** Cost USD that could not be attributed to a specific model. */
  unattributedCostUsd: number | null;
}
