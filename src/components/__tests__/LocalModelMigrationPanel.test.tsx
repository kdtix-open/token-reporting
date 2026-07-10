import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { seededCursorReportSummary } from "../../providers/cursor/seed";
import { seededGitHubCopilotReportSummary } from "../../providers/githubCopilot/seed";
import { LocalModelMigrationPanel } from "../LocalModelMigrationPanel";

describe("LocalModelMigrationPanel", () => {
  it("keeps tenant scope selector visible when selected scope has no provider telemetry", () => {
    render(
      <LocalModelMigrationPanel
        distribution={null}
        forensicRun={null}
        huggingFaceCandidateSet={null}
        onWorkloadScopeChange={vi.fn()}
        summaries={[seededCursorReportSummary, seededGitHubCopilotReportSummary]}
        workloadScopeId="agent_memory"
      />
    );

    expect(screen.getByRole("combobox", { name: "Tenant pipeline scope" })).toHaveValue(
      "agent_memory"
    );
    expect(screen.getByText("Agent Memory")).toBeInTheDocument();
    expect(screen.getAllByText(/No provider telemetry matched Agent Memory/).length).toBeGreaterThan(0);
  });

  it("hides global forensic consensus when selected scope has no provider telemetry", () => {
    render(
      <LocalModelMigrationPanel
        distribution={null}
        forensicRun={{
          parentSynthesis: {
            confidence: 0.82,
            recommendation: "Use hosted guardrails for unmatched pipelines.",
            reviewerCount: 2
          },
          runId: "dynamic-forensic-global",
          status: "completed"
        }}
        huggingFaceCandidateSet={null}
        onWorkloadScopeChange={vi.fn()}
        summaries={[seededCursorReportSummary, seededGitHubCopilotReportSummary]}
        workloadScopeId="agent_memory"
      />
    );

    expect(screen.getAllByText(/No provider telemetry matched Agent Memory/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Forensic reviewer consensus")).not.toBeInTheDocument();
    expect(screen.queryByText("Use hosted guardrails for unmatched pipelines.")).not.toBeInTheDocument();
  });

  it("does not apply global forensic guidance to a scoped provider lane", () => {
    render(
      <LocalModelMigrationPanel
        distribution={null}
        forensicRun={{
          parentSynthesis: {
            confidence: 0.82,
            recommendation: "Use hosted guardrails for unmatched pipelines.",
            reviewerCount: 2
          },
          runId: "dynamic-forensic-global",
          status: "completed"
        }}
        huggingFaceCandidateSet={null}
        onWorkloadScopeChange={vi.fn()}
        summaries={[
          {
            cliInputTokens: 1_000_000,
            cliOutputTokens: 250_000,
            cliRequestCount: 100,
            comparisonMetric: { label: "requests", unit: "requests", value: 100 },
            providerId: "github-copilot",
            providerLabel: "GitHub Copilot",
            reportAgeLabel: "28-day window",
            reportEndDay: "2026-03-28",
            reportStartDay: "2026-03-01",
            spendProjection: {
              costSource: "actual",
              dailyAvgUsd: 0,
              dailyBreakdown: [],
              projectedAnnualUsd: 0,
              projectedMonthlyUsd: 0,
              totalUsd: 0,
              trend: "insufficient_data",
              trendedAnnualUsd: null,
              trendedMonthlyUsd: null,
              windowDays: 28
            }
          } as never
        ]}
        workloadScopeId="copilot_cli"
      />
    );

    expect(screen.getByText(/Token load · Copilot CLI/)).toBeInTheDocument();
    expect(screen.queryByText(/Forensics-applied sizing interpretation/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Profile interpretation applied from reviewers/)).not.toBeInTheDocument();
    expect(screen.queryByText("Forensic reviewer consensus")).not.toBeInTheDocument();
  });
});
