import { describe, expect, it } from "vitest";

import { buildLocalModelReport } from "../localModelReport";
import type { HuggingFaceCandidateSet } from "../huggingFaceCandidates";
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

const copilotCliSummary: ProviderReportSummary = {
  ...copilotSummary,
  cliInputTokens: 120_000_000,
  cliOutputTokens: 8_000_000,
  cliRequestCount: 20_000
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
    expect(report.profiles).toHaveLength(5);
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

  it("normalizes mixed provider windows before reporting aggregate totals", () => {
    const shortCopilotWindow = {
      ...copilotCliSummary,
      reportEndDay: "2026-03-14",
      cliInputTokens: 14_000,
      cliOutputTokens: 0,
      cliRequestCount: 14
    } as unknown as ProviderReportSummary;

    const report = buildLocalModelReport([codexSummary, shortCopilotWindow]);
    const copilot = report.tokenObservedProviders.find(
      (provider) => provider.providerId === "github-copilot"
    );

    expect(report.windowDays).toBe(28);
    expect(copilot).toMatchObject({
      inputTokens: 28_000,
      requestCount: 28,
      windowDays: 28
    });
    expect(report.totalInputTokens).toBe(238_000);
    expect(report.totalPureComputeTokens).toBe(288_000);
    expect(report.dailyAvgComputeTokens).toBeCloseTo(288_000 / 28);
  });

  it("all 5 model profiles are present with expected tiers", () => {
    const report = buildLocalModelReport([codexSummary]);
    const tiers = report.profiles.map((p) => p.tier);
    expect(tiers).toContain("min");
    expect(tiers).toContain("recommended");
    expect(tiers).toContain("pro");
    expect(tiers).toContain("enterprise");
  });

  it("enriches model profiles with current Hugging Face candidate metadata", () => {
    const candidateSet: HuggingFaceCandidateSet = {
      candidateSetId: "hf-candidates-test",
      candidates: [
        {
          architecture: "qwen2",
          downloads: 8_100_000,
          lastModified: "2025-01-12T00:00:00.000Z",
          libraryName: "transformers",
          license: "apache-2.0",
          likes: 2_035,
          modelId: "Qwen/Qwen2.5-Coder-32B-Instruct",
          parameterCount: 32_763_900_000,
          pipelineTag: "text-generation",
          tags: ["text-generation", "code"],
          url: "https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct"
        }
      ],
      generatedAt: "2026-06-07T17:10:00.000Z",
      source: "huggingface_hub_api"
    };

    const report = buildLocalModelReport([codexSummary], null, candidateSet);
    const profile = report.profiles.find(
      (candidate) => candidate.hfRepoId === "Qwen/Qwen2.5-Coder-32B-Instruct"
    );

    expect(profile).toMatchObject({
      hfCandidateSetId: "hf-candidates-test",
      hfDownloads: 8_100_000,
      hfLastModified: "2025-01-12T00:00:00.000Z",
      hfLikes: 2_035,
      license: "apache-2.0"
    });
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

  // ── recommendedProfile / workloadGap ─────────────────────────────────────

  it("recommendedProfile is null when contextConfidence is insufficient_data", () => {
    // cursorSummary + copilotSummary: no token data → insufficient_data
    const report = buildLocalModelReport([cursorSummary, copilotSummary]);
    expect(report.contextConfidence).toBe("insufficient_data");
    expect(report.recommendedProfile).toBeNull();
    expect(report.workloadGap).toBeNull();
  });

  it("recommendedProfile is the lowest-tier (first) catalogue entry when all profiles fit", () => {
    // Codex: low token load → tiny context + tiny throughput → all 4 profiles fit
    const report = buildLocalModelReport([codexSummary]);
    expect(report.contextConfidence).toBe("low");
    expect(report.profiles.every((p) => p.contextFits && p.throughputFits)).toBe(true);
    // First in CATALOGUE order is Llama 3.1 8B (tier = "min")
    expect(report.recommendedProfile).not.toBeNull();
    expect(report.recommendedProfile!.tier).toBe("min");
    expect(report.recommendedProfile!.name).toMatch(/Llama/i);
    expect(report.workloadGap).toBeNull();
  });

  it("recommendedProfile is Qwen2.5-7B-1M when context need (500K) exceeds all 128K profiles", () => {
    // Distribution p99=300K → ceilToStandardContext → 500_000
    // Only Qwen2.5-7B-1M (contextWindow=1_010_000) fits context
    // codexSummary throughput ≈ 0.032 tok/s → all models satisfy throughput
    const highCtxDistribution = {
      generatedAt: "2025-01-01T00:00:00.000Z",
      sources: [],
      combined: { sampleCount: 100, mean: 200_000, p50: 150_000, p95: 280_000, p99: 300_000, max: 400_000 }
    };
    const report = buildLocalModelReport([codexSummary], highCtxDistribution as never);
    expect(report.contextConfidence).toBe("high");
    expect(report.estimatedContextWindowNeeded).toBe(500_000);
    // Four 128K profiles fail context; 7B-1M passes
    expect(report.profiles.filter((p) => p.contextFits)).toHaveLength(1);
    expect(report.recommendedProfile).not.toBeNull();
    expect(report.recommendedProfile!.contextWindow).toBeGreaterThanOrEqual(500_000);
    expect(report.recommendedProfile!.name).toMatch(/7B/i);
  });

  it("recommendedProfile is null and workloadGap.throughput=true when throughput exceeds all estimates", () => {
    // High token volume + high request count keeps context need tiny
    // Pure compute ≈ 60M tokens in 28 days → requiredTokensPerSec ≈ 74.4 tok/s > max(55)
    const highThroughputSummary = {
      ...codexSummary,
      inputTokens: 40_000_000,
      outputTokens: 20_000_000,
      requestCount: 10_000_000 // avg = 6 tokens → context = 4_096 (all fit context)
    } as unknown as typeof codexSummary;

    const report = buildLocalModelReport([highThroughputSummary]);
    expect(report.contextConfidence).toBe("low");
    expect(report.profiles.every((p) => p.contextFits)).toBe(true);
    expect(report.profiles.every((p) => !p.throughputFits)).toBe(true);
    expect(report.recommendedProfile).toBeNull();
    expect(report.workloadGap).toEqual({ context: false, throughput: true });
  });

  it("recommendedProfile is null and workloadGap has no universal blocker when axes split across profiles", () => {
    // Context need = 500K (only 7B-1M fits context)
    // Throughput need ≈ 11 tok/s (7B-1M at 5 tok/s fails, others at 40/50/55 tok/s pass)
    // → No single model satisfies both; workloadGap reflects no universal blocker
    const splitAxisDistribution = {
      generatedAt: "2025-01-01T00:00:00.000Z",
      sources: [],
      combined: { sampleCount: 100, mean: 200_000, p50: 150_000, p95: 280_000, p99: 300_000, max: 400_000 }
    };
    // 9M tokens / 28 days / 28_800 ≈ 11.2 tok/s  → 7B-1M (5 tok/s) fails; others pass throughput
    const splitAxisSummary = {
      ...codexSummary,
      inputTokens: 8_000_000,
      outputTokens: 1_000_000,
      requestCount: 10_000
    } as unknown as typeof codexSummary;

    const report = buildLocalModelReport([splitAxisSummary], splitAxisDistribution as never);
    expect(report.estimatedContextWindowNeeded).toBe(500_000);
    expect(report.requiredTokensPerSec).toBeGreaterThan(5);
    expect(report.requiredTokensPerSec).toBeLessThan(50);
    expect(report.recommendedProfile).toBeNull();
    // No axis is a universal blocker — both context (7B-1M ok) and throughput (128K models ok) have partial fits
    expect(report.workloadGap).toEqual({ context: false, throughput: false });
  });

  // ── alternativeProfiles ───────────────────────────────────────────────────

  it("alternativeProfiles is empty when contextConfidence is insufficient_data", () => {
    const report = buildLocalModelReport([cursorSummary, copilotSummary]);
    expect(report.contextConfidence).toBe("insufficient_data");
    expect(report.alternativeProfiles).toHaveLength(0);
  });

  it("alternativeProfiles contains all fitting profiles except the recommended one", () => {
    // Codex with tiny token load → all 5 profiles fit; recommended = Llama (min)
    // alternatives = the remaining 4 (14B, 32B, 72B, 7B-1M)
    const report = buildLocalModelReport([codexSummary]);
    expect(report.recommendedProfile).not.toBeNull();
    expect(report.recommendedProfile!.tier).toBe("min");
    expect(report.alternativeProfiles.length).toBe(4);
    expect(report.alternativeProfiles.map((p) => p.tier)).toEqual(
      expect.arrayContaining(["recommended", "pro", "enterprise"])
    );
    // recommended profile must not appear in alternativeProfiles
    expect(report.alternativeProfiles.map((p) => p.hfRepoId)).not.toContain(
      report.recommendedProfile!.hfRepoId
    );
  });

  it("alternativeProfiles is empty when only one profile fits", () => {
    const highCtxDistribution = {
      generatedAt: "2025-01-01T00:00:00.000Z",
      sources: [],
      combined: { sampleCount: 100, mean: 200_000, p50: 150_000, p95: 280_000, p99: 300_000, max: 400_000 }
    };
    const report = buildLocalModelReport([codexSummary], highCtxDistribution as never);
    // Only 7B-1M fits the 500K context need
    expect(report.recommendedProfile).not.toBeNull();
    expect(report.alternativeProfiles).toHaveLength(0);
  });

  it("alternativeProfiles is empty when no profile fits", () => {
    const highThroughputSummary = {
      ...codexSummary,
      inputTokens: 40_000_000,
      outputTokens: 20_000_000,
      requestCount: 10_000_000
    } as unknown as typeof codexSummary;
    const report = buildLocalModelReport([highThroughputSummary]);
    expect(report.recommendedProfile).toBeNull();
    expect(report.alternativeProfiles).toHaveLength(0);
  });

  it("scopes model-profile sizing to the selected tenant pipeline instead of inheriting all-provider traffic", () => {
    const allTraffic = buildLocalModelReport([copilotCliSummary, claudeSummary, codexSummary]);
    const repoAutomation = buildLocalModelReport(
      [copilotCliSummary, claudeSummary, codexSummary],
      null,
      null,
      null,
      { workloadScopeId: "repo_automation_project" }
    );

    expect(allTraffic.selectedWorkloadScope.id).toBe("all_provider_traffic");
    expect(repoAutomation.selectedWorkloadScope.id).toBe("repo_automation_project");
    expect(repoAutomation.tenant).toMatchObject({ tenantId: "kdtix", tenantName: "KDTIX" });
    expect(repoAutomation.requiredTokensPerSec).toBeLessThan(allTraffic.requiredTokensPerSec);
    expect(repoAutomation.requiredTokensPerSec).not.toBe(allTraffic.requiredTokensPerSec);
    expect(repoAutomation.tokenObservedProviders.map((provider) => provider.providerId)).not.toContain(
      "github-copilot"
    );
  });

  it("scoped throughput uses each included provider window instead of the first summary window", () => {
    const shortWindowCodex = {
      ...codexSummary,
      inputTokens: 10_000,
      outputTokens: 0,
      reportEndDay: "2026-03-28",
      reportStartDay: "2026-03-28"
    } as unknown as ProviderReportSummary;
    const longWindowCopilotCli = {
      ...copilotCliSummary,
      cliInputTokens: 2_800_000,
      cliOutputTokens: 0,
      reportEndDay: "2026-03-28",
      reportStartDay: "2026-03-01"
    } as unknown as ProviderReportSummary;

    const report = buildLocalModelReport(
      [shortWindowCodex, longWindowCopilotCli],
      null,
      null,
      null,
      { workloadScopeId: "copilot_cli" }
    );

    expect(report.windowDays).toBe(28);
    expect(report.tokenObservedProviders).toEqual([
      expect.objectContaining({
        providerId: "github-copilot",
        windowDays: 28
      })
    ]);
    expect(report.dailyAvgComputeTokens).toBe(100_000);
    expect(report.requiredTokensPerSec).toBeCloseTo(100_000 / 28_800, 3);
  });

  it("does not double-scale scoped request context by the workload multiplier", () => {
    const heavyCopilotCli = {
      ...copilotCliSummary,
      cliInputTokens: 1_000_000_000,
      cliOutputTokens: 0,
      cliRequestCount: 10_000
    } as unknown as ProviderReportSummary;

    const report = buildLocalModelReport([heavyCopilotCli], null, null, null, {
      workloadScopeId: "copilot_cli"
    });

    expect(report.avgTokensPerObservedRequest).toBe(100_000);
    expect(report.estimatedContextWindowNeeded).toBe(500_000);
  });

  it("downgrades scoped context confidence when only global local-session evidence is available", () => {
    const globalDistribution = {
      generatedAt: "2025-01-01T00:00:00.000Z",
      sources: [],
      combined: { sampleCount: 100, mean: 200_000, p50: 150_000, p95: 280_000, p99: 300_000, max: 400_000 }
    };

    const report = buildLocalModelReport(
      [copilotCliSummary, claudeSummary, codexSummary],
      globalDistribution as never,
      null,
      null,
      { workloadScopeId: "copilot_cli" }
    );

    expect(report.selectedWorkloadScope.id).toBe("copilot_cli");
    expect(report.contextConfidence).toBe("low");
    expect(report.contextEvidenceSource).toBe("global_local_session_distribution_scaled_to_scope");
  });

  it("exposes tenant pipeline scope options for future multi-tenant reports", () => {
    const report = buildLocalModelReport([codexSummary], null, null, null, {
      workloadScopeId: "agent_memory"
    });

    expect(report.selectedWorkloadScope).toMatchObject({
      id: "agent_memory",
      label: "Agent Memory",
      tenantId: "kdtix"
    });
    expect(report.availableWorkloadScopes.map((scope) => scope.id)).toEqual([
      "all_provider_traffic",
      "repo_automation_project",
      "agent_memory",
      "copilot_cli",
      "agentic_worker",
      "reviewer"
    ]);
  });

  it("applies forensic synthesis as direct routing guidance for sizing and profiles", () => {
    const reportWithoutForensics = buildLocalModelReport([codexSummary]);
    const reportWithForensics = buildLocalModelReport(
      [codexSummary],
      null,
      null,
      forensicTieredRoutingRun
    );

    expect(reportWithoutForensics.appliedForensicGuidance).toBeNull();
    expect(reportWithForensics.appliedForensicGuidance).toMatchObject({
      appliedSections: [
        "Local model migration sizing",
        "Server sizing heuristics",
        "On-prem model profiles"
      ],
      confidence: 0.95,
      localWorkloadScope: "short-context Copilot-style completion workloads",
      reviewerCount: 7,
      routingStrategy: "tiered_hybrid",
      runId: "dynamic-forensic-test",
      status: "completed"
    });
    expect(reportWithForensics.appliedForensicGuidance?.hostedWorkloadScope).toContain(
      "tail-context"
    );
    expect(reportWithForensics.appliedForensicGuidance?.impactSummary).toContain(
      "partial local migration"
    );
    expect(reportWithForensics.appliedForensicGuidance?.blockingFindings).toEqual([
      expect.objectContaining({
        severity: "high",
        title: "Claude and Codex tail workloads exceed candidate context budgets"
      })
    ]);
    expect(
      reportWithForensics.profiles.find((profile) =>
        profile.hfRepoId.includes("Llama-3.1-8B")
      )?.forensicInterpretation
    ).toContain("short-context local candidate");
    expect(
      reportWithForensics.profiles.find((profile) =>
        profile.hfRepoId.includes("7B-Instruct-1M")
      )?.forensicInterpretation
    ).toContain("long-context candidate screen");
  });
});

const forensicTieredRoutingRun = {
  parentSynthesis: {
    confidence: 0.95,
    dissentingFindings: [
      {
        details:
          "Claude and Codex snapshots show tail context that breaches every local candidate.",
        evidenceRefs: ["dynamic-usage-claude-2026-06-08", "hf-candidates-test"],
        severity: "high",
        title: "Claude and Codex tail workloads exceed candidate context budgets"
      }
    ],
    recommendation:
      "Adopt a tiered routing policy: shift the short-context Copilot completion band to a 7B-class local candidate while keeping Claude/Codex tail-context turns and Cursor agentic turns on hosted providers.",
    reviewerCount: 7
  },
  runId: "dynamic-forensic-test",
  status: "completed",
  updatedAt: "2026-06-08T23:44:56.380Z"
};
