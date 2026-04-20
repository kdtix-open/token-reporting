import { describe, expect, it } from "vitest";

import { buildLocalModelReport } from "../localModelReport";
import type { ProviderReportSummary } from "../types";

const zeroProjection = {
  costSource: "actual" as const,
  trend: "insufficient_data" as const,
  windowDays: 28,
  totalUsd: 0,
  dailyAvgUsd: 0,
  projectedMonthlyUsd: 0,
  projectedAnnualUsd: 0,
  trendedMonthlyUsd: null,
  trendedAnnualUsd: null,
  dailyBreakdown: [],
  note: null
};

const codexSummary: ProviderReportSummary = {
  providerId: "codex",
  providerLabel: "OpenAI Codex",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 1000, label: "requests", unit: "requests" },
  spendProjection: zeroProjection,
  // extra fields (duck-typed)
  inputTokens: 210_000,
  outputTokens: 50_000,
  requestCount: 1_000,
  estimatedCostUsd: 0.65
} as unknown as ProviderReportSummary;

const claudeSummary: ProviderReportSummary = {
  providerId: "claude",
  providerLabel: "Claude",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 12_300_000, label: "output tokens", unit: "tokens" },
  spendProjection: zeroProjection,
  inputTokens: 48_500_000,
  outputTokens: 12_300_000,
  cacheReadTokens: 9_800_000,
  cacheCreationTokens: 2_100_000,
  estimatedCostUsd: 320
} as unknown as ProviderReportSummary;

const cursorSummary: ProviderReportSummary = {
  providerId: "cursor",
  providerLabel: "Cursor",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: 11_450, label: "requests", unit: "requests" },
  spendProjection: zeroProjection,
  totalCmdkUsages: 1_420,
  totalComposerRequests: 3_850,
  totalChatRequests: 5_200,
  totalAgentRequests: 980,
  totalUsageBasedReqs: 210
} as unknown as ProviderReportSummary;

const copilotSummary: ProviderReportSummary = {
  providerId: "github-copilot",
  providerLabel: "GitHub Copilot",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: null, label: "interactions", unit: "requests" },
  spendProjection: zeroProjection,
  totalInteractions: null,
  billedSeats: 5
} as unknown as ProviderReportSummary;

describe("buildLocalModelReport", () => {
  it("returns empty report for summaries with no token data", () => {
    const report = buildLocalModelReport([cursorSummary, copilotSummary]);

    expect(report.tokenObservedProviders).toHaveLength(0);
    expect(report.totalInputTokens).toBe(0);
    expect(report.totalOutputTokens).toBe(0);
    expect(report.totalPureComputeTokens).toBe(0);
    expect(report.tokenObservedRequests).toBeNull();
    expect(report.avgTokensPerObservedRequest).toBeNull();
    expect(report.estimatedContextWindowNeeded).toBeNull();
    expect(report.contextConfidence).toBe("insufficient_data");
    expect(report.profiles).toHaveLength(4);
  });

  it("correctly aggregates Codex token data only", () => {
    const report = buildLocalModelReport([codexSummary]);

    expect(report.tokenObservedProviders).toHaveLength(1);
    expect(report.tokenObservedProviders[0].providerId).toBe("codex");
    expect(report.totalInputTokens).toBe(210_000);
    expect(report.totalOutputTokens).toBe(50_000);
    expect(report.totalCacheReadTokens).toBe(0);
    expect(report.totalCacheCreationTokens).toBe(0);
    expect(report.totalPureComputeTokens).toBe(260_000);
    expect(report.tokenObservedRequests).toBe(1_000);
    expect(report.avgTokensPerObservedRequest).toBe(260);
    expect(report.contextConfidence).toBe("low");
  });

  it("uses empirical p99 from local distribution snapshot when present (high confidence)", () => {
    const distribution = {
      generatedAt: "2025-01-01T00:00:00.000Z",
      sources: [
        {
          source: "codex" as const,
          sampleCount: 100,
          contextTokens: { mean: 50_000, p50: 40_000, p95: 200_000, p99: 300_000, max: 350_000 },
          totalTokens: { mean: 50_500, p50: 40_500, p95: 201_000, p99: 301_000, max: 351_000 },
          observedContextWindows: [200_000],
          modelsSeen: ["gpt-5"]
        }
      ],
      combined: {
        sampleCount: 100,
        mean: 50_000,
        p50: 40_000,
        p95: 200_000,
        p99: 300_000,
        max: 350_000
      }
    };
    const report = buildLocalModelReport([codexSummary], distribution);
    expect(report.contextConfidence).toBe("high");
    // p99=300K rounds up to next standard size (500K)
    expect(report.estimatedContextWindowNeeded).toBe(500_000);
    expect(report.localDistribution).toBe(distribution);
  });

  it("sums Codex + Claude tokens and keeps cache tokens separate", () => {
    const report = buildLocalModelReport([codexSummary, claudeSummary]);

    expect(report.tokenObservedProviders).toHaveLength(2);
    expect(report.totalInputTokens).toBe(210_000 + 48_500_000);
    expect(report.totalOutputTokens).toBe(50_000 + 12_300_000);
    expect(report.totalCacheReadTokens).toBe(9_800_000);
    expect(report.totalCacheCreationTokens).toBe(2_100_000);
    // pure compute = input + output + cacheCreation (NOT cacheRead)
    expect(report.totalPureComputeTokens).toBe(
      210_000 + 48_500_000 + 50_000 + 12_300_000 + 2_100_000
    );
  });

  it("does NOT mix Cursor requests into avgTokensPerObservedRequest", () => {
    const reportWithCursor = buildLocalModelReport([codexSummary, cursorSummary]);
    const reportCodexOnly = buildLocalModelReport([codexSummary]);

    // avg should be identical — Cursor has no tokens so should not affect denominator
    expect(reportWithCursor.avgTokensPerObservedRequest).toBe(
      reportCodexOnly.avgTokensPerObservedRequest
    );
    // but Cursor should appear as request-only provider
    expect(reportWithCursor.requestOnlyProviders).toHaveLength(1);
    expect(reportWithCursor.requestOnlyProviders[0].providerId).toBe("cursor");
  });

  it("places Cursor in requestOnlyProviders with summed request count", () => {
    const report = buildLocalModelReport([cursorSummary]);

    expect(report.requestOnlyProviders).toHaveLength(1);
    const cursor = report.requestOnlyProviders[0];
    expect(cursor.requestCount).toBe(1_420 + 3_850 + 5_200 + 980); // cmdk+composer+chat+agent
  });

  it("rounds estimatedContextWindowNeeded up to the next standard size", () => {
    // Codex: 260 avg tokens/request × 2.5 = 650 → next standard = 4096
    const report = buildLocalModelReport([codexSummary]);
    expect(report.estimatedContextWindowNeeded).toBe(4_096);
  });

  it("computes window days from report dates", () => {
    const report = buildLocalModelReport([codexSummary]); // 2026-03-01 to 2026-03-28 = 28 days
    expect(report.windowDays).toBe(28);
  });

  it("all 3 model profiles are present with expected tiers", () => {
    const report = buildLocalModelReport([codexSummary]);
    const tiers = report.profiles.map((p) => p.tier);
    expect(tiers).toContain("min");
    expect(tiers).toContain("recommended");
    expect(tiers).toContain("enterprise");
  });

  it("marks all profiles as contextFits=true when context window is unknown", () => {
    // No request count → contextConfidence = insufficient_data → all fit
    const report = buildLocalModelReport([claudeSummary]); // Claude has no requestCount
    expect(report.estimatedContextWindowNeeded).toBeNull();
    expect(report.profiles.every((p) => p.contextFits)).toBe(true);
  });

  it("marks throughputFits correctly against requiredTokensPerSec", () => {
    const report = buildLocalModelReport([codexSummary]);
    // 260_000 tokens / 28 days / (8 × 3600) ≈ 0.032 tokens/sec — all models fit
    expect(report.requiredTokensPerSec).toBeCloseTo(260_000 / 28 / 28_800, 3);
    expect(report.profiles.every((p) => p.throughputFits)).toBe(true);
  });
});
