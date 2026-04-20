import { describe, expect, it } from "vitest";

import { createClaudeCodeReportSummary } from "../service";
import type { ClaudeCodeSnapshot } from "../types";

function makeSnapshot(
  overrides: Partial<ClaudeCodeSnapshot> = {}
): ClaudeCodeSnapshot {
  return {
    generatedAt: "2026-04-19T00:00:00Z",
    monthlySeatCost: 200,
    sessionCount: 5,
    modelsUsed: ["claude-opus-4-6"],
    dailyBuckets: [],
    ...overrides
  };
}

describe("createClaudeCodeReportSummary", () => {
  it("returns zero totals for empty buckets", () => {
    const summary = createClaudeCodeReportSummary(makeSnapshot());

    expect(summary.providerId).toBe("claude-code");
    expect(summary.providerLabel).toBe("Claude Code");
    expect(summary.requestCount).toBe(0);
    expect(summary.inputTokens).toBe(0);
    expect(summary.outputTokens).toBe(0);
    expect(summary.cacheHitRate).toBeNull();
    expect(summary.reportAgeLabel).toBe("no data");
  });

  it("aggregates daily buckets into totals", () => {
    const summary = createClaudeCodeReportSummary(
      makeSnapshot({
        dailyBuckets: [
          {
            date: "2026-04-15",
            inputTokens: 1_000,
            outputTokens: 500,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 200,
            requestCount: 10,
            webSearchRequests: 2,
            webFetchRequests: 1,
            models: {
              "claude-opus-4-6": {
                inputTokens: 1_000,
                outputTokens: 500,
                cacheReadTokens: 3_000,
                cacheCreationTokens: 200,
                requestCount: 10
              }
            }
          },
          {
            date: "2026-04-16",
            inputTokens: 2_000,
            outputTokens: 800,
            cacheReadTokens: 5_000,
            cacheCreationTokens: 100,
            requestCount: 15,
            webSearchRequests: 0,
            webFetchRequests: 3,
            models: {
              "claude-opus-4-6": {
                inputTokens: 2_000,
                outputTokens: 800,
                cacheReadTokens: 5_000,
                cacheCreationTokens: 100,
                requestCount: 15
              }
            }
          }
        ]
      })
    );

    expect(summary.inputTokens).toBe(3_000);
    expect(summary.outputTokens).toBe(1_300);
    expect(summary.cacheReadTokens).toBe(8_000);
    expect(summary.cacheCreationTokens).toBe(300);
    expect(summary.requestCount).toBe(25);
    expect(summary.webSearchRequests).toBe(2);
    expect(summary.webFetchRequests).toBe(4);
    expect(summary.reportStartDay).toBe("2026-04-15");
    expect(summary.reportEndDay).toBe("2026-04-16");
    expect(summary.reportAgeLabel).toBe("2-day window");
  });

  it("computes cache hit rate correctly", () => {
    const summary = createClaudeCodeReportSummary(
      makeSnapshot({
        dailyBuckets: [
          {
            date: "2026-04-15",
            inputTokens: 2_000,
            outputTokens: 500,
            cacheReadTokens: 8_000,
            cacheCreationTokens: 0,
            requestCount: 5,
            webSearchRequests: 0,
            webFetchRequests: 0,
            models: {}
          }
        ]
      })
    );

    // cacheHitRate = 8000 / (2000 + 8000) = 0.8
    expect(summary.cacheHitRate).toBeCloseTo(0.8);
  });

  it("uses seat-based cost projection", () => {
    const summary = createClaudeCodeReportSummary(
      makeSnapshot({
        monthlySeatCost: 100,
        dailyBuckets: [
          {
            date: "2026-04-15",
            inputTokens: 1_000,
            outputTokens: 500,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            requestCount: 5,
            webSearchRequests: 0,
            webFetchRequests: 0,
            models: {}
          }
        ]
      })
    );

    expect(summary.spendProjection.costSource).toBe("seat_based");
    expect(summary.monthlySeatCost).toBe(100);
    // April has 30 days, so daily cost = 100/30
    expect(summary.spendProjection.dailyBreakdown[0].costUsd).toBeCloseTo(
      100 / 30
    );
  });

  it("sets comparison metric to total requests", () => {
    const summary = createClaudeCodeReportSummary(
      makeSnapshot({
        dailyBuckets: [
          {
            date: "2026-04-15",
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            requestCount: 42,
            webSearchRequests: 0,
            webFetchRequests: 0,
            models: {}
          }
        ]
      })
    );

    expect(summary.comparisonMetric).toEqual({
      value: 42,
      label: "requests",
      unit: "requests"
    });
  });

  it("aggregates per-model breakdown across days", () => {
    const summary = createClaudeCodeReportSummary(
      makeSnapshot({
        dailyBuckets: [
          {
            date: "2026-04-15",
            inputTokens: 1_000,
            outputTokens: 500,
            cacheReadTokens: 3_000,
            cacheCreationTokens: 0,
            requestCount: 5,
            webSearchRequests: 0,
            webFetchRequests: 0,
            models: {
              "claude-opus-4-6": {
                inputTokens: 800,
                outputTokens: 400,
                cacheReadTokens: 2_500,
                cacheCreationTokens: 0,
                requestCount: 3
              },
              "claude-sonnet-4-6": {
                inputTokens: 200,
                outputTokens: 100,
                cacheReadTokens: 500,
                cacheCreationTokens: 0,
                requestCount: 2
              }
            }
          },
          {
            date: "2026-04-16",
            inputTokens: 500,
            outputTokens: 200,
            cacheReadTokens: 1_000,
            cacheCreationTokens: 0,
            requestCount: 3,
            webSearchRequests: 0,
            webFetchRequests: 0,
            models: {
              "claude-opus-4-6": {
                inputTokens: 500,
                outputTokens: 200,
                cacheReadTokens: 1_000,
                cacheCreationTokens: 0,
                requestCount: 3
              }
            }
          }
        ]
      })
    );

    expect(summary.perModelBreakdown).toHaveLength(2);
    // Sorted by input + cacheRead descending
    expect(summary.perModelBreakdown[0].model).toBe("claude-opus-4-6");
    expect(summary.perModelBreakdown[0].inputTokens).toBe(1_300);
    expect(summary.perModelBreakdown[0].cacheReadTokens).toBe(3_500);
    expect(summary.perModelBreakdown[0].requestCount).toBe(6);
    expect(summary.perModelBreakdown[1].model).toBe("claude-sonnet-4-6");
    expect(summary.perModelBreakdown[1].requestCount).toBe(2);
  });
});
