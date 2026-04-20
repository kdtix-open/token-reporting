import { buildSpendProjection } from "../../lib/projections";
import type {
  GitHubCopilotPerModelBreakdown,
  GitHubCopilotReportSummary,
  GitHubCopilotUsageRecord,
  GitHubCopilotUsageSummary
} from "./types";

/** Seat cost per month by plan */
const SEAT_COST_PER_MONTH: Record<"business" | "enterprise", number> = {
  business: 19,
  enterprise: 39
};

interface CreateSummaryArgs {
  organization: string;
  report: {
    download_links: string[];
    report_start_day: string;
    report_end_day: string;
    usage_summary?: GitHubCopilotUsageSummary;
    billing_seats?: { total_seats: number; plan: "business" | "enterprise" };
  };
}

export function createGitHubCopilotReportSummary({
  organization,
  report
}: CreateSummaryArgs): GitHubCopilotReportSummary {
  const billedSeats = report.billing_seats?.total_seats ?? null;
  const plan = report.billing_seats?.plan ?? "business";
  const seatCostPerMonth = SEAT_COST_PER_MONTH[plan];
  const estimatedMonthlyCostUsd =
    billedSeats !== null ? billedSeats * seatCostPerMonth : null;

  // Seat cost is flat: same each day of the month
  const dailyCost = estimatedMonthlyCostUsd !== null ? estimatedMonthlyCostUsd / 30 : 0;
  const windowDays = 28;
  const dailyBreakdown = Array.from({ length: windowDays }, (_, i) => {
    const d = new Date(report.report_start_day + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      costUsd: dailyCost
    };
  });

  const spendProjection = buildSpendProjection(
    dailyBreakdown,
    "seat_based",
    `${billedSeats ?? "?"} seats × $${seatCostPerMonth}/seat/mo (${plan})`
  );

  const usage = report.usage_summary;
  const cliInputTokens = usage?.totalCliInputTokens ?? null;
  const cliOutputTokens = usage?.totalCliOutputTokens ?? null;
  const cliRequestCount = usage?.totalCliRequests ? usage.totalCliRequests : null;
  const cliSessionCount = usage?.totalCliSessions ? usage.totalCliSessions : null;
  const cliModelsUsed = usage?.cliModelsUsed ?? [];
  const perModelBreakdown = buildPerModelBreakdown({
    modelFeatureBreakdown: usage?.modelFeatureBreakdown ?? [],
    totalCliInputTokens: cliInputTokens ?? 0,
    totalCliOutputTokens: cliOutputTokens ?? 0,
    totalCliRequests: cliRequestCount ?? 0,
    totalInteractions: usage?.totalInteractions ?? 0,
    estimatedMonthlyCostUsd
  });

  return {
    providerId: "github-copilot",
    providerLabel: "GitHub Copilot",
    organization,
    reportStartDay: report.report_start_day,
    reportEndDay: report.report_end_day,
    downloadCount: report.download_links.length,
    reportAgeLabel: "28-day window",
    comparisonMetric: {
      value: usage?.totalInteractions ?? null,
      label: "interactions",
      unit: "requests"
    },
    totalInteractions: usage?.totalInteractions ?? null,
    totalCodeGenerations: usage?.totalCodeGenerations ?? null,
    totalAcceptances: usage?.totalAcceptances ?? null,
    totalLinesAdded: usage?.totalLinesAdded ?? null,
    totalLocSuggested: usage?.totalLocSuggested ?? null,
    activeUserCount: usage?.activeUserCount ?? null,
    billedSeats,
    estimatedMonthlyCostUsd,
    spendProjection,
    cliInputTokens: (cliInputTokens !== null && cliInputTokens > 0) ? cliInputTokens : null,
    cliOutputTokens: (cliOutputTokens !== null && cliOutputTokens > 0) ? cliOutputTokens : null,
    cliRequestCount,
    cliSessionCount,
    cliModelsUsed,
    perModelBreakdown
  };
}

interface BuildPerModelArgs {
  modelFeatureBreakdown: { model: string; feature: string; interactionCount: number }[];
  totalCliInputTokens: number;
  totalCliOutputTokens: number;
  totalCliRequests: number;
  totalInteractions?: number;
  estimatedMonthlyCostUsd: number | null;
}

/**
 * Allocate CLI tokens proportionally across CLI-feature models, and seat
 * cost proportionally across all models by total interactions. Models that
 * appear only in non-CLI features (chat, agent, code-review) carry zero
 * tokens but still get a cost share.
 */
function buildPerModelBreakdown({
  modelFeatureBreakdown,
  totalCliInputTokens,
  totalCliOutputTokens,
  totalCliRequests,
  estimatedMonthlyCostUsd
}: BuildPerModelArgs): GitHubCopilotPerModelBreakdown[] {
  if (modelFeatureBreakdown.length === 0) return [];

  // Group by model.
  const byModel = new Map<
    string,
    {
      totalInteractions: number;
      cliInteractions: number;
      features: Set<string>;
    }
  >();
  for (const row of modelFeatureBreakdown) {
    if (row.model === "others") continue;
    const entry = byModel.get(row.model) ?? {
      totalInteractions: 0,
      cliInteractions: 0,
      features: new Set<string>()
    };
    entry.totalInteractions += row.interactionCount;
    if (row.feature === "copilot_cli") entry.cliInteractions += row.interactionCount;
    entry.features.add(row.feature);
    byModel.set(row.model, entry);
  }

  const totalCliInteractions = Array.from(byModel.values()).reduce(
    (acc, m) => acc + m.cliInteractions,
    0
  );
  const allInteractions = Array.from(byModel.values()).reduce(
    (acc, m) => acc + m.totalInteractions,
    0
  );

  // Cost is monthly seat spend prorated to the 28-day window.
  const totalWindowCostUsd =
    estimatedMonthlyCostUsd !== null ? (estimatedMonthlyCostUsd * 28) / 30 : null;

  const rows: GitHubCopilotPerModelBreakdown[] = [];
  for (const [model, m] of byModel.entries()) {
    const cliShare = totalCliInteractions > 0 ? m.cliInteractions / totalCliInteractions : 0;
    const allShare = allInteractions > 0 ? m.totalInteractions / allInteractions : 0;
    rows.push({
      model,
      interactionCount: m.totalInteractions,
      inputTokens: Math.round(totalCliInputTokens * cliShare),
      outputTokens: Math.round(totalCliOutputTokens * cliShare),
      requestCount: Math.round(totalCliRequests * cliShare),
      costUsd:
        totalWindowCostUsd !== null
          ? Math.round(totalWindowCostUsd * allShare * 100) / 100
          : null,
      features: Array.from(m.features).sort(),
      tokensUnavailable: m.cliInteractions === 0
    });
  }

  return rows.sort((a, b) => b.interactionCount - a.interactionCount);
}

/** Aggregates an array of per-user per-day records into a single usage summary. */
export function aggregateGitHubCopilotUsageRecords(
  records: GitHubCopilotUsageRecord[]
): GitHubCopilotUsageSummary {
  const uniqueUsers = new Set<string>();
  let totalInteractions = 0;
  let totalCodeGenerations = 0;
  let totalAcceptances = 0;
  let totalLinesAdded = 0;
  let totalLocSuggested = 0;
  let totalCliInputTokens = 0;
  let totalCliOutputTokens = 0;
  let totalCliRequests = 0;
  let totalCliSessions = 0;
  const cliModelSet = new Set<string>();
  const modelFeatureMap = new Map<string, number>(); // key: `${model}\u0000${feature}`

  for (const record of records) {
    if (record.user_login) uniqueUsers.add(record.user_login);
    totalInteractions += record.user_initiated_interaction_count;
    totalCodeGenerations += record.code_generation_activity_count;
    totalAcceptances += record.code_acceptance_activity_count;
    totalLinesAdded += record.loc_added_sum;
    totalLocSuggested += record.loc_suggested_to_add_sum;

    const cli = record.totals_by_cli;
    if (cli) {
      totalCliRequests += cli.request_count;
      totalCliSessions += cli.session_count;
      if (cli.token_usage) {
        totalCliInputTokens += cli.token_usage.prompt_tokens_sum;
        totalCliOutputTokens += cli.token_usage.output_tokens_sum;
      }
    }

    for (const mf of record.totals_by_model_feature ?? []) {
      if (mf.model === "others") continue;
      if (mf.feature === "copilot_cli") cliModelSet.add(mf.model);
      const key = `${mf.model}\u0000${mf.feature}`;
      modelFeatureMap.set(
        key,
        (modelFeatureMap.get(key) ?? 0) + mf.user_initiated_interaction_count
      );
    }
  }

  const modelFeatureBreakdown = Array.from(modelFeatureMap.entries())
    .map(([key, interactionCount]) => {
      const [model, feature] = key.split("\u0000");
      return { model, feature, interactionCount };
    })
    .sort((a, b) => b.interactionCount - a.interactionCount);

  return {
    totalInteractions,
    totalCodeGenerations,
    totalAcceptances,
    totalLinesAdded,
    totalLocSuggested,
    activeUserCount: uniqueUsers.size,
    totalCliInputTokens,
    totalCliOutputTokens,
    totalCliRequests,
    totalCliSessions,
    cliModelsUsed: Array.from(cliModelSet).sort(),
    modelFeatureBreakdown
  };
}
