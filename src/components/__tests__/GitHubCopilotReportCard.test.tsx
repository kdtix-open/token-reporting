import { buildSpendProjection } from "../../lib/projections";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GitHubCopilotReportCard } from "../GitHubCopilotReportCard";

const zeroProjection = buildSpendProjection([], "seat_based");

const baseSummary = {
  providerId: "github-copilot" as const,
  providerLabel: "GitHub Copilot" as const,
  organization: "kdtix-open",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  downloadCount: 2,
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: null, label: "interactions", unit: "requests" as const },
  totalInteractions: null,
  totalCodeGenerations: null,
  totalAcceptances: null,
  totalLinesAdded: null,
  totalLocSuggested: null,
  activeUserCount: null,
  billedSeats: null,
  estimatedMonthlyCostUsd: null,
  spendProjection: zeroProjection,
  cliInputTokens: null,
  cliOutputTokens: null,
  cliRequestCount: null,
  cliSessionCount: null,
  cliModelsUsed: [] as string[],
  perModelBreakdown: [] as never[]
};

describe("GitHubCopilotReportCard", () => {
  it("renders the summary details for the latest report", () => {
    render(<GitHubCopilotReportCard summary={baseSummary} />);

    expect(screen.getByText("GitHub Copilot")).toBeInTheDocument();
    expect(screen.getByText("kdtix-open")).toBeInTheDocument();
    expect(screen.getByText("2026-03-01 to 2026-03-28")).toBeInTheDocument();
    expect(screen.getByText("2 signed downloads")).toBeInTheDocument();
    expect(screen.getByText("28-day window")).toBeInTheDocument();
  });

  it("does not render usage metrics when they are null", () => {
    render(<GitHubCopilotReportCard summary={baseSummary} />);

    expect(screen.queryByText("Interactions")).not.toBeInTheDocument();
    expect(screen.queryByText("Active Users")).not.toBeInTheDocument();
  });

  it("renders usage metrics when they are populated", () => {
    render(
      <GitHubCopilotReportCard
        summary={{
          ...baseSummary,
          totalInteractions: 120,
          totalCodeGenerations: 450,
          totalAcceptances: 310,
          totalLinesAdded: 2800,
          totalLocSuggested: 3500,
          activeUserCount: 5
        }}
      />
    );

    expect(screen.getByText("Interactions")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("Active Users")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
