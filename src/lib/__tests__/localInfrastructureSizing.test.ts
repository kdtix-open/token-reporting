import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HARDWARE_PROFILES } from "../hardwareProfiles";
import {
  buildLocalInfrastructureSizing,
  buildScaleRamp,
  normalizeProviderUsage,
  pureComputeTokens,
  recommendFirstServer,
  type LocalInfrastructureSizingReport,
  type NormalizedProviderUsage,
} from "../localInfrastructureSizing";
import type { LocalModelMigrationReport } from "../localModelReport";
import type { LocalSessionDistribution } from "../localSessionDistribution";
import type { ProviderReportSummary } from "../types";
import { seededClaudeCodeReportSummary } from "../../providers/claudeCode/seed";
import { seededClaudeReportSummary } from "../../providers/claude/seed";
import { seededCodexReportSummary } from "../../providers/codex/seed";
import { seededCursorReportSummary } from "../../providers/cursor/seed";
import { seededGitHubCopilotReportSummary } from "../../providers/githubCopilot/seed";

describe("localInfrastructureSizing", () => {
  it("normalizeProviderUsage_PreservesProviderWindowsAndReconcilesCopilotCliOutput", () => {
    const providers = normalizeProviderUsage([
      githubWithCliTokens(),
      cursorWithTokens({ reportStartDay: "2026-04-01", reportEndDay: "2026-05-25" })
    ]);

    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({
      providerId: "github-copilot",
      billingType: "SEAT_BASED",
      coverageStart: "2026-03-01",
      coverageEnd: "2026-03-28",
      inputTokens: 1_000,
      outputTokens: 250,
      requestsCount: 10,
      sessionsCount: 3,
      windowDays: 28
    });
    expect(providers[0].modelsUsed).toEqual(["claude-sonnet-4.6"]);
    expect(providers[0].notes.join(" ")).toContain("CLI-only");
    expect(providers[1]).toMatchObject({
      providerId: "cursor",
      coverageStart: "2026-04-01",
      coverageEnd: "2026-05-25",
      cacheCreationTokens: 400,
      windowDays: 55
    });
  });

  it("pureComputeTokens_ExcludesCacheReadsAndUsesUncachedInputWhenAvailable", () => {
    const usage: NormalizedProviderUsage = {
      billingType: "ACTUAL",
      cacheCreationTokens: 5,
      cacheReadTokens: 10_000,
      coverageEnd: "2026-06-09",
      coverageStart: "2026-06-01",
      inputTokens: 500,
      modelsUsed: [],
      notes: [],
      outputTokens: 20,
      providerId: "codex",
      providerName: "OpenAI Codex",
      requestsCount: 4,
      sessionsCount: null,
      totalCostUsd: 3,
      uncachedInputTokens: 60,
      windowDays: 9
    };

    expect(pureComputeTokens(usage)).toBe(85);
  });

  it("buildLocalInfrastructureSizing_ClassifiesRoutesAndAvoidsFullLocalReplacement", () => {
    const report = buildCurrentSizingReport();

    expect(report.routeClasses.map((route) => route.id)).toEqual([
      "short_context_coding",
      "repo_agent_worker",
      "repo_agent_reviewer",
      "long_context_tail",
      "realtime_or_transcription",
      "unknown_or_untrusted"
    ]);
    expect(report.localMigrationPlan.fullLocalReplacementRecommended).toBe(false);
    expect(report.localMigrationPlan.phases.map((phase) => phase.phase)).toEqual([
      "cloud_baseline",
      "local_shadow",
      "short_context_canary",
      "local_worker_cloud_reviewer",
      "safe_local_worker_and_reviewer",
      "cloud_fallback_tail"
    ]);
    expect(report.dataQualityWarnings.join(" ")).toContain("GitHub Copilot output reconciled");
    expect(report.routeClasses.find((route) => route.id === "long_context_tail")).toMatchObject({
      recommendedRouting: "cloud"
    });
  });

  it("recommendFirstServer_ChoosesQuoteablePartialMigrationServerWithinBudget", () => {
    const report = buildCurrentSizingReport();
    const recommendation = recommendFirstServer({
      budgetHighUsd: 150_000,
      budgetLowUsd: 100_000,
      hardwareProfiles: HARDWARE_PROFILES,
      migrationPolicy: report.localMigrationPlan.migrationPolicy,
      workload: report.workloadSummary
    });

    expect(recommendation.recommendationKind).toBe("preferred_first_quote");
    expect(recommendation.hardwareProfileId).toBe(
      "preferred_quad_rtxpro6000_blackwell_server"
    );
    expect(recommendation.fullLocalReplacementRecommended).toBe(false);
    expect(recommendation.routingRecommendation).toContain("partial local migration");
    expect(recommendation.facilitiesPrerequisites.length).toBeGreaterThan(0);
    expect(
      report.alternativeFirstServers.map((server) => server.recommendationKind)
    ).toContain("lower_cost_fallback_quote");
  });

  it("buildScaleRamp_UsesFloorProtoThroughCagePhases", () => {
    const phases = buildScaleRamp(HARDWARE_PROFILES);

    expect(phases.map((phase) => phase.phase)).toEqual([
      "poc",
      "pilot",
      "production_server",
      "multi_server_rack",
      "rack_scale",
      "cage"
    ]);
    expect(phases[0]).toMatchObject({
      targetLocalCoveragePct: 10,
      targetProjectLanes: 0.25
    });
    expect(phases[4].recommendedHardwareProfileIds).toContain("rack_scale_gb200_nvl72");
  });

  it("fixture20260609_KeepsKnownSizingValuesAndRejectsFullReplacement", () => {
    const fixture = loadFixture();
    const requiredTps = readFixtureNumber(fixture, "requiredTokensPerSec");
    const contextWindow = readFixtureNumber(fixture, "estimatedContextWindowNeeded");
    const report = buildLocalInfrastructureSizing({
      distribution: localDistribution,
      generatedAt: "2026-06-09T00:38:14.526Z",
      localModelReport: {
        contextConfidence: "high",
        estimatedContextWindowNeeded: contextWindow,
        requiredTokensPerSec: requiredTps
      } as LocalModelMigrationReport,
      summaries: fixtureSummaries()
    });

    expect(report.workloadSummary.currentProjectLaneComputeTps).toBeCloseTo(
      4054.6519791666665,
      5
    );
    expect(report.workloadSummary.currentProjectLaneP99Context).toBe(1_000_000);
    expect(report.recommendedFirstServer.fullLocalReplacementRecommended).toBe(false);
    expect(report.recommendedFirstServer.recommendationKind).toBe(
      "preferred_first_quote"
    );
    expect(report.hardwareProfiles.every((profile) =>
      profile.estimatedCapexLowUsd === null ||
      profile.pricingConfidence === "quote_required"
    )).toBe(true);
  });

  it("coverageSummary_SeparatesMigrationTargetFromDerivedServerCapacity", () => {
    const report = buildCurrentSizingReport();

    expect(report.localCoverageSummary).toMatchObject({
      targetFirstServerCoveragePct: 30,
      safeInitialProductionRoutingPct: 10,
      shadowCoveragePct: 100,
      canaryCoveragePct: 10
    });
    expect(report.localCoverageSummary.estimatedFullWorkloadCapacityPct).toBeLessThan(30);
    expect(report.localCoverageSummary.explanation).toContain(
      "migration objective, not current server capability"
    );
    expect(report.dataQualityWarnings).toContain(
      "Target coverage exceeds derived server capacity; treat target as migration objective, not current server capability."
    );
  });

  it("routeClasses_LabelOverlaysAndKeepAdditiveTokenSharesBounded", () => {
    const report = buildCurrentSizingReport();
    const additiveShare = report.routeClasses
      .filter((route) => route.kind === "additive_workload")
      .reduce((total, route) => total + route.tokenShareEstimate, 0);
    const tail = report.routeClasses.find((route) => route.id === "long_context_tail");
    const shortContext = report.routeClasses.find((route) => route.id === "short_context_coding");

    expect(additiveShare).toBeGreaterThan(0.95);
    expect(additiveShare).toBeLessThanOrEqual(1.05);
    expect(tail).toMatchObject({
      kind: "cross_cutting_overlay",
      recommendedRouting: "cloud"
    });
    expect(tail?.overlapsWithRouteClassIds).toEqual(
      expect.arrayContaining(["short_context_coding", "repo_agent_worker", "repo_agent_reviewer"])
    );
    expect(shortContext).toMatchObject({
      contextStatsSource: "global_fallback",
      contextStatsWarning:
        "short-context candidate; route-specific context pending"
    });
  });

  it("workloadScopes_DefaultToRepoAutomationAndCompareAllProviderTraffic", () => {
    const report = buildCurrentSizingReport();

    expect(report.workloadScopeConfig).toMatchObject({
      compareAgainstAllProviderTraffic: true,
      defaultSizingScope: "repo_automation_project"
    });
    expect(report.workloadScopeSummaries.map((scope) => scope.scope)).toEqual([
      "all_provider_traffic",
      "repo_automation_project",
      "copilot_cli",
      "agentic_worker",
      "reviewer"
    ]);
    expect(
      report.workloadScopeSummaries.find((scope) => scope.scope === "repo_automation_project")
        ?.notes.join(" ")
    ).toContain("Copilot CLI volume is reported separately");
  });

  it("workloadSummary_SplitsAllProviderFromSelectedRepoAutomationScope", () => {
    const report = buildJune10SizingReport();

    expect(report.workloadSummary.allProviderComputeTps).toBeCloseTo(4070.3, 1);
    expect(report.workloadSummary.allProviderPeakTps).toBeCloseTo(12210.9, 1);
    expect(report.workloadSummary.repoAutomationComputeTps).toBeCloseTo(281.5, 1);
    expect(report.workloadSummary.selectedScopeComputeTps).toBeCloseTo(281.5, 1);
    expect(report.workloadSummary.repoAutomationComputeTps).not.toBeCloseTo(
      report.workloadSummary.allProviderComputeTps,
      1
    );
  });

  it("hardwareBudgetScenarios_KeepFirstServerCanarySeparateFromAllProviderReplacement", () => {
    const report = buildJune10SizingReport();
    const firstServer = report.hardwareBudgetScenarios.find(
      (scenario) =>
        scenario.scope === "repo_automation_project" &&
        scenario.replacementGoal === "safe_canary"
    );
    const allProviderSteady = report.hardwareBudgetScenarios.find(
      (scenario) =>
        scenario.scope === "all_provider_traffic" &&
        scenario.replacementGoal === "steady_state_replacement" &&
        scenario.hardwareProfileId === "preferred_quad_rtxpro6000_blackwell_server"
    );
    const allProviderPeak = report.hardwareBudgetScenarios.find(
      (scenario) =>
        scenario.scope === "all_provider_traffic" &&
        scenario.replacementGoal === "peak_safe_replacement" &&
        scenario.hardwareProfileId === "preferred_quad_rtxpro6000_blackwell_server"
    );

    expect(firstServer).toMatchObject({
      cloudFallbackRequired: true,
      estimatedCapexHighUsd: 150_000,
      fullReplacementAllowed: false,
      scope: "repo_automation_project"
    });
    expect(firstServer?.explanation).toContain(
      "$150K is enough for first-server shadow/canary and benchmark collection."
    );
    expect(firstServer?.explanation).not.toContain("full all-provider replacement");

    expect(allProviderSteady).toMatchObject({
      requiredNodes: 6,
      requiredGpuCount: 24,
      estimatedNodeThroughputTps: 720,
      fullReplacementAllowed: false
    });
    expect(allProviderSteady?.targetTokensPerSecond).toBeCloseTo(4070.3, 1);
    expect(allProviderSteady?.explanation).toContain(
      "$150K is not enough for all-provider replacement."
    );
    expect(allProviderSteady?.estimatedCapexLowUsd).toBe(1_200_000);
    expect(allProviderSteady?.estimatedCapexHighUsd).toBe(2_000_000);

    expect(allProviderPeak).toMatchObject({
      requiredNodes: 17,
      requiredGpuCount: 68,
      estimatedNodeThroughputTps: 720,
      fullReplacementAllowed: false
    });
    expect(allProviderPeak?.targetTokensPerSecond).toBeCloseTo(12210.9, 1);
    expect(allProviderPeak?.estimatedCapexLowUsd).toBe(3_500_000);
    expect(allProviderPeak?.estimatedCapexHighUsd).toBe(6_000_000);
  });

  it("hardwareBudgetScenarios_BlockP99FullReplacementWithoutBenchmarkEvidence", () => {
    const report = buildJune10SizingReport();
    const p99Planning = report.hardwareBudgetScenarios.find(
      (scenario) => scenario.replacementGoal === "p99_full_replacement"
    );

    expect(p99Planning).toMatchObject({
      cloudFallbackRequired: true,
      confidence: "quote_required",
      fullReplacementAllowed: false,
      requiredContextTokens: 1_000_000
    });
    expect(p99Planning?.explanation).toContain(
      "blocked by context, quality, and benchmark gates"
    );
  });

  it("hardwareBudgetScenarios_AcceptCustomHardwareProfilesWithoutBuiltInIds", () => {
    const customProfile = customHardwareProfile({
      estimatedCapexHighUsd: 145_000,
      estimatedCapexLowUsd: 120_000,
      firstServerRole: "worker_pool",
      id: "custom-worker-pool",
      phase: "pilot_server",
      profileName: "Custom worker-pool profile",
      quotePriority: "quote_now"
    });
    const report = buildLocalInfrastructureSizing({
      distribution: localDistribution,
      hardwareProfiles: [customProfile],
      localModelReport: {
        contextConfidence: "high",
        estimatedContextWindowNeeded: 131_072,
        requiredTokensPerSec: 250
      } as LocalModelMigrationReport,
      summaries: fixtureSummaries()
    });

    expect(
      report.hardwareBudgetScenarios.some(
        (scenario) => scenario.hardwareProfileId === "custom-worker-pool"
      )
    ).toBe(true);
    expect(
      report.hardwareBudgetScenarios.find(
        (scenario) => scenario.replacementGoal === "p99_full_replacement"
      )
    ).toMatchObject({
      hardwareProfileId: "custom-worker-pool"
    });
  });

  it("hardwareBudgetSummary_ReflectsProviderMixAndSelectedProfileBudget", () => {
    const customProfile = customHardwareProfile({
      estimatedCapexHighUsd: 250_000,
      estimatedCapexLowUsd: 200_000,
      firstServerRole: "worker_pool",
      id: "custom-expensive-worker-pool",
      phase: "pilot_server",
      profileName: "Custom expensive worker-pool profile",
      quotePriority: "quote_now"
    });
    const report = buildLocalInfrastructureSizing({
      distribution: localDistribution,
      hardwareProfiles: [customProfile],
      localModelReport: {
        contextConfidence: "high",
        estimatedContextWindowNeeded: 131_072,
        requiredTokensPerSec: 250
      } as LocalModelMigrationReport,
      summaries: noCopilotSummaries()
    });

    expect(report.hardwareBudgetSummary.copilotDominanceWarning).toContain("not present");
    expect(report.hardwareBudgetSummary.copilotDominanceWarning).not.toContain("dominates");
    expect(report.hardwareBudgetSummary.cfoSummaryLines[0]).toContain(
      "$150K is not enough for first-server"
    );
  });

  it("financials_ExcludeSeatBasedSpendFromCloudDisplacementPayback", () => {
    const report = buildCurrentSizingReport();
    const annualSpend = report.providerCoverage.reduce(
      (total, provider) => total + (provider.totalCostUsd ?? 0) * (365 / (provider.windowDays ?? 365)),
      0
    );

    expect(report.financials.annualCloudSpendDisplacementUsd).not.toBeNull();
    expect(report.financials.annualCloudSpendDisplacementUsd ?? 0).toBeLessThan(annualSpend);
    expect(report.financials.notes.join(" ")).toContain(
      "not directly displaced unless seats are reduced"
    );
    expect(report.financials.notes.join(" ")).toContain(
      "cloud spend alone likely does not justify the capex"
    );
    expect(report.financials.paybackMonthsRevenueCapacity).not.toBeNull();
  });

  it("hardwareProfiles_AreQuoteReadyAndDoNotPromoteScaleOrFutureAsFirstServer", () => {
    const report = buildCurrentSizingReport();
    const byId = new Map(report.hardwareProfiles.map((profile) => [profile.id, profile]));

    expect(report.recommendedFirstServer.hardwareProfileId).not.toBe("rack_scale_gb200_nvl72");
    expect(report.recommendedFirstServer.hardwareProfileId).not.toBe("future_rubin_class_unquoted");
    expect(byId.get("floor_proto_dual_rtxpro6000_blackwell_server")).toMatchObject({
      firstServerRole: "shadow",
      fullProjectLaneClaimAllowed: false,
      quotePriority: "quote_now"
    });
    expect(byId.get("preferred_quad_rtxpro6000_blackwell_server")).toMatchObject({
      firstServerRole: "worker_pool",
      fullProjectLaneClaimAllowed: false,
      quotePriority: "quote_now"
    });
    expect(byId.get("production_8x_rtxpro6000_blackwell_server")).toMatchObject({
      firstServerRole: "production_lane",
      pricingConfidence: "quote_required",
      quotePriority: "quote_later"
    });
    expect(byId.get("rack_scale_gb200_nvl72")).toMatchObject({
      quotePriority: "do_not_quote_yet"
    });
    expect(byId.get("future_rubin_class_unquoted")).toMatchObject({
      quotePriority: "do_not_quote_yet",
      pricingConfidence: "unknown"
    });
  });

  it("benchmarkGates_BlockProductionRoutingUntilRequiredGatesPass", () => {
    const report = buildCurrentSizingReport();

    expect(report.benchmarkGates.map((gate) => gate.gateId)).toEqual([
      "shadow_replay_gate",
      "short_context_canary_gate",
      "local_worker_cloud_reviewer_gate",
      "fallback_failure_gate",
      "p95_p99_context_pressure_gate",
      "power_thermal_burn_in_gate"
    ]);
    expect(report.productionRoutingBlocked).toBe(true);
    expect(report.benchmarkGates.every((gate) => gate.status === "not_started")).toBe(true);
  });

  it("executiveSummary_UsesCfoSafeFirstQuoteLanguage", () => {
    const report = buildCurrentSizingReport();

    expect(report.executiveSummary.firstQuoteToRequest).toContain("2U dual RTX PRO 6000");
    expect(report.executiveSummary.firstQuoteToRequest).toContain("4U/5U quad RTX PRO 6000");
    expect(report.executiveSummary.whatThisServerCannotDo).toContain(
      "replace the full current workload"
    );
    expect(report.executiveSummary.estimatedSafeInitialRouting).toContain("5%-10%");
    expect(report.executiveSummary.paybackFromCloudDisplacement).toContain(
      "likely does not justify"
    );
    expect(report.executiveSummary.paybackFromReservedCapacityProductRevenue).toContain(
      "strategic payback path"
    );
  });
});

function buildCurrentSizingReport(): LocalInfrastructureSizingReport {
  return buildLocalInfrastructureSizing({
    distribution: localDistribution,
    forensicRun: {
      parentSynthesis: {
        confidence: 0.95,
        recommendation:
          "Use tiered routing: local candidates for short-context work, hosted providers for tail-context work.",
        reviewerCount: 7
      },
      runId: "dynamic-forensic-test",
      status: "completed",
      updatedAt: "2026-06-09T00:00:00.000Z"
    },
    localModelReport: {
      contextConfidence: "high",
      estimatedContextWindowNeeded: 1_000_000,
      requiredTokensPerSec: 4054.6519791666665
    } as LocalModelMigrationReport,
    summaries: [
      githubWithCliTokens(),
      cursorWithTokens({ reportStartDay: "2026-04-01", reportEndDay: "2026-05-25" }),
      seededClaudeReportSummary,
      seededClaudeCodeReportSummary,
      seededCodexReportSummary
    ]
  });
}

function buildJune10SizingReport(): LocalInfrastructureSizingReport {
  return buildLocalInfrastructureSizing({
    distribution: localDistribution,
    forensicRun: {
      parentSynthesis: {
        confidence: 0.95,
        recommendation:
          "Use tiered routing: local candidates for short-context work, hosted providers for tail-context work.",
        reviewerCount: 7
      },
      runId: "dynamic-forensic-test",
      status: "completed",
      updatedAt: "2026-06-10T00:00:00.000Z"
    },
    localModelReport: {
      contextConfidence: "high",
      estimatedContextWindowNeeded: 1_000_000,
      requiredTokensPerSec: 4057.9145455344587
    } as LocalModelMigrationReport,
    summaries: fixtureSummaries()
  });
}

function customHardwareProfile(
  overrides: Partial<(typeof HARDWARE_PROFILES)[number]>
): (typeof HARDWARE_PROFILES)[number] {
  const base = HARDWARE_PROFILES.find(
    (profile) => profile.id === "preferred_quad_rtxpro6000_blackwell_server"
  );
  if (!base) throw new Error("Missing preferred hardware fixture");
  return {
    ...base,
    ...overrides
  };
}

function noCopilotSummaries(): ProviderReportSummary[] {
  return [
    cursorWithTokens({ reportStartDay: "2026-04-01", reportEndDay: "2026-05-25" }),
    seededClaudeReportSummary,
    seededClaudeCodeReportSummary,
    seededCodexReportSummary
  ];
}

function githubWithCliTokens(): ProviderReportSummary {
  return {
    ...seededGitHubCopilotReportSummary,
    cliInputTokens: 1_000,
    cliOutputTokens: 250,
    cliRequestCount: 10,
    cliSessionCount: 3,
    cliModelsUsed: ["claude-sonnet-4.6"],
    outputTokens: 0,
    perModelBreakdown: [
      {
        costUsd: 70.93,
        features: ["cli"],
        inputTokens: 1_000,
        interactionCount: 10,
        model: "claude-sonnet-4.6",
        outputTokens: 250,
        requestCount: 10,
        tokensUnavailable: false
      }
    ]
  } as ProviderReportSummary;
}

function cursorWithTokens(window: {
  reportEndDay: string;
  reportStartDay: string;
}): ProviderReportSummary {
  return {
    ...seededCursorReportSummary,
    ...window,
    cacheReadTokens: 3_000,
    cacheWriteTokens: 400,
    inputTokens: 2_000,
    modelsUsed: ["composer-2-fast"],
    outputTokens: 500,
    usageEventCount: 22
  } as ProviderReportSummary;
}

function fixtureSummaries(): ProviderReportSummary[] {
  return [
    {
      ...seededGitHubCopilotReportSummary,
      cliInputTokens: 8_541_179_314,
      cliOutputTokens: 49_790_531,
      cliRequestCount: 104_841,
      reportEndDay: "2026-06-08",
      reportStartDay: "2026-03-22",
      spendProjection: {
        ...seededGitHubCopilotReportSummary.spendProjection,
        totalUsd: 70.93,
        windowDays: 79
      }
    } as ProviderReportSummary,
    {
      ...seededCursorReportSummary,
      cacheReadTokens: 430_004_836,
      cacheWriteTokens: 490_831,
      inputTokens: 30_374_981,
      outputTokens: 1_582_909,
      reportEndDay: "2026-06-11",
      reportStartDay: "2026-03-22",
      spendProjection: {
        ...seededCursorReportSummary.spendProjection,
        totalUsd: 387.71,
        windowDays: 82
      },
      usageEventCount: 425
    } as ProviderReportSummary,
    {
      ...seededClaudeReportSummary,
      cacheCreationTokens: 37_974_280,
      cacheReadTokens: 689_880_109,
      inputTokens: 2_408_747,
      outputTokens: 6_207_516,
      reportEndDay: "2026-06-10",
      reportStartDay: "2025-06-06"
    } as ProviderReportSummary,
    {
      ...seededClaudeCodeReportSummary,
      cacheCreationTokens: 460_559_832,
      cacheReadTokens: 17_241_136_639,
      inputTokens: 2_558_015,
      outputTokens: 58_373_310,
      reportEndDay: "2026-06-10",
      reportStartDay: "2026-04-02",
      requestCount: 71_054
    } as ProviderReportSummary,
    {
      ...seededCodexReportSummary,
      cacheReadTokens: 310_311_616,
      inputTokens: 349_684_946,
      outputTokens: 2_184_409,
      reportEndDay: "2026-06-11",
      reportStartDay: "2026-03-22",
      requestCount: 7_038,
      uncachedInputTokens: 39_373_330
    } as ProviderReportSummary
  ];
}

const localDistribution: LocalSessionDistribution = {
  combined: {
    max: 991_000,
    mean: 116_800,
    p50: 100_000,
    p95: 835_000,
    p99: 939_000,
    sampleCount: 65_731
  },
  generatedAt: "2026-06-06T00:00:00.000Z",
  sources: []
};

function loadFixture(): string {
  const path = join(
    process.cwd(),
    "src/lib/__fixtures__/token-report-2026-06-09.yaml"
  );
  return readFileSync(path, "utf8");
}

function readFixtureNumber(fixture: string, field: string): number {
  const match = fixture.match(new RegExp(`${field}: ([0-9.]+)`));
  if (!match) throw new Error(`Missing fixture field: ${field}`);
  return Number(match[1]);
}
