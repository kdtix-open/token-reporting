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
    expect(screen.getByText(/No provider telemetry matched Agent Memory/)).toBeInTheDocument();
  });
});
