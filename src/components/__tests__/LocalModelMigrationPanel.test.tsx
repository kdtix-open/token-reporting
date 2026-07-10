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
});
