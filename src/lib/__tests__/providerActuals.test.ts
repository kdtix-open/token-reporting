import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { providerRegistry } from "../../providers/registry";
import { createDynamicIntegrationContractHandler } from "../integrationContractDynamic";
import { buildProviderActualsUsage } from "../providerActuals";
import type { ProviderReportSummary } from "../types";

const observedAt = "2026-06-08T12:00:00.000Z";
const generatedAt = "2026-06-08T10:00:00.000Z";
const roots: string[] = [];

function summary(fields: Record<string, unknown> = {}): ProviderReportSummary {
  return {
    providerId: "codex", providerLabel: "OpenAI Codex",
    reportStartDay: "2026-06-01", reportEndDay: "2026-06-08", reportAgeLabel: "snapshot",
    snapshotGeneratedAt: generatedAt,
    comparisonMetric: { value: 3, unit: "requests", label: "requests" },
    spendProjection: {
      totalUsd: 4.25, costSource: "actual", dailyAvgUsd: 4.25, dailyBreakdown: [],
      projectedAnnualUsd: 0, projectedMonthlyUsd: 0, trendedAnnualUsd: null,
      trendedMonthlyUsd: null, trend: "insufficient_data", windowDays: 7
    },
    ...fields
  } as ProviderReportSummary;
}

function snapshot(inputTokens = 1000) {
  return {
    generatedAt,
    usage: { has_more: false, next_page: null, data: [{
      start_time: 1780272000, end_time: 1780358400,
      results: [{ input_tokens: inputTokens, output_tokens: 100,
        input_cached_tokens: 400, num_model_requests: 3 }]
    }] },
    costs: { has_more: false, next_page: null, data: [{
      start_time: 1780272000, end_time: 1780358400,
      results: [{ amount: { value: 4.25, currency: "usd" } }]
    }] }
  };
}

function nativeSnapshot(providerId: "codex" | "claude", results: unknown[], costResults?: unknown[]) {
  const bucket = providerId === "codex"
    ? { start_time: 1780272000, end_time: 1780358400 }
    : { starting_at: "2026-06-01T00:00:00Z", ending_at: "2026-06-02T00:00:00Z" };
  return { generatedAt,
    usage: { data: [{ ...bucket, results }], has_more: false, next_page: null },
    ...(costResults === undefined ? {} : {
      costs: { data: [{ ...bucket, results: costResults }], has_more: false, next_page: null }
    }) };
}

async function nativeUsage(providerId: "codex" | "claude", raw: unknown) {
  const root = await dataRoot(raw, undefined, providerId);
  const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
  return (await handler({ method: "GET", path: `/api/providers/${providerId}/usage` })).body;
}

async function dataRoot(accumulated?: unknown, latest?: unknown, providerId = "codex"): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "token-reporting-actuals-"));
  roots.push(root);
  await mkdir(path.join(root, providerId));
  for (const [kind, raw] of [["accumulated", accumulated], ["latest", latest]] as const) {
    if (raw !== undefined) {
      await writeFile(path.join(root, providerId, `${kind}-metadata.json`),
        typeof raw === "string" ? raw : JSON.stringify(raw));
    }
  }
  return root;
}

async function usageFor(value: ProviderReportSummary) {
  const handler = createDynamicIntegrationContractHandler({
    loadSummaries: async () => [value], now: () => new Date(observedAt)
  });
  return (await handler({ method: "GET", path: "/api/providers/codex/usage" })).body;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("providerActuals", () => {
  it.each([
    { providerId: "github-copilot", start: "2026-02-30", end: "2026-06-02" },
    { providerId: "github-copilot", start: "2026-06-02", end: "2026-06-01" },
    { providerId: "claude-code", start: "2026-02-30", end: "2026-06-02" },
    { providerId: "claude-code", start: "2026-06-02", end: "2026-06-01" },
    { providerId: "cursor", start: "2026-06-02", end: "2026-06-01" }
  ])("Usage_InvalidNativeReportWindow_ReturnsUnknownBoundaries", async ({ providerId, start, end }) => {
    const raw = providerId === "github-copilot"
      ? { generatedAt, download_links: [], report_start_day: start, report_end_day: end }
      : providerId === "cursor"
        ? { generatedAt, daily: { data: [], period: { startDate: Date.parse(start), endDate: Date.parse(end) } } }
        : { generatedAt, monthlySeatCost: 20, sessionCount: 0, modelsUsed: [],
          dailyBuckets: [start, end].map((date) => ({ date, inputTokens: 0, outputTokens: 0,
            cacheReadTokens: 0, cacheCreationTokens: 0, requestCount: 0,
            webSearchRequests: 0, webFetchRequests: 0, models: {} })) };
    const root = await dataRoot(raw, undefined, providerId);
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: `/api/providers/${providerId}/usage` })).body)
      .toMatchObject({ origin: "accumulated", reportStartDay: null, reportEndDay: null });
  });

  it("Usage_ClaudeCodeNegativeRows_CannotCancelIntoPositiveObservations", async () => {
    const root = await dataRoot({ generatedAt, monthlySeatCost: 20, sessionCount: 0, modelsUsed: [],
      dailyBuckets: [100, -1].map((count, index) => ({ date: `2026-06-0${index + 1}`,
        inputTokens: count, requestCount: count, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, models: {} }))
    }, undefined, "claude-code");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/claude-code/usage" })).body)
      .toMatchObject({ origin: "accumulated", totals: { inputTokens: null, requestsCount: null,
        observedMetricValue: null, totalTokens: null, tokenComponentsComplete: false } });
  });

  it.each(["github-copilot", "claude-code"])(
    "Usage_NegativeLegacySeatCost_%sIsNotAnActualCredit", async (providerId) => {
      const raw = providerId === "github-copilot"
        ? { generatedAt, download_links: [], report_start_day: "2026-06-01", report_end_day: "2026-06-28",
          billing_seats: { total_seats: -1, plan: "enterprise" } }
        : { generatedAt, monthlySeatCost: -20, sessionCount: 0, modelsUsed: [], dailyBuckets: [{
          date: "2026-06-01", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
          cacheCreationTokens: 0, requestCount: 0, webSearchRequests: 0, webFetchRequests: 0, models: {}
        }] };
      const root = await dataRoot(raw, undefined, providerId);
      const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
      expect((await handler({ method: "GET", path: `/api/providers/${providerId}/usage` })).body)
        .toMatchObject({ origin: "accumulated", costSource: "seat_based", totals: { totalCostUsd: null } });
    }
  );

  it.each(["codex", "claude"] as const)(
    "Usage_NativeCostCurrency_%sRequiresExplicitUsdAndObservedAmount", async (providerId) => {
      for (const currency of [undefined, "EUR", "", "usd", "USD"]) {
        const result = providerId === "codex"
          ? { amount: { value: "100", ...(currency === undefined ? {} : { currency }) } }
          : { amount: "100", ...(currency === undefined ? {} : { currency }) };
        const usd = currency?.toLowerCase() === "usd";
        expect(await nativeUsage(providerId, nativeSnapshot(providerId, [], [result])))
          .toMatchObject({ totals: { totalCostUsd: usd ? (providerId === "codex" ? 100 : 1) : null } });
      }
      for (const amount of [null, "", "  ", false]) {
        const result = providerId === "codex"
          ? { amount: { value: amount, currency: "usd" } } : { amount, currency: "USD" };
        expect(await nativeUsage(providerId, nativeSnapshot(providerId, [], [result])))
          .toMatchObject({ totals: { totalCostUsd: null } });
      }
    }
  );

  it.each([
    { source: { events: { usageEvents: [{ timestamp: "1780272000000" }] } }, expected: null },
    { source: { events: { usageEvents: [] } }, expected: null },
    { source: { events: { usageEvents: [{ timestamp: "1780272000000", chargedCents: 0 }] } }, expected: 0 },
    { source: { events: { usageEvents: [{ timestamp: "1780272000000", chargedCents: 1500 }] } }, expected: 15 },
    { source: { events: { usageEvents: [{ timestamp: "1780272000000", chargedCents: 0 },
      { timestamp: "1780272000001" }] } }, expected: null },
    { source: { spend: { teamMemberSpend: [{ userId: "fixture-user" }] } }, expected: null },
    { source: { spend: { teamMemberSpend: [] } }, expected: null },
    { source: { spend: { teamMemberSpend: [{ userId: "fixture-user", spendCents: 0 }] } }, expected: 0 },
    { source: { spend: { teamMemberSpend: [{ userId: "fixture-user", spendCents: 1500 }] } }, expected: 15 },
    { source: { events: { usageEvents: [] },
      spend: { teamMemberSpend: [{ userId: "fixture-user", spendCents: 1500 }] } }, expected: null }
  ])("Usage_CursorActiveCostFeed_DistinguishesMissingAmountsFromObservedZero", async ({ source, expected }) => {
    const root = await dataRoot({ generatedAt, ...source,
      daily: { data: [{ userId: "fixture-user", day: "2026-06-01", date: 1780272000000, usageBasedReqs: 0 }],
        period: { startDate: 1780272000000, endDate: 1780358400000 } }
    }, undefined, "cursor");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    const response = await handler({ method: "GET", path: "/api/providers/cursor/usage" });
    expect(response.body).toMatchObject({ origin: "accumulated", totals: { totalCostUsd: expected } });
  });

  it.each([undefined, 0])("Usage_CursorSeatEstimate_%sRequiresItsVariableUsageInput", async (usageBasedReqs) => {
    const root = await dataRoot({ generatedAt,
      daily: { data: [{ userId: "fixture-user", day: "2026-06-01", date: 1780272000000,
        ...(usageBasedReqs === undefined ? {} : { usageBasedReqs }) }],
        period: { startDate: 1780272000000, endDate: 1780358400000 } }
    }, undefined, "cursor");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    const response = await handler({ method: "GET", path: "/api/providers/cursor/usage" });
    expect(response.body).toMatchObject({ origin: "accumulated", costSource: "seat_based",
      totals: { totalCostUsd: usageBasedReqs === undefined ? null : 20 / 30 } });
  });

  it.each([
    { rows: [{}], expected: null },
    { rows: [{ agentRequests: 3 }], expected: null },
    { rows: [{ agentRequests: 3, cmdkUsages: 0, composerRequests: 0, chatRequests: 0 }, {}], expected: null },
    { rows: [{ agentRequests: 0, cmdkUsages: 0, composerRequests: 0, chatRequests: 0 }], expected: 0 },
    { rows: [{ agentRequests: 3, cmdkUsages: 0, composerRequests: 0, chatRequests: 0 }], expected: 3 },
    { rows: [], expected: 0 }
  ])("Usage_CursorRequestCounters_KeepsAbsentDifferentFromExplicitZero", async ({ rows, expected }) => {
    const root = await dataRoot({ generatedAt,
      daily: { data: rows.map((row) => ({ userId: "fixture-user", day: "2026-06-01", date: 1780272000000, ...row })),
        period: { startDate: 1780272000000, endDate: 1780358400000 } }
    }, undefined, "cursor");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/cursor/usage" })).body)
      .toMatchObject({ origin: "accumulated", totals: { requestsCount: expected, observedMetricValue: expected } });
  });

  it.each([undefined, 0, 3])("Usage_GitHubRequiredInteractionCounter_%sPreservesNullAndZero", async (count) => {
    const root = await dataRoot({ generatedAt, download_links: [],
      report_start_day: "2026-06-01", report_end_day: "2026-06-28",
      ...(count === undefined ? {} : { usage_summary: { totalInteractions: count,
        totalCodeGenerations: 0, totalAcceptances: 0, totalLinesAdded: 0, totalLocSuggested: 0, activeUserCount: 0 } })
    }, undefined, "github-copilot");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/github-copilot/usage" })).body)
      .toMatchObject({ origin: "accumulated", totals: { requestsCount: count ?? null, observedMetricValue: count ?? null } });
  });

  it.each([false, true])("Usage_ClaudeCodeBuckets_%sDistinguishesNoIntervalFromExplicitZero", async (hasBucket) => {
    const root = await dataRoot({ generatedAt, monthlySeatCost: 20, sessionCount: 0, modelsUsed: [],
      dailyBuckets: hasBucket ? [{ date: "2026-06-01", inputTokens: 0, outputTokens: 0,
        cacheReadTokens: 0, cacheCreationTokens: 0, requestCount: 0, webSearchRequests: 0,
        webFetchRequests: 0, models: {} }] : []
    }, undefined, "claude-code");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/claude-code/usage" })).body)
      .toMatchObject({ origin: "accumulated", reportStartDay: hasBucket ? "2026-06-01" : null,
        reportEndDay: hasBucket ? "2026-06-01" : null, totals: { requestsCount: hasBucket ? 0 : null,
        observedMetricValue: hasBucket ? 0 : null, totalTokens: hasBucket ? 0 : null,
        tokenComponentsComplete: hasBucket } });
  });

  it.each(["codex", "claude"] as const)(
    "Usage_NativeMissingFields_%sDoesNotPromoteSchemaDefaultsToObservedZero", async (providerId) => {
      expect(await nativeUsage(providerId, nativeSnapshot(providerId, [{}])))
        .toMatchObject({ origin: "accumulated", totals: { inputTokens: null, outputTokens: null,
          observedMetricValue: null, totalTokens: null, observedTokenSubtotal: null,
          tokenComponentsComplete: false, totalCostUsd: null } });
    }
  );

  it.each(["codex", "claude"] as const)(
    "Usage_NativeExplicitZeroFields_%sPreservesMeasuredZero", async (providerId) => {
      const row = providerId === "codex"
        ? { input_tokens: 0, output_tokens: 0, input_cached_tokens: 0, num_model_requests: 0 }
        : { uncached_input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } };
      expect(await nativeUsage(providerId, nativeSnapshot(providerId, [row])))
        .toMatchObject({ totals: { inputTokens: 0, outputTokens: 0, observedMetricValue: 0,
          totalTokens: 0, observedTokenSubtotal: 0, tokenComponentsComplete: true, totalCostUsd: 0 } });
    }
  );

  it.each(["codex", "claude"] as const)(
    "Usage_NativeEmptyResultBucket_%sDistinguishesReportedZeroFromNoBuckets", async (providerId) => {
      expect(await nativeUsage(providerId, nativeSnapshot(providerId, [])))
        .toMatchObject({ totals: { inputTokens: 0, outputTokens: 0, observedMetricValue: 0,
          totalTokens: 0, tokenComponentsComplete: true } });
      expect(await nativeUsage(providerId, { generatedAt,
        usage: { data: [], has_more: false, next_page: null } }))
        .toMatchObject({ reportStartDay: null, reportEndDay: null,
          totals: { inputTokens: null, outputTokens: null, observedMetricValue: null,
          totalTokens: null, tokenComponentsComplete: false, totalCostUsd: null } });
    }
  );

  it.each(["codex", "claude"] as const)(
    "Usage_NativeMissingCostAmount_%sDoesNotPromoteDefaultsToActualZero", async (providerId) => {
      const cost = providerId === "codex" ? { amount: {} } : {};
      expect(await nativeUsage(providerId, nativeSnapshot(providerId, [], [cost])))
        .toMatchObject({ totals: { totalCostUsd: null } });
      const zero = providerId === "codex"
        ? { amount: { value: 0, currency: "usd" } } : { amount: 0, currency: "USD" };
      expect(await nativeUsage(providerId, nativeSnapshot(providerId, [], [zero])))
        .toMatchObject({ costSource: "actual", totals: { totalCostUsd: 0 } });
      expect(await nativeUsage(providerId, nativeSnapshot(providerId, [], [])))
        .toMatchObject({ costSource: "actual", totals: { totalCostUsd: 0 } });
    }
  );

  it.each([
    undefined,
    { usageEvents: [] },
    { usageEvents: [{ timestamp: "1780272000000" }] },
    { usageEvents: [{ timestamp: "1780272000000", tokenUsage: null }] },
    { usageEvents: [{ timestamp: "1780272000000", tokenUsage: {} }] },
    { usageEvents: [
      { timestamp: "1780272000000", tokenUsage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 0 } },
      { timestamp: "1780272000001" }
    ] }
  ])("Usage_CursorIncompleteTokenFeed_DoesNotPromoteDefaultsToCompleteTotals", async (events) => {
    const root = await dataRoot({ generatedAt,
      daily: { data: [{ userId: "fixture-user", day: "2026-06-01", date: 1780272000000,
        agentRequests: 3, cmdkUsages: 0, composerRequests: 0, chatRequests: 0 }],
        period: { startDate: 1780272000000, endDate: 1780358400000 } },
      ...(events === undefined ? {} : { events }) }, undefined, "cursor");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/cursor/usage" })).body)
      .toMatchObject({ origin: "accumulated", totals: { inputTokens: null, outputTokens: null,
        cacheReadTokens: null, cacheCreationTokens: null, totalTokens: null,
        tokenComponentsComplete: false, observedMetricValue: 3 } });
  });

  it("Usage_CursorExplicitZeroTokenFeed_PreservesObservedZero", async () => {
    const root = await dataRoot({ generatedAt,
      daily: { data: [], period: { startDate: 1780272000000, endDate: 1780358400000 } },
      events: { usageEvents: [{ timestamp: "1780272000000", tokenUsage: {
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0
      } }] } }, undefined, "cursor");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/cursor/usage" })).body)
      .toMatchObject({ totals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        cacheCreationTokens: 0, totalTokens: 0, observedTokenSubtotal: 0, tokenComponentsComplete: true } });
  });

  it.each([undefined, 0, 4])("Usage_GitHubAdapterSeats_%sKeepsMissingDistinctFromZero", (seats) => {
    const adapter = providerRegistry.find((candidate) => candidate.providerId === "github-copilot")!;
    const value = adapter.transformSnapshot({ download_links: [], generatedAt,
      report_start_day: "2026-06-01", report_end_day: "2026-06-28",
      ...(seats === undefined ? {} : { billing_seats: { total_seats: seats, plan: "enterprise" } }) });
    expect(value).toMatchObject({ estimatedMonthlyCostUsd: seats === undefined ? null : seats * 39 });
    const usage = buildProviderActualsUsage(value, new Date(observedAt));
    expect(usage.costSource).toBe("seat_based");
    if (seats === undefined) expect(usage.totals.totalCostUsd).toBeNull();
    else expect(usage.totals.totalCostUsd).toBeCloseTo(seats * 39 / 30 * 28, 8);
  });

  it.each([0, 1500])("Usage_CursorSpendOnlyAdapter_%sPrefersActualOverSeatProjection", (cents) => {
    const adapter = providerRegistry.find((candidate) => candidate.providerId === "cursor")!;
    const value = adapter.transformSnapshot({ generatedAt,
      daily: { data: [{ userId: "fixture-user", day: "2026-06-01", date: 1780272000000 }],
        period: { startDate: 1780272000000, endDate: 1780358400000 } },
      spend: { teamMemberSpend: [{ userId: "fixture-user", spendCents: cents }] } });
    expect(value).toMatchObject({ actualCostUsd: cents / 100, spendProjection: { costSource: "seat_based" } });
    expect(buildProviderActualsUsage(value, new Date(observedAt)))
      .toMatchObject({ costSource: "actual", totals: { totalCostUsd: cents / 100 } });
  });

  it.each([0, -100])("Usage_ClaudeActualAdapter_%sDoesNotReplaceZeroOrCreditWithEstimate", (amount) => {
    const adapter = providerRegistry.find((candidate) => candidate.providerId === "claude")!;
    const bucket = { starting_at: "2026-06-01T00:00:00Z", ending_at: "2026-06-02T00:00:00Z" };
    const value = adapter.transformSnapshot({ generatedAt,
      usage: { has_more: false, next_page: null, data: [{ ...bucket,
        results: [{ uncached_input_tokens: 1000000, output_tokens: 100000 }] }] },
      costs: { has_more: false, next_page: null, data: [{ ...bucket, results: [{ amount }] }] } });
    expect(value).toMatchObject({ actualCostUsd: amount / 100, spendProjection: { costSource: "estimated" } });
    expect(buildProviderActualsUsage(value, new Date(observedAt)))
      .toMatchObject({ costSource: "actual", totals: { totalCostUsd: amount / 100 } });
  });

  it.each([
    ["codex", { generatedAt, usage: { data: [], has_more: false, next_page: null } }],
    ["claude", { generatedAt, usage: { data: [], has_more: false, next_page: null } }],
    ["cursor", { generatedAt, daily: { data: [], period: { startDate: 1780272000000, endDate: 1780358400000 } } }],
    ["claude-code", { generatedAt, monthlySeatCost: 200, sessionCount: 0, modelsUsed: [], dailyBuckets: [] }]
  ] as const)("Usage_EmptyAdapter_%sDoesNotExposeAnEmptyProjectionAsFreeUsage", (providerId, raw) => {
    const adapter = providerRegistry.find((candidate) => candidate.providerId === providerId)!;
    const value = adapter.transformSnapshot(raw);
    expect(value.spendProjection).toMatchObject({ totalUsd: 0, windowDays: 0 });
    expect(buildProviderActualsUsage(value, new Date(observedAt)).totals.totalCostUsd).toBeNull();
  });

  it("Handler_InjectedEnvironmentRoot_ReadsThatSnapshot", async () => {
    const root = await dataRoot(snapshot(2345));
    vi.spyOn(process, "cwd").mockReturnValue(await dataRoot());
    const handler = createDynamicIntegrationContractHandler({
      env: { TOKEN_REPORTING_DATA_ROOT: root }, now: () => new Date(observedAt)
    });
    expect((await handler({ method: "GET", path: "/api/providers/codex/usage" })).body)
      .toMatchObject({ origin: "accumulated", totals: { inputTokens: 2345 } });
  });

  it("Handler_BlankConfiguredRoot_DoesNotSilentlyReadAnotherRoot", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(await dataRoot());
    const handler = createDynamicIntegrationContractHandler({
      env: { TOKEN_REPORTING_DATA_ROOT: "  " }, now: () => new Date(observedAt)
    });
    await expect(handler({ method: "GET", path: "/api/providers/codex/usage" }))
      .rejects.toThrow("Data root must not be empty");
  });

  it("Usage_MissingComponents_PreservesUnknownInsteadOfZero", async () => {
    expect(await usageFor(summary({ comparisonMetric: { value: null, unit: "tokens", label: "tokens" } })))
      .toMatchObject({ origin: "unknown", lastFetchedAt: null, observedAt,
        snapshotGeneratedAt: generatedAt, coverage: { status: "unknown" },
        totals: { inputTokens: null, outputTokens: null, cacheReadTokens: null,
          cacheCreationTokens: null, requestsCount: null, observedMetricValue: null,
          totalTokens: null, observedTokenSubtotal: null, tokenComponentsComplete: false } });
  });

  it("Usage_ObservedZero_RemainsZero", async () => {
    expect(await usageFor(summary({ inputTokens: 0, outputTokens: 0, requestCount: 0 })))
      .toMatchObject({ totals: { inputTokens: 0, outputTokens: 0, requestsCount: 0,
        totalTokens: 0, observedTokenSubtotal: 0, tokenComponentsComplete: true } });
  });

  it("Usage_CodexCacheInclusiveInput_DoesNotAddCacheTwice", async () => {
    expect(await usageFor(summary({ inputTokens: 1000, outputTokens: 100,
      cacheReadTokens: 400, cacheCreationTokens: 50 })))
      .toMatchObject({ inputTokenSemantics: "includes_cache_read", totals: {
        totalTokens: 1100, observedTokenSubtotal: 1100, cacheReadTokens: 400 } });
  });

  it("Usage_PartialKnownComponents_SeparatesSubtotalFromUnknownTotal", async () => {
    expect(await usageFor(summary({ inputTokens: 1000, outputTokens: null })))
      .toMatchObject({ totals: { totalTokens: null, observedTokenSubtotal: 1000,
        tokenComponentsComplete: false } });
  });

  it.each(["actual", "estimated", "seat_based"] as const)(
    "Usage_CostBasis_%sIsExplicit", async (costSource) => {
      // A token-price estimate requires known additive inputs, unlike an actual bill.
      const value = summary({ inputTokens: 1000, outputTokens: 100 });
      value.spendProjection.costSource = costSource;
      expect(await usageFor(value)).toMatchObject({ costSource,
        units: { tokens: "tokens", requests: "requests", cost: "USD" },
        totals: { totalCostUsd: 4.25 } });
    }
  );

  it.each([undefined, "invalid", "2026-02-31T00:00:00.000Z", "2026-06-09T00:00:00.000Z"])(
    "Usage_InvalidOrFutureGeneration_%sHasUnknownFreshness", async (timestamp) => {
      expect(await usageFor(summary({ snapshotGeneratedAt: timestamp })))
        .toMatchObject({ snapshotGeneratedAt: null, freshness: "unknown", lastFetchedAt: null, observedAt });
    }
  );

  it.each(["{bad-json", { usage: { wrongShape: true } }, undefined])(
    "Loader_InvalidAccumulatedCandidate_FallsThroughToValidatedLatest", async (accumulated) => {
      const root = await dataRoot(accumulated, snapshot());
      const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
      const response = await handler({ method: "GET", path: "/api/providers/codex/usage" });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ origin: "latest", snapshotGeneratedAt: generatedAt,
        observedAt, lastFetchedAt: null, freshness: "timestamp_known",
        totals: { totalTokens: 1100, totalCostUsd: 4.25 } });
    }
  );

  it("Loader_ValidAccumulated_WinsAndHasContentIdentity", async () => {
    const root = await dataRoot(snapshot(2000), snapshot());
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    const response = await handler({ method: "GET", path: "/api/providers/codex/usage" });
    expect(response.body).toMatchObject({ origin: "accumulated", totals: { totalTokens: 2100 },
      snapshotId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/) });
  });

  it("Loader_ExplicitFetchedAt_DoesNotSubstituteGenerationOrResponseTime", async () => {
    const fetchedAt = "2026-06-08T09:30:00.000Z";
    const root = await dataRoot({ ...snapshot(), fetchedAt });
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/codex/usage" })).body)
      .toMatchObject({ lastFetchedAt: fetchedAt, snapshotGeneratedAt: generatedAt, observedAt });
  });

  it("Loader_AllCandidatesInvalid_SeedIsLabeledAndNeverBudgetAuthority", async () => {
    const root = await dataRoot({}, "bad-json");
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root,
      budgetLimits: { codex: { budgetKind: "tokens_per_window", limit: 1000000 } },
      now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/codex/usage" })).body)
      .toMatchObject({ origin: "seed", snapshotId: null, snapshotGeneratedAt: null,
        lastFetchedAt: null, totals: { inputTokens: null, totalCostUsd: null, totalTokens: null } });
    expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
      .toMatchObject({ used: null, remaining: null, threshold: "unknown",
        dispatchGuard: { allowDispatch: false, decision: "block", reasonCodes: expect.arrayContaining(["seed_data"]) } });
  });

  it("Budget_NoConfiguredLimit_DoesNotInventCapacity", async () => {
    const root = await dataRoot(snapshot());
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
      .toMatchObject({ used: 3, limit: null, remaining: null, threshold: "unknown",
        lastFetchedAt: null, confidence: null, estimatedDispatchesRemaining: { reviewer: null, worker: null },
        dispatchGuard: { allowDispatch: false, decision: "block", reasonCodes: ["budget_limit_unknown"] } });
    expect((await handler({ method: "GET", path: "/api/budgets" })).body).toMatchObject({ status: "degraded" });
  });

  it("Budget_UnknownInjectedOrigin_BlocksEvenWithNumbers", async () => {
    const handler = createDynamicIntegrationContractHandler({
      loadSummaries: async () => [summary({ inputTokens: 1000, outputTokens: 100 })],
      budgetLimits: { codex: { budgetKind: "tokens_per_window", limit: 10000 } }, now: () => new Date(observedAt)
    });
    expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
      .toMatchObject({ used: 1100, threshold: "unknown", dispatchGuard: {
        allowDispatch: false, reasonCodes: expect.arrayContaining(["source_unknown"]) } });
  });

  it("Budget_ExplicitZeroLimit_IsExhaustedNotUnknown", async () => {
    const root = await dataRoot(snapshot());
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root,
      budgetLimits: { codex: { budgetKind: "tokens_per_window", limit: 0 } }, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
      .toMatchObject({ used: 1100, limit: 0, remaining: 0, threshold: "exhausted",
        dispatchGuard: { allowDispatch: false } });
  });

  it.each(["claude", "claude-code", "cursor"])(
    "Usage_SeparateCacheProvider_%sAddsEachComponentOnce", (providerId) => {
      const value = summary({ providerId, inputTokens: 1000, outputTokens: 100,
        cacheReadTokens: 400, cacheCreationTokens: 20, cacheWriteTokens: 50 });
      expect(buildProviderActualsUsage(value, new Date(observedAt))).toMatchObject({
        inputTokenSemantics: "separate_cache_components", totals: {
          totalTokens: providerId === "cursor" ? 1550 : 1520, tokenComponentsComplete: true
        }
      });
    }
  );

  it("Usage_GitHubCliOnly_DoesNotClaimProviderWideTokens", () => {
    expect(buildProviderActualsUsage(summary({ providerId: "github-copilot", cliInputTokens: 900,
      cliOutputTokens: 100, cliRequestCount: 2 }), new Date(observedAt)))
      .toMatchObject({ inputTokenSemantics: "unknown", totals: {
        inputTokens: null, outputTokens: null, totalTokens: null, tokenComponentsComplete: false
      } });
  });

  it("Usage_UnknownProviderSemantics_DoesNotAssumeComponentsAreAdditive", () => {
    expect(buildProviderActualsUsage(summary({ providerId: "future-provider",
      inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400, cacheCreationTokens: 50 }),
    new Date(observedAt))).toMatchObject({ inputTokenSemantics: "unknown", totals: {
      inputTokens: 1000, outputTokens: 100, cacheReadTokens: 400, cacheCreationTokens: 50,
      totalTokens: null, observedTokenSubtotal: null, tokenComponentsComplete: false
    } });
  });

  it("Usage_OverflowedTokenSum_RemainsUnknown", async () => {
    expect(await usageFor(summary({ inputTokens: 1e308, outputTokens: 1e308 })))
      .toMatchObject({ totals: { totalTokens: null, observedTokenSubtotal: null,
        tokenComponentsComplete: false } });
  });

  it.each(["invalid", "2026-06-09T00:00:00.000Z"])(
    "Budget_InvalidGeneration_%sBlocksDispatch", async (timestamp) => {
      const root = await dataRoot({ ...snapshot(), generatedAt: timestamp, fetchedAt: timestamp });
      const handler = createDynamicIntegrationContractHandler({ dataRoot: root,
        budgetLimits: { codex: { budgetKind: "tokens_per_window", limit: 10000 } }, now: () => new Date(observedAt) });
      expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
        .toMatchObject({ origin: "accumulated", snapshotGeneratedAt: null, lastFetchedAt: null,
          threshold: "unknown", dispatchGuard: { allowDispatch: false, reasonCodes: ["freshness_unknown"] } });
    }
  );

  it.each(["seat_based", "estimated"])(
    "Budget_NonActualCost_%sCannotAuthorizeSpend", async (basis) => {
      const value = summary({ actualsProvenance: { origin: "latest", snapshotId: null, fetchedAt: null } });
      value.spendProjection.costSource = basis as "seat_based" | "estimated";
      const handler = createDynamicIntegrationContractHandler({ loadSummaries: async () => [value],
        budgetLimits: { codex: { budgetKind: "usd_per_window", limit: 100 } }, now: () => new Date(observedAt) });
      expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
        .toMatchObject({ costSource: basis, used: null, remaining: null,
          dispatchGuard: { allowDispatch: false, reasonCodes: ["usage_unknown"] } });
    }
  );

  it.each(["unsupported_capacity", "requests_per_window", "usd_per_window"])(
    "Budget_RecognizedUnit_%sUsesOnlyMatchingObservation", async (budgetKind) => {
      const root = await dataRoot(snapshot());
      const handler = createDynamicIntegrationContractHandler({ dataRoot: root,
        budgetLimits: { codex: { budgetKind, limit: 100 } }, now: () => new Date(observedAt) });
      const expected = budgetKind === "requests_per_window" ? 3 : budgetKind === "usd_per_window" ? 4.25 : null;
      expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
        .toMatchObject({ used: expected, dispatchGuard: { allowDispatch: expected !== null } });
    }
  );

  it.each([70, 90, 100])("Budget_KnownUsage_%sPreservesThresholdPolicies", async (used) => {
    const root = await dataRoot({ ...snapshot(0), usage: { ...snapshot().usage,
      data: [{ ...snapshot().usage.data[0], results: [{ input_tokens: used,
        output_tokens: 0, num_model_requests: 0 }] }] } });
    const handler = createDynamicIntegrationContractHandler({ dataRoot: root,
      budgetLimits: { codex: { budgetKind: "tokens_per_window", limit: 100 } }, now: () => new Date(observedAt) });
    expect((await handler({ method: "GET", path: "/api/providers/codex/budget-status" })).body)
      .toMatchObject({ used, threshold: used === 70 ? "amber" : used === 90 ? "red" : "exhausted" });
  });
});
