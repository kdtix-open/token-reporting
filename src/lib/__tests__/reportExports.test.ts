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
      expect(text).toContain("Server sizing heuristics");
      expect(text).toContain("On-prem model profiles");
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
          huggingFaceCandidateSetId: "hf-candidates-test",
          profiles: expect.arrayContaining([
            expect.objectContaining({
              hfRepoId: "Qwen/Qwen2.5-7B-Instruct-1M"
            })
          ])
        },
        providerSnapshots: expect.any(Array),
        spendProjections: expect.any(Array)
      },
      rows: expect.any(Array)
    });
  });

  it("createReportExport_XlsxFormat_IncludesReportBreakdownRows", () => {
    const result = createReportExport(richReportContext(), "xlsx");
    const workbookText = new TextDecoder().decode(result.payload as Uint8Array);

    expect(workbookText).toContain("Report breakdowns");
    expect(workbookText).toContain("Spend projections");
    expect(workbookText).toContain("Local model migration sizing");
    expect(workbookText).toContain("Server sizing heuristics");
    expect(workbookText).toContain("On-prem model profiles");
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
