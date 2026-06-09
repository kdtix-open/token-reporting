import { z } from "zod";

import type { ProviderReportSummary } from "../../lib/types";

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One per-user per-day record from a GitHub Copilot signed NDJSON usage file. */
export const githubCopilotUsageRecordSchema = z.object({
  day: isoDaySchema,
  user_id: z.number().int().optional(),
  user_login: z.string().optional(),
  user_initiated_interaction_count: z.number().int().default(0),
  code_generation_activity_count: z.number().int().default(0),
  code_acceptance_activity_count: z.number().int().default(0),
  loc_suggested_to_add_sum: z.number().int().default(0),
  loc_added_sum: z.number().int().default(0),
  /** CLI token telemetry — only present when Copilot CLI was used that day. */
  totals_by_cli: z
    .object({
      session_count: z.number().int().default(0),
      request_count: z.number().int().default(0),
      prompt_count: z.number().int().default(0),
      token_usage: z
        .object({
          prompt_tokens_sum: z.number().int().default(0),
          output_tokens_sum: z.number().int().default(0),
          avg_tokens_per_request: z.number().default(0)
        })
        .optional()
    })
    .optional(),
  /** Per-model breakdown of interactions within each feature. */
  totals_by_model_feature: z
    .array(
      z.object({
        model: z.string(),
        feature: z.string(),
        user_initiated_interaction_count: z.number().int().default(0)
      })
    )
    .optional(),
  used_cli: z.boolean().default(false),
  used_chat: z.boolean().default(false),
  used_agent: z.boolean().default(false),
  used_copilot_coding_agent: z.boolean().default(false),
  used_copilot_code_review_active: z.boolean().default(false)
});

export type GitHubCopilotUsageRecord = z.infer<
  typeof githubCopilotUsageRecordSchema
>;

/** Per-model-per-feature interaction breakdown derived from totals_by_model_feature. */
export interface GitHubCopilotPerModelFeature {
  model: string;
  feature: string;
  interactionCount: number;
}

/**
 * Per-model breakdown for cross-provider fleet aggregation.
 *
 * Copilot's admin API does NOT expose per-model token telemetry. Tokens are
 * reported only as CLI aggregates (totals_by_cli) and interactions are
 * reported per (model, feature) pair. We allocate CLI tokens proportionally
 * across CLI-feature models by interaction share. Non-CLI features (chat,
 * agent, code-review) report interactions only.
 */
export interface GitHubCopilotPerModelBreakdown {
  model: string;
  /** All interactions across all features (cli + chat + agent + code-review). */
  interactionCount: number;
  /** Allocated CLI input tokens (proportional to CLI-feature interaction share). */
  inputTokens: number;
  /** Allocated CLI output tokens (proportional to CLI-feature interaction share). */
  outputTokens: number;
  /** Allocated CLI requests (proportional to CLI-feature interaction share). */
  requestCount: number;
  /** Allocated seat cost USD (proportional to total interaction share). Null when no seats. */
  costUsd: number | null;
  /** Features this model was used in. */
  features: string[];
  /** True when only non-CLI features used this model (no token telemetry available). */
  tokensUnavailable: boolean;
}

/** Aggregated usage metrics computed from the downloaded NDJSON files. */
export const githubCopilotUsageSummarySchema = z.object({
  totalInteractions: z.number().int(),
  totalCodeGenerations: z.number().int(),
  totalAcceptances: z.number().int(),
  totalLinesAdded: z.number().int(),
  totalLocSuggested: z.number().int(),
  activeUserCount: z.number().int(),
  /** Prompt-side token total from CLI usage (prompt_tokens_sum). Absent on old snapshots. */
  totalCliInputTokens: z.number().int().default(0),
  /** Output token total from CLI usage. Absent on old snapshots. */
  totalCliOutputTokens: z.number().int().default(0),
  /** CLI request count (distinct API calls, not user prompts). Absent on old snapshots. */
  totalCliRequests: z.number().int().default(0),
  /** CLI session count. Absent on old snapshots. */
  totalCliSessions: z.number().int().default(0),
  /** Unique model IDs used via CLI (e.g. "claude-sonnet-4.6"). Absent on old snapshots. */
  cliModelsUsed: z.array(z.string()).default([]),
  /** (model, feature) → interaction count. Absent on old snapshots. */
  modelFeatureBreakdown: z
    .array(
      z.object({
        model: z.string(),
        feature: z.string(),
        interactionCount: z.number().int()
      })
    )
    .default([])
});

export type GitHubCopilotUsageSummary = z.infer<
  typeof githubCopilotUsageSummarySchema
>;

export const gitHubCopilotLatestUsersReportSchema = z.object({
  download_links: z.array(z.url()),
  report_start_day: isoDaySchema,
  report_end_day: isoDaySchema,
  generatedAt: z.string().optional(),
  /** Populated by the fetch script after downloading and parsing the signed files. */
  usage_summary: githubCopilotUsageSummarySchema.optional(),
  /** Populated by the fetch script from the billing seats endpoint. */
  billing_seats: z
    .object({
      total_seats: z.number().int(),
      plan: z.enum(["business", "enterprise"]).default("business")
    })
    .optional(),
  /**
   * Locally persisted raw records from signed report files. GitHub's API only
   * exposes the latest 28-day export, so retaining these rows is what allows
   * this project to build a cumulative history over repeated runs.
   */
  usage_records: z.array(githubCopilotUsageRecordSchema).optional()
});

export type GitHubCopilotLatestUsersReport = z.infer<
  typeof gitHubCopilotLatestUsersReportSchema
>;

export interface GitHubCopilotReportSummary extends ProviderReportSummary {
  providerId: "github-copilot";
  providerLabel: "GitHub Copilot";
  organization: string;
  downloadCount: number;
  /** Populated only after usage files have been downloaded and aggregated. */
  totalInteractions: number | null;
  totalCodeGenerations: number | null;
  totalAcceptances: number | null;
  totalLinesAdded: number | null;
  totalLocSuggested: number | null;
  activeUserCount: number | null;
  /** From billing seats endpoint. */
  billedSeats: number | null;
  estimatedMonthlyCostUsd: number | null;
  /**
   * Prompt-side tokens from CLI usage only (prompt_tokens_sum).
   * Named `cliInputTokens` rather than `inputTokens` because token coverage
   * is limited to CLI interactions — IDE chat, agent, and code-review usage
   * does not contribute token telemetry via the admin API.
   */
  cliInputTokens: number | null;
  /** Output tokens from CLI usage only (output_tokens_sum). */
  cliOutputTokens: number | null;
  /** Total CLI API requests (not user prompts) — used as request denominator for sizing. */
  cliRequestCount: number | null;
  /** CLI session count (one session = one `gh copilot suggest/explain` invocation). */
  cliSessionCount: number | null;
  /** Model IDs observed in CLI usage (deduped, CLI feature only). */
  cliModelsUsed: string[];
  /** Per-model breakdown across all features. Tokens allocated proportionally. */
  perModelBreakdown: GitHubCopilotPerModelBreakdown[];
}
