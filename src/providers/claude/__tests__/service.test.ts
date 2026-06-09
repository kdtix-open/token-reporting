import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createClaudeReportSummary } from "../service";
import { persistClaudeUsageReport } from "../persistence";
import { claudeCostsReportSchema } from "../types";

const sampleReport = {
  data: [
    {
      starting_at: "2025-03-01T00:00:00Z",
      ending_at: "2025-03-02T00:00:00Z",
      results: [
        {
          uncached_input_tokens: 10_000,
          cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 500 },
          cache_read_input_tokens: 1_200,
          output_tokens: 2_500
        }
      ]
    },
    {
      starting_at: "2025-03-02T00:00:00Z",
      ending_at: "2025-03-03T00:00:00Z",
      results: [
        {
          uncached_input_tokens: 8_000,
          cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 200 },
          cache_read_input_tokens: 900,
          output_tokens: 1_800
        }
      ]
    }
  ],
  has_more: false,
  next_page: null
};

const enrichedReport = {
  data: [
    {
      starting_at: "2026-04-15T00:00:00Z",
      ending_at: "2026-04-16T00:00:00Z",
      results: [
        {
          uncached_input_tokens: 4_000,
          cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 200_000 },
          cache_read_input_tokens: 800_000,
          output_tokens: 25_000,
          server_tool_use: { web_search_requests: 3 },
          model: "claude-sonnet-4-6",
          service_tier: "standard"
        },
        {
          uncached_input_tokens: 1_000,
          cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 50_000 },
          cache_read_input_tokens: 200_000,
          output_tokens: 10_000,
          server_tool_use: { web_search_requests: 0 },
          model: "claude-haiku-4-5-20251001",
          service_tier: "standard"
        }
      ]
    }
  ],
  has_more: false,
  next_page: null
};

const enrichedCosts = {
  data: [
    {
      starting_at: "2026-04-15T00:00:00Z",
      ending_at: "2026-04-16T00:00:00Z",
      results: [
        {
          currency: "USD",
          amount: "0.012",
          model: "claude-sonnet-4-6",
          token_type: "uncached_input_tokens",
          description: "Claude Sonnet 4.6 Usage - Input Tokens"
        },
        {
          currency: "USD",
          amount: "0.24",
          model: "claude-sonnet-4-6",
          token_type: "cache_read_input_tokens",
          description: "Claude Sonnet 4.6 Usage - Input Tokens, Cache Hit"
        },
        {
          currency: "USD",
          amount: "0.05",
          model: "claude-haiku-4-5-20251001",
          token_type: "uncached_input_tokens",
          description: "Claude Haiku 4.5 Usage - Input Tokens"
        },
        {
          currency: "USD",
          amount: "0.01",
          model: null,
          token_type: null,
          description: "Web search tool usage"
        }
      ]
    }
  ],
  has_more: false,
  next_page: null
};

describe("createClaudeReportSummary", () => {
  it("sums token counts across all daily buckets", () => {
    const summary = createClaudeReportSummary(sampleReport);

    expect(summary.providerId).toBe("claude");
    expect(summary.providerLabel).toBe("Claude");
    expect(summary.inputTokens).toBe(18_000);
    expect(summary.outputTokens).toBe(4_300);
    expect(summary.cacheCreationTokens).toBe(700);
    expect(summary.cacheReadTokens).toBe(2_100);
    expect(summary.reportAgeLabel).toBe("28-day window");
    expect(summary.comparisonMetric).toEqual({ value: 4_300, label: "output tokens", unit: "tokens" });
    expect(summary.estimatedCostUsd).toBeCloseTo(
      (18_000 / 1_000_000) * 3.0 +
        (4_300 / 1_000_000) * 15.0 +
        (2_100 / 1_000_000) * 0.3 +
        (700 / 1_000_000) * 3.75,
      6
    );
  });

  it("derives report dates from the first and last bucket timestamps", () => {
    const summary = createClaudeReportSummary(sampleReport);
    expect(summary.reportStartDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.reportEndDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns null/empty enrichment fields when costs and models are absent", () => {
    const summary = createClaudeReportSummary(sampleReport);
    expect(summary.actualCostUsd).toBeNull();
    expect(summary.unattributedCostUsd).toBeNull();
    expect(summary.modelsUsed).toEqual([]);
    expect(summary.perModelBreakdown).toEqual([]);
    expect(summary.webSearchRequests).toBe(0);
    // Cache hit rate is non-null because there are tokens in the input pool.
    expect(summary.cacheHitRate).toBeCloseTo(2_100 / (18_000 + 2_100), 6);
  });

  it("aggregates per-model breakdown from enriched usage results", () => {
    const summary = createClaudeReportSummary(enrichedReport);
    expect(summary.modelsUsed).toEqual([
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-6"
    ]);
    expect(summary.webSearchRequests).toBe(3);
    expect(summary.cacheHitRate).toBeCloseTo(1_000_000 / (5_000 + 1_000_000), 6);

    const sonnet = summary.perModelBreakdown[0];
    expect(sonnet.model).toBe("claude-sonnet-4-6"); // larger volume → first
    expect(sonnet.uncachedInputTokens).toBe(4_000);
    expect(sonnet.cacheReadTokens).toBe(800_000);
    expect(sonnet.cacheCreationTokens).toBe(200_000);
    expect(sonnet.outputTokens).toBe(25_000);
  });

  it("attributes actual costs to models and tracks unattributed spend", () => {
    // Costs go through the zod schema in production (which coerces stringly-typed amounts).
    const parsedCosts = claudeCostsReportSchema.parse(enrichedCosts);
    const summary = createClaudeReportSummary(enrichedReport, parsedCosts);
    // Anthropic returns `amount` in cents → divisor of 1/100 applied in service.
    // Raw fixture sums to 0.312 cents → $0.00312 USD.
    expect(summary.actualCostUsd).toBeCloseTo(0.00312, 8);
    expect(summary.unattributedCostUsd).toBeCloseTo(0.0001, 8);

    const sonnet = summary.perModelBreakdown.find((m) => m.model === "claude-sonnet-4-6");
    expect(sonnet?.costUsd).toBeCloseTo(0.00252, 8); // (0.012 + 0.24) / 100
    const haiku = summary.perModelBreakdown.find(
      (m) => m.model === "claude-haiku-4-5-20251001"
    );
    expect(haiku?.costUsd).toBeCloseTo(0.0005, 8); // 0.05 / 100

    // Spend projection should now use actual costs.
    expect(summary.spendProjection.costSource).toBe("actual");
  });
});

describe("persistClaudeUsageReport", () => {
  it("writes the report to the output path when writes are allowed", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");

    await expect(
      persistClaudeUsageReport({ report: sampleReport, outputPath, env: {} })
    ).resolves.toBe(outputPath);

    // New snapshot shape wraps the usage report under `usage`.
    await expect(readFile(outputPath, "utf8")).resolves.toContain(
      '"uncached_input_tokens": 10000'
    );
    await expect(readFile(outputPath, "utf8")).resolves.toContain('"usage"');
    const snapshot = JSON.parse(await readFile(outputPath, "utf8")) as {
      generatedAt?: string;
    };
    expect(Date.parse(snapshot.generatedAt ?? "")).not.toBeNaN();
  });

  it("blocks persistence in read-only mode", async () => {
    await expect(
      persistClaudeUsageReport({
        report: sampleReport,
        outputPath: path.join(os.tmpdir(), "should-not-write.json"),
        env: { TOKEN_REPORTING_READ_ONLY: "true" }
      })
    ).rejects.toThrow(/TOKEN_REPORTING_READ_ONLY/);
  });
});
