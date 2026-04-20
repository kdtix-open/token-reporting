import { z } from "zod";

import type { ProviderReportSummary } from "../../lib/types";

/** Per-day aggregated token and request counts from Claude Code sessions. */
export const claudeCodeDailyBucketSchema = z.object({
  date: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cacheReadTokens: z.number().int(),
  cacheCreationTokens: z.number().int(),
  requestCount: z.number().int(),
  webSearchRequests: z.number().int(),
  webFetchRequests: z.number().int(),
  /** Per-model token totals for this day. */
  models: z.record(
    z.string(),
    z.object({
      inputTokens: z.number().int(),
      outputTokens: z.number().int(),
      cacheReadTokens: z.number().int(),
      cacheCreationTokens: z.number().int(),
      requestCount: z.number().int()
    })
  )
});

export type ClaudeCodeDailyBucket = z.infer<typeof claudeCodeDailyBucketSchema>;

/** Snapshot shape persisted to public/data/claude-code/latest-metadata.json. */
export const claudeCodeSnapshotSchema = z.object({
  generatedAt: z.string(),
  monthlySeatCost: z.number(),
  sessionCount: z.number().int(),
  modelsUsed: z.array(z.string()),
  dailyBuckets: z.array(claudeCodeDailyBucketSchema)
});

export type ClaudeCodeSnapshot = z.infer<typeof claudeCodeSnapshotSchema>;

export interface ClaudeCodePerModelBreakdown {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  requestCount: number;
}

export interface ClaudeCodeReportSummary extends ProviderReportSummary {
  providerId: "claude-code";
  providerLabel: "Claude Code";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  requestCount: number;
  sessionCount: number;
  /** Flat monthly subscription cost used for seat-based projection. */
  monthlySeatCost: number;
  /** Cache reads as fraction of (input + cacheRead). Null when no input. */
  cacheHitRate: number | null;
  modelsUsed: string[];
  perModelBreakdown: ClaudeCodePerModelBreakdown[];
  webSearchRequests: number;
  webFetchRequests: number;
}
