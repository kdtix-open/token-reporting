import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { seededCursorReportSummary } from "../../providers/cursor/seed";
import { seededGitHubCopilotReportSummary } from "../../providers/githubCopilot/seed";
import { LocalInfrastructureSizingPanel } from "../LocalInfrastructureSizingPanel";

afterEach(() => cleanup());

describe("LocalInfrastructureSizingPanel", () => {
  it("disables budget scope selection when no change handler is provided", () => {
    render(
      <LocalInfrastructureSizingPanel
        distribution={null}
        forensicRun={null}
        huggingFaceCandidateSet={null}
        summaries={[seededCursorReportSummary, seededGitHubCopilotReportSummary]}
      />
    );

    expect(screen.getByRole("combobox", { name: "Budget math scope" })).toBeDisabled();
  });

  it("keeps budget scope selection interactive when a change handler is provided", () => {
    render(
      <LocalInfrastructureSizingPanel
        distribution={null}
        forensicRun={null}
        huggingFaceCandidateSet={null}
        onBudgetScopeChange={vi.fn()}
        summaries={[seededCursorReportSummary, seededGitHubCopilotReportSummary]}
      />
    );

    expect(screen.getByRole("combobox", { name: "Budget math scope" })).not.toBeDisabled();
  });
});
