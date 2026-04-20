import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCodexReportSummary } from "../service";
import { persistCodexUsageReport } from "../persistence";

const sampleReport = {
  data: [
    {
      start_time: 1740787200,
      end_time: 1740873600,
      results: [
        { input_tokens: 12_000, output_tokens: 3_000, num_model_requests: 200 }
      ]
    },
    {
      start_time: 1740873600,
      end_time: 1740960000,
      results: [
        { input_tokens: 9_000, output_tokens: 2_000, num_model_requests: 140 }
      ]
    }
  ],
  has_more: false,
  next_page: null
};

const enrichedReport = {
  data: [
    {
      start_time: 1740787200,
      end_time: 1740873600,
      results: [
        {
          input_tokens: 10_000,
          input_cached_tokens: 7_000,
          input_uncached_tokens: 3_000,
          output_tokens: 2_000,
          num_model_requests: 100,
          model: "gpt-5.3-codex",
          project_id: "proj_abc"
        },
        {
          input_tokens: 5_000,
          input_cached_tokens: 1_000,
          input_uncached_tokens: 4_000,
          output_tokens: 1_500,
          num_model_requests: 50,
          model: "gpt-5.4-2026-03-05",
          project_id: "proj_abc"
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
      start_time: 1740787200,
      end_time: 1740873600,
      results: [
        { amount: { value: 1.50, currency: "usd" }, line_item: "gpt-5.3-codex, input" },
        { amount: { value: 0.20, currency: "usd" }, line_item: "gpt-5.3-codex, cached input" },
        { amount: { value: 0.50, currency: "usd" }, line_item: "gpt-5.3-codex, output" },
        { amount: { value: 2.00, currency: "usd" }, line_item: "priority | gpt-5.4-2026-03-05, input" },
        { amount: { value: 0.05, currency: "usd" }, line_item: "web search tool calls" }
      ]
    }
  ],
  has_more: false,
  next_page: null
};

describe("createCodexReportSummary", () => {
  it("sums tokens and request counts across all buckets and results", () => {
    const summary = createCodexReportSummary(sampleReport);

    expect(summary.providerId).toBe("codex");
    expect(summary.providerLabel).toBe("OpenAI Codex");
    expect(summary.inputTokens).toBe(21_000);
    expect(summary.outputTokens).toBe(5_000);
    expect(summary.requestCount).toBe(340);
    expect(summary.reportAgeLabel).toBe("28-day window");
    expect(summary.comparisonMetric).toEqual({ value: 340, label: "requests", unit: "requests" });
    expect(summary.estimatedCostUsd).toBeCloseTo(
      (21_000 / 1_000_000) * 2.5 + (5_000 / 1_000_000) * 10.0,
      6
    );
  });

  it("derives report dates from the first and last bucket timestamps", () => {
    const summary = createCodexReportSummary(sampleReport);
    expect(summary.reportStartDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.reportEndDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns null enrichment fields for legacy snapshots without cached/model data", () => {
    const summary = createCodexReportSummary(sampleReport);
    expect(summary.cacheReadTokens).toBeNull();
    expect(summary.uncachedInputTokens).toBeNull();
    expect(summary.cacheHitRate).toBeNull();
    expect(summary.modelsUsed).toEqual([]);
    expect(summary.perModelBreakdown).toEqual([]);
    expect(summary.actualCostUsd).toBeNull();
    expect(summary.unattributedCostUsd).toBeNull();
  });

  it("aggregates cached and uncached tokens from enriched snapshots", () => {
    const summary = createCodexReportSummary(enrichedReport);
    expect(summary.inputTokens).toBe(15_000);
    expect(summary.cacheReadTokens).toBe(8_000);
    expect(summary.uncachedInputTokens).toBe(7_000);
    expect(summary.cacheHitRate).toBeCloseTo(8_000 / 15_000, 6);
  });

  it("builds a per-model breakdown sorted by input tokens descending", () => {
    const summary = createCodexReportSummary(enrichedReport);
    expect(summary.modelsUsed).toEqual(["gpt-5.3-codex", "gpt-5.4-2026-03-05"]);
    expect(summary.perModelBreakdown).toHaveLength(2);
    const top = summary.perModelBreakdown[0];
    expect(top.model).toBe("gpt-5.3-codex");
    expect(top.inputTokens).toBe(10_000);
    expect(top.cachedInputTokens).toBe(7_000);
    expect(top.outputTokens).toBe(2_000);
    expect(top.requestCount).toBe(100);
  });

  it("attributes costs to models from line items and tracks unattributed spend", () => {
    const summary = createCodexReportSummary(enrichedReport, enrichedCosts);
    expect(summary.actualCostUsd).toBeCloseTo(4.25, 6);
    expect(summary.unattributedCostUsd).toBeCloseTo(0.05, 6);
    const codex = summary.perModelBreakdown.find((m) => m.model === "gpt-5.3-codex");
    expect(codex?.costUsd).toBeCloseTo(2.20, 6); // 1.50 + 0.20 + 0.50
    const gpt54 = summary.perModelBreakdown.find((m) => m.model === "gpt-5.4-2026-03-05");
    expect(gpt54?.costUsd).toBeCloseTo(2.00, 6); // priority tier prefix stripped
  });
});

describe("persistCodexUsageReport", () => {
  it("writes the report to the output path when writes are allowed", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");

    await expect(
      persistCodexUsageReport({ usage: sampleReport, outputPath, env: {} })
    ).resolves.toBe(outputPath);

    await expect(readFile(outputPath, "utf8")).resolves.toContain(
      '"input_tokens": 12000'
    );
  });

  it("blocks persistence in read-only mode", async () => {
    await expect(
      persistCodexUsageReport({
        usage: sampleReport,
        outputPath: path.join(os.tmpdir(), "should-not-write.json"),
        env: { TOKEN_REPORTING_READ_ONLY: "true" }
      })
    ).rejects.toThrow(/TOKEN_REPORTING_READ_ONLY/);
  });
});

describe("persistCodexUsageReport", () => {
  it("writes the report to the output path when writes are allowed", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");

    await expect(
      persistCodexUsageReport({ usage: sampleReport, outputPath, env: {} })
    ).resolves.toBe(outputPath);

    await expect(readFile(outputPath, "utf8")).resolves.toContain(
      '"input_tokens": 12000'
    );
  });

  it("blocks persistence in read-only mode", async () => {
    await expect(
      persistCodexUsageReport({
        usage: sampleReport,
        outputPath: path.join(os.tmpdir(), "should-not-write.json"),
        env: { TOKEN_REPORTING_READ_ONLY: "true" }
      })
    ).rejects.toThrow(/TOKEN_REPORTING_READ_ONLY/);
  });
});
