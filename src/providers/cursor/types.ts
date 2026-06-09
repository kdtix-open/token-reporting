import { z } from "zod";

import type { ProviderReportSummary } from "../../lib/types";

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const cursorDailyUsageItemSchema = z.object({
  userId: z.string(),
  day: isoDaySchema,
  date: z.number(),
  email: z.string().optional(),
  cmdkUsages: z.number().int().default(0),
  composerRequests: z.number().int().default(0),
  chatRequests: z.number().int().default(0),
  agentRequests: z.number().int().default(0),
  usageBasedReqs: z.number().int().default(0),
  subscriptionIncludedReqs: z.number().int().default(0),
  bugbotUsages: z.number().int().default(0)
});

export const cursorDailyUsageResponseSchema = z.object({
  data: z.array(cursorDailyUsageItemSchema),
  period: z.object({
    startDate: z.number(),
    endDate: z.number()
  })
});

export type CursorDailyUsageResponse = z.infer<
  typeof cursorDailyUsageResponseSchema
>;

// ── /teams/spend ────────────────────────────────────────────────────────────
export const cursorTeamSpendItemSchema = z.object({
  userId: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  role: z.string().optional(),
  spendCents: z.number().default(0),
  includedSpendCents: z.number().default(0),
  fastPremiumRequests: z.number().default(0),
  monthlyLimitDollars: z.number().nullable().optional(),
  hardLimitOverrideDollars: z.number().nullable().optional()
});

export const cursorTeamSpendResponseSchema = z.object({
  teamMemberSpend: z.array(cursorTeamSpendItemSchema),
  subscriptionCycleStart: z.number().optional(),
  totalMembers: z.number().optional(),
  limitedUsersCount: z.number().optional(),
  maxUserSpendCents: z.number().optional()
});

export type CursorTeamSpendResponse = z.infer<typeof cursorTeamSpendResponseSchema>;

// ── /teams/filtered-usage-events ────────────────────────────────────────────
export const cursorTokenUsageSchema = z.object({
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  cacheWriteTokens: z.number().default(0),
  cacheReadTokens: z.number().default(0),
  totalCents: z.number().default(0)
});

export const cursorUsageEventSchema = z.object({
  // Cursor returns timestamps as stringified epoch-millis.
  timestamp: z.union([z.string(), z.number()]).transform((v) => String(v)),
  model: z.string().nullable().optional(),
  kind: z.string().nullable().optional(),
  maxMode: z.boolean().optional(),
  requestsCosts: z.number().default(0),
  isTokenBasedCall: z.boolean().optional(),
  tokenUsage: cursorTokenUsageSchema.nullable().optional(),
  userEmail: z.string().nullable().optional(),
  cursorTokenFee: z.number().default(0),
  isChargeable: z.boolean().optional(),
  isHeadless: z.boolean().optional(),
  chargedCents: z.number().default(0)
});

export const cursorFilteredUsageEventsResponseSchema = z.object({
  totalUsageEventsCount: z.number().optional(),
  pagination: z
    .object({
      numPages: z.number(),
      currentPage: z.number(),
      pageSize: z.number(),
      hasNextPage: z.boolean().optional(),
      hasPreviousPage: z.boolean().optional()
    })
    .optional(),
  usageEvents: z.array(cursorUsageEventSchema),
  period: z
    .object({
      startDate: z.number(),
      endDate: z.number()
    })
    .optional()
});

export type CursorFilteredUsageEventsResponse = z.infer<
  typeof cursorFilteredUsageEventsResponseSchema
>;

// ── Combined snapshot persisted to disk ─────────────────────────────────────
export const cursorSnapshotSchema = z.object({
  generatedAt: z.string().optional(),
  daily: cursorDailyUsageResponseSchema,
  spend: cursorTeamSpendResponseSchema.optional(),
  events: cursorFilteredUsageEventsResponseSchema.optional()
});

export type CursorSnapshot = z.infer<typeof cursorSnapshotSchema>;

export interface CursorPerModelBreakdown {
  model: string;
  eventCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Sum of per-event chargedCents / 100, or null if no token-based events for the model. */
  chargedCostUsd: number | null;
  /** Sum of `requestsCosts` — Business-plan request units consumed (not dollars). */
  requestUnitsConsumed: number;
}

export interface CursorReportSummary extends ProviderReportSummary {
  providerId: "cursor";
  providerLabel: "Cursor";
  totalCmdkUsages: number;
  totalComposerRequests: number;
  totalChatRequests: number;
  totalAgentRequests: number;
  totalUsageBasedReqs: number;
  /** Unique active user count estimated from userId field */
  seatCount: number;
  /** Estimated monthly cost: seats × $20 + usageBasedReqs × $0.04 */
  estimatedMonthlyCostUsd: number;
  /** Sum of `chargedCents` / 100 across all usage events (null when events feed unavailable). */
  actualCostUsd: number | null;
  /** Value of plan-included usage burned (cents → USD), as reported by /teams/spend. */
  includedSpendUsd: number | null;
  /** Aggregated token volumes from per-event `tokenUsage`. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** cacheRead / (cacheRead + input). null when no token data. */
  cacheHitRate: number | null;
  modelsUsed: string[];
  perModelBreakdown: CursorPerModelBreakdown[];
  /** Sum of `requestsCosts` across events — Business-plan request units consumed. */
  requestUnitsConsumed: number;
  /** Total event count from the events feed. */
  usageEventCount: number;
  /** Event count by `kind` (e.g. "Included in Business", "Usage Based Pricing"). */
  kindBreakdown: Record<string, number>;
  /** Epoch-millis when the current Cursor subscription cycle started. */
  subscriptionCycleStart: number | null;
  /** Fast premium requests across all team members in this cycle. */
  fastPremiumRequests: number;
}
