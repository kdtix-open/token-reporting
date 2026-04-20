import { buildSpendProjection } from "../../lib/projections";
import type { GitHubCopilotLatestUsersReport, GitHubCopilotReportSummary } from "./types";

const SEATS = 5;
const MONTHLY_COST = SEATS * 19; // Business plan $19/seat
const DAILY_COST = MONTHLY_COST / 30;

const seedDailyBreakdown = Array.from({ length: 28 }, (_, i) => ({
  date: `2026-03-${String(i + 1).padStart(2, "0")}`,
  costUsd: DAILY_COST
}));

export const seededGitHubCopilotLatestUsersReport: GitHubCopilotLatestUsersReport =
  {
    download_links: [
      "https://example.com/github-copilot-users-28-day-part-1.json",
      "https://example.com/github-copilot-users-28-day-part-2.json"
    ],
    report_start_day: "2026-03-01",
    report_end_day: "2026-03-28",
    billing_seats: { total_seats: SEATS, plan: "business" }
  };

export const seededGitHubCopilotReportSummary: GitHubCopilotReportSummary = {
  providerId: "github-copilot",
  providerLabel: "GitHub Copilot",
  organization: "kdtix-open",
  reportStartDay: "2026-03-01",
  reportEndDay: "2026-03-28",
  downloadCount: 2,
  reportAgeLabel: "28-day window",
  comparisonMetric: { value: null, label: "interactions", unit: "requests" },
  totalInteractions: null,
  totalCodeGenerations: null,
  totalAcceptances: null,
  totalLinesAdded: null,
  totalLocSuggested: null,
  activeUserCount: null,
  billedSeats: SEATS,
  estimatedMonthlyCostUsd: MONTHLY_COST,
  spendProjection: buildSpendProjection(
    seedDailyBreakdown,
    "seat_based",
    `${SEATS} seats × $19/seat/mo (business)`
  ),
  cliInputTokens: null,
  cliOutputTokens: null,
  cliRequestCount: null,
  cliSessionCount: null,
  cliModelsUsed: [],
  perModelBreakdown: []
};
