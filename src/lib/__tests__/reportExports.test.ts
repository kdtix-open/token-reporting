import { describe, expect, it } from "vitest";

import {
  buildReportExportRows,
  createReportExport,
  generateDatabaseSql
} from "../reportExports";
import type { HuggingFaceCandidateSet } from "../huggingFaceCandidates";
import type { LocalSessionDistribution } from "../localSessionDistribution";
import { seededClaudeReportSummary } from "../../providers/claude/seed";
import { seededCodexReportSummary } from "../../providers/codex/seed";
import { seededCursorReportSummary } from "../../providers/cursor/seed";
import { seededGitHubCopilotReportSummary } from "../../providers/githubCopilot/seed";
import type { ProviderReportSummary } from "../types";

describe("reportExports", () => {
  it("buildReportExportRows_NormalizesProviderSummaries_ReturnsAggregateRows", () => {
    const rows = buildReportExportRows([
      seededGitHubCopilotReportSummary,
      seededCursorReportSummary,
      seededClaudeReportSummary,
      seededCodexReportSummary
    ]);

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      providerId: "github-copilot",
      providerName: "GitHub Copilot",
      billingType: "SEAT-BASED",
      modelName: "aggregate-28-day"
    });
    expect(rows[2]).toMatchObject({
      providerId: "claude",
      providerName: "Claude",
      billingType: "ACTUAL",
      cacheReadTokens: 9_800_000,
      cacheCreationTokens: 2_100_000
    });
  });

  it("buildReportExportRows_ReconcilesCliOutputAndPreservesProviderWindow", () => {
    const rows = buildReportExportRows([
      {
        ...seededGitHubCopilotReportSummary,
        cliInputTokens: 1_000,
        cliOutputTokens: 250,
        cliRequestCount: 10,
        outputTokens: 0
      } as unknown as ProviderReportSummary,
      {
        ...seededCursorReportSummary,
        reportEndDay: "2026-05-25",
        reportStartDay: "2026-04-01"
      }
    ]);

    expect(rows[0]).toMatchObject({
      inputTokens: 1_000,
      modelName: "aggregate-28-day",
      outputTokens: 250
    });
    expect(rows[1]).toMatchObject({
      modelId: "cursor:aggregate-55-day",
      modelName: "aggregate-55-day"
    });
  });

  it("generateDatabaseSql_SqliteDialect_CreatesIdempotentNormalizedScript", () => {
    const rows = buildReportExportRows([seededClaudeReportSummary]);
    const sql = generateDatabaseSql(rows, "sqlite");

    expect(sql).toContain("Programmatic injection note");
    expect(sql).toContain("sqlite: \"INSERT INTO ... ON CONFLICT(id) DO UPDATE SET\"");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS providers");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS models");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS usage_snapshots");
    expect(sql).toContain("ON CONFLICT(id) DO UPDATE SET");
    expect(sql).toContain("'claude'");
    expect(sql).toContain("9800000");
  });

  it("createReportExport_DatabaseFormat_UsesSqlExtensionAndMimeType", () => {
    const result = createReportExport(
      [seededClaudeReportSummary],
      "database",
      "postgresql"
    );

    expect(result.filename).toMatch(/token-report-database-\d{4}-\d{2}-\d{2}\.sql/);
    expect(result.mimeType).toBe("application/sql");
    expect(result.payload).toContain("ON CONFLICT (id) DO UPDATE SET");
  });

  it("createReportExport_PdfAndDocxFormats_IncludeRichWebsiteReportSections", () => {
    const context = richReportContext();
    const pdf = createReportExport(context, "pdf");
    const docx = createReportExport(context, "docx");
    const pdfText = new TextDecoder().decode(pdf.payload as Uint8Array);
    const docxText = new TextDecoder().decode(docx.payload as Uint8Array);

    for (const text of [pdfText, docxText]) {
      expect(text).toContain("Spend projections");
      expect(text).toContain("Local model migration sizing");
      expect(text).toContain("Tenant: KDTIX");
      expect(text).toContain("Pipeline scope: All KDTIX provider traffic");
      expect(text).toContain("Context evidence source: global_local_session_distribution");
      expect(text).toContain("Server sizing heuristics");
      expect(text).toContain("On-prem model profiles");
      expect(text).toContain("Local AI Infrastructure Sizing");
      expect(text).toContain("Executive Hardware Decision Summary");
      expect(text).toContain("Hardware Budget Required by Scope");
      expect(text).toContain("first-server shadow/canary");
      expect(text).toContain("$150K is not enough for all-provider replacement");
      expect(text).toContain("Copilot Dominance Warning");
      expect(text).toContain("Target first-server migration objective");
      expect(text).toContain("Estimated safe initial routing");
      expect(text).toContain("Estimated full-workload capacity");
      expect(text).toContain("Payback from cloud displacement");
      expect(text).toContain("Payback from reserved-capacity product revenue");
      expect(text).toContain("Workload scope sizing");
      expect(text).toContain("Financial payback model");
      expect(text).toContain("Benchmark gates");
      expect(text).toContain("First-server recommendation");
      expect(text).toContain("Provider traffic normalized");
      expect(text).toContain("Forensic reviewer consensus");
      expect(text).toContain("Applied forensic guidance");
      expect(text).toContain("partial local migration");
      expect(text).toContain("Route short-context completions locally");
      expect(text).toContain("hf-candidates-test");
    }
  });

  it("createReportExport_JsonFormat_IncludesStructuredReportBreakdowns", () => {
    const result = createReportExport(richReportContext(), "json");
    const parsed = JSON.parse(result.payload as string) as Record<string, unknown>;

    expect(parsed).toMatchObject({
      generatedAt: expect.any(String),
      report: {
        forensic: {
          parentSynthesis: {
            recommendation: "Route short-context completions locally; keep tail-context agents hosted."
          },
          runId: "dynamic-forensic-test",
          status: "completed"
        },
        localModelMigration: {
          appliedForensicGuidance: {
            impactSummary: expect.stringContaining("partial local migration"),
            routingStrategy: "tiered_hybrid"
          },
          contextConfidence: "high",
          contextEvidenceSource: "global_local_session_distribution",
          huggingFaceCandidateSetId: "hf-candidates-test",
          selectedWorkloadScope: {
            id: "all_provider_traffic",
            label: "All KDTIX provider traffic"
          },
          tenant: {
            tenantId: "kdtix",
            tenantName: "KDTIX"
          },
          profiles: expect.arrayContaining([
            expect.objectContaining({
              hfRepoId: "Qwen/Qwen2.5-7B-Instruct-1M"
            })
          ])
        },
          localInfrastructureSizing: {
            executiveSummary: {
              firstQuoteToRequest: expect.stringContaining("2U dual RTX PRO 6000"),
              paybackFromCloudDisplacement: expect.stringContaining("Cloud spend alone")
            },
          hardwareBudgetScenarios: expect.arrayContaining([
            expect.objectContaining({
              scope: "all_provider_traffic",
              replacementGoal: "steady_state_replacement",
              fullReplacementAllowed: false
            })
          ]),
          hardwareBudgetSummary: {
            cfoSummaryLines: expect.arrayContaining([
              "$150K is not enough for all-provider replacement."
            ]),
            copilotDominanceWarning: expect.stringContaining(
              "GitHub Copilot CLI token telemetry is not present"
            ),
            selectedScope: "repo_automation_project"
          },
          financials: {
            notes: expect.arrayContaining([
              expect.stringContaining("Seat-based provider costs are not directly displaced")
            ]),
            paybackMonthsRevenueCapacity: expect.any(Number)
          },
          localCoverageSummary: {
            targetFirstServerCoveragePct: 30,
            safeInitialProductionRoutingPct: 10
          },
          localMigrationPlan: {
            fullLocalReplacementRecommended: false
          },
          recommendedFirstServer: {
            recommendationKind: "preferred_first_quote"
          },
          routeClasses: expect.arrayContaining([
            expect.objectContaining({
              contextStatsWarning: "short-context candidate; route-specific context pending",
              id: "short_context_coding"
            }),
            expect.objectContaining({
              id: "long_context_tail",
              kind: "cross_cutting_overlay",
              recommendedRouting: "cloud"
            })
          ]),
          benchmarkGates: expect.arrayContaining([
            expect.objectContaining({
              gateId: "shadow_replay_gate",
              status: "not_started"
            })
          ]),
          workloadScopeConfig: {
            defaultSizingScope: "repo_automation_project"
          }
        },
        providerSnapshots: expect.any(Array),
        spendProjections: expect.any(Array)
      },
      rows: expect.any(Array)
    });
    const localInfra = (parsed as {
      report: {
        localInfrastructureSizing: {
          localCoverageSummary: {
            estimatedFullWorkloadCapacityPct: number;
            targetFirstServerCoveragePct: number;
          };
        };
      };
    }).report.localInfrastructureSizing;
    expect(
      localInfra.localCoverageSummary.estimatedFullWorkloadCapacityPct
    ).not.toBe(localInfra.localCoverageSummary.targetFirstServerCoveragePct);
  });

  it("createReportExport_JsonFormat_PreservesSelectedTenantPipelineScope", () => {
    const result = createReportExport(
      {
        ...richReportContext(),
        localModelWorkloadScopeId: "repo_automation_project"
      },
      "json"
    );
    const parsed = JSON.parse(result.payload as string) as {
      report: {
        localInfrastructureSizing: {
          workloadSummary: {
            currentProjectLaneP95Context: number | null;
            currentProjectLaneP99Context: number | null;
          };
        };
        localModelMigration: {
          appliedForensicGuidance: null;
          requiredTokensPerSec: number;
          selectedWorkloadScope: {
            allocationMode: string;
            id: string;
            label: string;
            providerWeights: Record<string, number>;
          };
          tenant: {
            tenantId: string;
            tenantName: string;
          };
        };
      };
    };

    expect(parsed.report.localModelMigration.tenant).toEqual({
      tenantId: "kdtix",
      tenantName: "KDTIX"
    });
    expect(parsed.report.localModelMigration.selectedWorkloadScope).toMatchObject({
      allocationMode: "estimated",
      id: "repo_automation_project",
      label: "Repo Automation",
      providerWeights: {
        claude: 0.45,
        codex: 0.25,
        cursor: 0.05
      }
    });
    expect(parsed.report.localModelMigration.requiredTokensPerSec).toBeLessThan(100);
    expect(parsed.report.localModelMigration.appliedForensicGuidance).toBeNull();
    expect(parsed.report.localInfrastructureSizing.workloadSummary).toMatchObject({
      currentProjectLaneP95Context: 835_000,
      currentProjectLaneP99Context: 1_000_000
    });
  });

  it("createReportExport_CsvAndYamlFormats_IncludeInfrastructureDecisionBreakdowns", () => {
    const csv = createReportExport(richReportContext(), "csv").payload as string;
    const yaml = createReportExport(richReportContext(), "yaml").payload as string;

    expect(csv).toContain("local_infrastructure_executive_summary");
    expect(csv).toContain("local_infrastructure_coverage_summary");
    expect(csv).toContain("estimated_full_workload_capacity_pct");
    expect(csv).toContain("local_infrastructure_workload_scopes");
    expect(csv).toContain("local_infrastructure_hardware_budget_summary");
    expect(csv).toContain("local_infrastructure_hardware_budget_scenarios");
    expect(csv).toContain("all_provider_compute_tps");
    expect(csv).toContain("repo_automation_compute_tps");
    expect(csv).toContain("local_model_migration,tenant,tenant_id,kdtix");
    expect(csv).toContain("local_infrastructure_financials");
    expect(csv).toContain("local_infrastructure_benchmark_gates");
    expect(csv).toContain("context_stats_warning");
    expect(csv).toContain("quote_priority");
    expect(csv).toContain("context_evidence_source");
    expect(csv).toContain("global_local_session_distribution");

    expect(yaml).toContain("localCoverageSummary:");
    expect(yaml).toContain("estimatedFullWorkloadCapacityPct:");
    expect(yaml).toContain("workloadScopeSummaries:");
    expect(yaml).toContain("hardwareBudgetSummary:");
    expect(yaml).toContain("hardwareBudgetScenarios:");
    expect(yaml).toContain("allProviderComputeTps:");
    expect(yaml).toContain("repoAutomationComputeTps:");
    expect(yaml).toContain("financials:");
    expect(yaml).toContain("executiveSummary:");
    expect(yaml).toContain("benchmarkGates:");
    expect(yaml).toContain("contextStatsWarning:");
    expect(yaml).toContain("quotePriority:");
    expect(yaml).toContain('contextEvidenceSource: "global_local_session_distribution"');
  });

  it("createReportExport_XlsxFormat_IncludesReportBreakdownRows", () => {
    const result = createReportExport(richReportContext(), "xlsx");
    const workbookText = new TextDecoder().decode(result.payload as Uint8Array);

    expect(workbookText).toContain("Report breakdowns");
    expect(workbookText).toContain("Spend projections");
    expect(workbookText).toContain("Local model migration sizing");
    expect(workbookText).toContain("Server sizing heuristics");
    expect(workbookText).toContain("Context evidence source");
    expect(workbookText).toContain("On-prem model profiles");
    expect(workbookText).toContain("Local AI Infrastructure Sizing");
    expect(workbookText).toContain("Executive Hardware Decision Summary");
    expect(workbookText).toContain("Hardware Budget Required by Scope");
    expect(workbookText).toContain("$150K is not enough for all-provider replacement");
    expect(workbookText).toContain("Target first-server migration objective");
    expect(workbookText).toContain("Estimated safe initial routing");
    expect(workbookText).toContain("Estimated full-workload capacity");
    expect(workbookText).toContain("Payback from cloud displacement");
    expect(workbookText).toContain("Workload scope sizing");
    expect(workbookText).toContain("Financial payback model");
    expect(workbookText).toContain("Benchmark gates");
    expect(workbookText).toContain("First-server recommendation");
    expect(workbookText).toContain("Provider traffic normalized");
    expect(workbookText).toContain("Forensic reviewer consensus");
    expect(workbookText).toContain("Applied forensic guidance");
    expect(workbookText).toContain("partial local migration");
    expect(workbookText).toContain("Route short-context completions locally");
    expect(workbookText).toContain("hf-candidates-test");
  });
});

function richReportContext() {
  return {
    distribution: localDistribution,
    forensicRun,
    huggingFaceCandidateSet,
    summaries: [
      seededGitHubCopilotReportSummary,
      seededCursorReportSummary,
      seededClaudeReportSummary,
      seededCodexReportSummary
    ]
  };
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
  sources: [
    {
      contextTokens: {
        max: 991_000,
        mean: 116_800,
        p50: 100_000,
        p95: 835_000,
        p99: 939_000
      },
      modelsSeen: ["gpt-5"],
      observedContextWindows: [1_000_000],
      sampleCount: 3_666,
      source: "codex",
      totalTokens: {
        max: 991_000,
        mean: 116_800,
        p50: 100_000,
        p95: 835_000,
        p99: 939_000
      }
    }
  ]
};

const huggingFaceCandidateSet: HuggingFaceCandidateSet = {
  candidateSetId: "hf-candidates-test",
  candidates: [
    {
      architecture: "qwen2",
      downloads: 82_714,
      lastModified: "2025-01-29T12:39:09.000Z",
      libraryName: "transformers",
      license: "apache-2.0",
      likes: 371,
      modelId: "Qwen/Qwen2.5-7B-Instruct-1M",
      parameterCount: 7_615_616_512,
      pipelineTag: "text-generation",
      tags: ["text-generation", "license:apache-2.0"],
      url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-1M"
    }
  ],
  generatedAt: "2026-06-08T23:44:56.739Z",
  source: "huggingface_hub_api"
};

const forensicRun = {
  bridgeDispatch: {
    executionKind: "forensic",
    status: "completed"
  },
  parentSynthesis: {
    confidence: 0.95,
    dissentingFindings: [
      {
        details: "Tail context remains too large for the candidate set.",
        evidenceRefs: ["dynamic-usage-claude-2026-06-08", "hf-candidates-test"],
        severity: "high",
        title: "Tail workloads exceed local context"
      }
    ],
    recommendation:
      "Route short-context completions locally; keep tail-context agents hosted.",
    reviewerCount: 7
  },
  reviewerArtifacts: [
    {
      artifactUri: "local://token-reporting/forensics/dynamic-forensic-test/reviewers/gpt.json",
      bridgeProviderKind: "codex",
      reviewerModel: "gpt",
      status: "completed"
    }
  ],
  runId: "dynamic-forensic-test",
  status: "completed",
  updatedAt: "2026-06-08T23:44:56.380Z"
};
