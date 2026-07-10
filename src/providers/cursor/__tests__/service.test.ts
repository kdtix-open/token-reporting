import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCursorReportSummary } from "../service";
import { persistCursorDailyUsageReport } from "../persistence";
import {
  cursorFilteredUsageEventsResponseSchema,
  cursorTeamSpendResponseSchema
} from "../types";

const sampleReport = {
  data: [
    {
      userId: "user_abc123",
      day: "2025-03-01",
      date: 1740787200000,
      email: "dev@example.com",
      cmdkUsages: 50,
      composerRequests: 100,
      chatRequests: 200,
      agentRequests: 30,
      usageBasedReqs: 10,
      subscriptionIncludedReqs: 120,
      bugbotUsages: 2
    },
    {
      userId: "user_def456",
      day: "2025-03-01",
      date: 1740787200000,
      email: "dev2@example.com",
      cmdkUsages: 20,
      composerRequests: 40,
      chatRequests: 80,
      agentRequests: 10,
      usageBasedReqs: 5,
      subscriptionIncludedReqs: 50,
      bugbotUsages: 1
    }
  ],
  period: {
    startDate: 1740787200000,
    endDate: 1743206400000
  }
};

const sampleSpend = {
  teamMemberSpend: [
    {
      userId: "user_abc123",
      name: "Dev One",
      email: "dev@example.com",
      role: "owner",
      spendCents: 0,
      includedSpendCents: 250,
      fastPremiumRequests: 12,
      monthlyLimitDollars: null,
      hardLimitOverrideDollars: 0
    },
    {
      userId: "user_def456",
      name: "Dev Two",
      email: "dev2@example.com",
      role: "member",
      spendCents: 1500, // $15.00
      includedSpendCents: 100,
      fastPremiumRequests: 3,
      monthlyLimitDollars: 50,
      hardLimitOverrideDollars: 0
    }
  ],
  subscriptionCycleStart: 1776350747000,
  totalMembers: 2
};

const sampleEvents = {
  totalUsageEventsCount: 3,
  pagination: { numPages: 1, currentPage: 1, pageSize: 100 },
  usageEvents: [
    {
      timestamp: "1741000000000",
      model: "composer-2-fast",
      kind: "Included in Business",
      maxMode: false,
      requestsCosts: 0.4,
      isTokenBasedCall: true,
      tokenUsage: {
        inputTokens: 12000,
        outputTokens: 300,
        cacheWriteTokens: 0,
        cacheReadTokens: 5000,
        totalCents: 1.4
      },
      userEmail: "dev@example.com",
      cursorTokenFee: 0.5,
      isChargeable: true,
      isHeadless: false,
      chargedCents: 200 // $2.00
    },
    {
      timestamp: "1741000000000",
      model: "composer-2-fast",
      kind: "Included in Business",
      maxMode: false,
      requestsCosts: 0.6,
      isTokenBasedCall: true,
      tokenUsage: {
        inputTokens: 8000,
        outputTokens: 200,
        cacheWriteTokens: 0,
        cacheReadTokens: 15000,
        totalCents: 0.9
      },
      userEmail: "dev@example.com",
      cursorTokenFee: 0.3,
      isChargeable: true,
      isHeadless: false,
      chargedCents: 100 // $1.00
    },
    {
      timestamp: "1741086400000",
      model: "claude-sonnet-4-6",
      kind: "Usage Based Pricing",
      maxMode: true,
      requestsCosts: 0,
      isTokenBasedCall: true,
      tokenUsage: {
        inputTokens: 5000,
        outputTokens: 1000,
        cacheWriteTokens: 200,
        cacheReadTokens: 0,
        totalCents: 50
      },
      userEmail: "dev2@example.com",
      cursorTokenFee: 0,
      isChargeable: true,
      isHeadless: false,
      chargedCents: 5000 // $50.00
    }
  ],
  period: { startDate: 1740787200000, endDate: 1743206400000 }
};

describe("createCursorReportSummary", () => {
  it("aggregates usage across all user-day rows (legacy daily-only input)", () => {
    const summary = createCursorReportSummary(sampleReport);

    expect(summary.providerId).toBe("cursor");
    expect(summary.providerLabel).toBe("Cursor");
    expect(summary.totalCmdkUsages).toBe(70);
    expect(summary.totalComposerRequests).toBe(140);
    expect(summary.totalChatRequests).toBe(280);
    expect(summary.totalAgentRequests).toBe(40);
    expect(summary.totalUsageBasedReqs).toBe(15);
    expect(summary.reportAgeLabel).toBe("28-day window");
    expect(summary.comparisonMetric).toEqual({ value: 530, label: "requests", unit: "requests" });
    // Legacy input → enriched fields default to nulls / zeros.
    expect(summary.actualCostUsd).toBeNull();
    expect(summary.includedSpendUsd).toBeNull();
    expect(summary.usageEventCount).toBe(0);
    expect(summary.modelsUsed).toEqual([]);
  });

  it("derives reportStartDay and reportEndDay from the period", () => {
    const summary = createCursorReportSummary(sampleReport);
    expect(summary.reportStartDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(summary.reportEndDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("aggregates per-member spend (cents → USD) when the spend feed is provided", () => {
    const spend = cursorTeamSpendResponseSchema.parse(sampleSpend);
    const summary = createCursorReportSummary({ daily: sampleReport, spend });

    // 0 + 1500 cents = $15.00
    // includedSpendUsd: (250 + 100) cents = $3.50
    expect(summary.includedSpendUsd).toBeCloseTo(3.5, 6);
    expect(summary.fastPremiumRequests).toBe(15);
    expect(summary.subscriptionCycleStart).toBe(1776350747000);
  });

  it("aggregates per-event usage and prefers chargedCents (cents → USD) for actual cost", () => {
    const spend = cursorTeamSpendResponseSchema.parse(sampleSpend);
    const events = cursorFilteredUsageEventsResponseSchema.parse(sampleEvents);
    const summary = createCursorReportSummary({ daily: sampleReport, spend, events });

    // Token aggregates
    expect(summary.inputTokens).toBe(12000 + 8000 + 5000);
    expect(summary.outputTokens).toBe(300 + 200 + 1000);
    expect(summary.cacheReadTokens).toBe(5000 + 15000);
    expect(summary.cacheWriteTokens).toBe(200);
    // Cache hit rate: 20000 / (20000 + 25000)
    expect(summary.cacheHitRate).toBeCloseTo(20000 / 45000, 6);

    // Actual cost from events: (200 + 100 + 5000) cents = $53.00 (overrides spend feed's $15)
    expect(summary.actualCostUsd).toBeCloseTo(53.0, 6);

    // Per-model breakdown — composer-2-fast first (more input volume)
    const composer = summary.perModelBreakdown.find((r) => r.model === "composer-2-fast");
    const sonnet = summary.perModelBreakdown.find((r) => r.model === "claude-sonnet-4-6");
    expect(composer?.eventCount).toBe(2);
    expect(composer?.chargedCostUsd).toBeCloseTo(3.0, 6); // 300 cents
    expect(composer?.requestUnitsConsumed).toBeCloseTo(1.0, 6);
    expect(sonnet?.eventCount).toBe(1);
    expect(sonnet?.chargedCostUsd).toBeCloseTo(50.0, 6);

    // Kind breakdown
    expect(summary.kindBreakdown).toEqual({
      "Included in Business": 2,
      "Usage Based Pricing": 1
    });
    expect(summary.usageEventCount).toBe(3);
    expect(summary.requestUnitsConsumed).toBeCloseTo(1.0, 6);

    // Spend projection should now be sourced from actual events.
    expect(summary.spendProjection.costSource).toBe("actual");
  });
});

describe("persistCursorDailyUsageReport", () => {
  it("writes the report wrapped under `daily` when writes are allowed", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");

    await expect(
      persistCursorDailyUsageReport({
        report: sampleReport,
        outputPath,
        env: {}
      })
    ).resolves.toBe(outputPath);

    const written = await readFile(outputPath, "utf8");
    expect(written).toContain('"cmdkUsages": 50');
    expect(written).toContain('"daily"');
    const snapshot = JSON.parse(written) as { generatedAt?: string };
    expect(Date.parse(snapshot.generatedAt ?? "")).not.toBeNaN();
  });

  it("includes spend and events when supplied", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");
    const spend = cursorTeamSpendResponseSchema.parse(sampleSpend);
    const events = cursorFilteredUsageEventsResponseSchema.parse(sampleEvents);

    await persistCursorDailyUsageReport({
      report: sampleReport,
      spend,
      events,
      outputPath,
      env: {}
    });

    const written = await readFile(outputPath, "utf8");
    expect(written).toContain('"spend"');
    expect(written).toContain('"events"');
    expect(written).toContain('"composer-2-fast"');
    expect(written).not.toContain("user_abc123");
    expect(written).not.toContain("dev@example.com");
    expect(written).not.toContain("Dev One");
    expect(written).toContain("user_redacted_");
    expect(written).toContain("@redacted.local");
    const accumulated = await readFile(path.join(tempRoot, "accumulated-metadata.json"), "utf8");
    expect(accumulated).not.toContain("user_def456");
    expect(accumulated).not.toContain("dev2@example.com");
    expect(accumulated).not.toContain("Dev Two");
  });

  it("keeps accumulated redacted identities stable across repeated refreshes", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");
    const spend = cursorTeamSpendResponseSchema.parse(sampleSpend);
    const events = cursorFilteredUsageEventsResponseSchema.parse(sampleEvents);

    for (let index = 0; index < 2; index += 1) {
      await persistCursorDailyUsageReport({
        report: sampleReport,
        spend,
        events,
        outputPath,
        env: {}
      });
    }

    const accumulated = JSON.parse(
      await readFile(path.join(tempRoot, "accumulated-metadata.json"), "utf8")
    ) as {
      daily: { data: Array<{ userId: string }> };
      events: { usageEvents: Array<{ userEmail: string }> };
      spend: { teamMemberSpend: Array<{ email: string; name: string; userId: string }> };
    };

    expect(accumulated.daily.data).toHaveLength(2);
    expect(accumulated.events.usageEvents).toHaveLength(3);
    expect(accumulated.spend.teamMemberSpend).toHaveLength(2);
    expect(accumulated.daily.data.map((item) => item.userId)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^user_redacted_[a-f0-9]{12}$/)])
    );
    expect(accumulated.events.usageEvents.map((event) => event.userEmail)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^redacted-[a-f0-9]{12}@redacted\.local$/)])
    );
    expect(accumulated.spend.teamMemberSpend.map((item) => item.name)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^Redacted user [a-f0-9]{12}$/)])
    );
  });

  it("blocks persistence in read-only mode", async () => {
    await expect(
      persistCursorDailyUsageReport({
        report: sampleReport,
        outputPath: path.join(os.tmpdir(), "should-not-write.json"),
        env: { TOKEN_REPORTING_READ_ONLY: "true" }
      })
    ).rejects.toThrow(/TOKEN_REPORTING_READ_ONLY/);
  });
});
