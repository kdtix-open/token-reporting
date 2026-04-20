import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { persistGitHubCopilotLatestUsersReportMetadata } from "../persistence";
import {
  aggregateGitHubCopilotUsageRecords,
  createGitHubCopilotReportSummary
} from "../service";

describe("createGitHubCopilotReportSummary", () => {
  it("maps the latest report metadata into a dashboard summary", () => {
    const summary = createGitHubCopilotReportSummary({
      organization: "kdtix-open",
      report: {
        download_links: [
          "https://example.com/report-1.json",
          "https://example.com/report-2.json"
        ],
        report_start_day: "2026-03-01",
        report_end_day: "2026-03-28"
      }
    });

    expect(summary.providerId).toBe("github-copilot");
    expect(summary.providerLabel).toBe("GitHub Copilot");
    expect(summary.organization).toBe("kdtix-open");
    expect(summary.reportStartDay).toBe("2026-03-01");
    expect(summary.reportEndDay).toBe("2026-03-28");
    expect(summary.downloadCount).toBe(2);
    expect(summary.totalInteractions).toBeNull();
    expect(summary.totalCodeGenerations).toBeNull();
    expect(summary.totalAcceptances).toBeNull();
    expect(summary.totalLinesAdded).toBeNull();
    expect(summary.totalLocSuggested).toBeNull();
    expect(summary.activeUserCount).toBeNull();
    expect(summary.billedSeats).toBeNull();
    expect(summary.estimatedMonthlyCostUsd).toBeNull();
    expect(summary.spendProjection.costSource).toBe("seat_based");
    expect(summary.spendProjection.totalUsd).toBe(0);
  });

  it("maps usage_summary fields into the dashboard summary when present", () => {
    const summary = createGitHubCopilotReportSummary({
      organization: "kdtix-open",
      report: {
        download_links: ["https://example.com/report-1.json"],
        report_start_day: "2026-03-01",
        report_end_day: "2026-03-28",
        usage_summary: {
          totalInteractions: 120,
          totalCodeGenerations: 450,
          totalAcceptances: 310,
          totalLinesAdded: 2800,
          totalLocSuggested: 3500,
          activeUserCount: 5,
          totalCliInputTokens: 0,
          totalCliOutputTokens: 0,
          totalCliRequests: 0,
          totalCliSessions: 0,
          cliModelsUsed: [],
          modelFeatureBreakdown: []
        }
      }
    });

    expect(summary.totalInteractions).toBe(120);
    expect(summary.totalCodeGenerations).toBe(450);
    expect(summary.totalAcceptances).toBe(310);
    expect(summary.totalLinesAdded).toBe(2800);
    expect(summary.totalLocSuggested).toBe(3500);
    expect(summary.activeUserCount).toBe(5);
    expect(summary.comparisonMetric).toEqual({ value: 120, label: "interactions", unit: "requests" });
    expect(summary.cliInputTokens).toBeNull();
    expect(summary.cliModelsUsed).toEqual([]);
    expect(summary.perModelBreakdown).toEqual([]);
  });

  it("exposes CLI token data when present in usage_summary", () => {
    const summary = createGitHubCopilotReportSummary({
      organization: "kdtix-open",
      report: {
        download_links: ["https://example.com/report-1.json"],
        report_start_day: "2026-03-01",
        report_end_day: "2026-03-28",
        usage_summary: {
          totalInteractions: 565,
          totalCodeGenerations: 154,
          totalAcceptances: 152,
          totalLinesAdded: 4347,
          totalLocSuggested: 0,
          activeUserCount: 1,
          totalCliInputTokens: 87_718_458,
          totalCliOutputTokens: 1_242_282,
          totalCliRequests: 420,
          totalCliSessions: 210,
          cliModelsUsed: ["claude-haiku-4.5", "claude-sonnet-4.6", "gpt-5.4"],
          modelFeatureBreakdown: [
            { model: "claude-sonnet-4.6", feature: "copilot_cli", interactionCount: 300 },
            { model: "gpt-5.4", feature: "copilot_cli", interactionCount: 100 },
            { model: "claude-haiku-4.5", feature: "copilot_cli", interactionCount: 20 },
            { model: "claude-sonnet-4.6", feature: "copilot_chat", interactionCount: 145 }
          ]
        }
      }
    });

    expect(summary.cliInputTokens).toBe(87_718_458);
    expect(summary.cliOutputTokens).toBe(1_242_282);
    expect(summary.cliRequestCount).toBe(420);
    expect(summary.cliSessionCount).toBe(210);
    expect(summary.cliModelsUsed).toEqual(["claude-haiku-4.5", "claude-sonnet-4.6", "gpt-5.4"]);
    // 420 CLI interactions split: sonnet 300 (71.4%), gpt-5.4 100 (23.8%), haiku 20 (4.8%)
    const sonnet = summary.perModelBreakdown.find((r) => r.model === "claude-sonnet-4.6")!;
    expect(sonnet.interactionCount).toBe(445); // 300 cli + 145 chat
    expect(sonnet.features).toEqual(["copilot_chat", "copilot_cli"]);
    expect(sonnet.inputTokens).toBeCloseTo(Math.round(87_718_458 * (300 / 420)), -3);
    expect(sonnet.requestCount).toBe(Math.round(420 * (300 / 420)));
    expect(sonnet.tokensUnavailable).toBe(false);
  });

  it("computes seat-based projection when billing_seats present", () => {
    const summary = createGitHubCopilotReportSummary({
      organization: "kdtix-open",
      report: {
        download_links: ["https://example.com/report-1.json"],
        report_start_day: "2026-03-01",
        report_end_day: "2026-03-28",
        billing_seats: { total_seats: 10, plan: "business" }
      }
    });

    expect(summary.billedSeats).toBe(10);
    expect(summary.estimatedMonthlyCostUsd).toBe(190); // 10 × $19
    expect(summary.spendProjection.costSource).toBe("seat_based");
    expect(summary.spendProjection.totalUsd).toBeCloseTo(190 / 30 * 28, 4);
  });

  it("persists the latest report metadata when writes are allowed", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "token-reporting-"));
    const outputPath = path.join(tempRoot, "latest-metadata.json");

    await expect(
      persistGitHubCopilotLatestUsersReportMetadata({
        organization: "kdtix-open",
        report: {
          download_links: ["https://example.com/report-1.json"],
          report_start_day: "2026-03-01",
          report_end_day: "2026-03-28"
        },
        outputPath,
        env: {}
      })
    ).resolves.toBe(outputPath);

    await expect(readFile(outputPath, "utf8")).resolves.toContain(
      '"report_end_day": "2026-03-28"'
    );
  });

  it("blocks persistence in read only mode", async () => {
    await expect(
      persistGitHubCopilotLatestUsersReportMetadata({
        organization: "kdtix-open",
        report: {
          download_links: ["https://example.com/report-1.json"],
          report_start_day: "2026-03-01",
          report_end_day: "2026-03-28"
        },
        outputPath: path.join(os.tmpdir(), "should-not-write.json"),
        env: {
          TOKEN_REPORTING_READ_ONLY: "true"
        }
      })
    ).rejects.toThrow(/TOKEN_REPORTING_READ_ONLY/);
  });
});

describe("aggregateGitHubCopilotUsageRecords", () => {
  it("sums interaction and lines metrics across all records", () => {
    const base = { used_cli: false, used_chat: false, used_agent: false, used_copilot_coding_agent: false, used_copilot_code_review_active: false };
    const records = [
      { ...base, day: "2026-03-01", user_login: "alice", user_initiated_interaction_count: 10, code_generation_activity_count: 30, code_acceptance_activity_count: 20, loc_suggested_to_add_sum: 500, loc_added_sum: 400 },
      { ...base, day: "2026-03-02", user_login: "alice", user_initiated_interaction_count: 5, code_generation_activity_count: 15, code_acceptance_activity_count: 10, loc_suggested_to_add_sum: 200, loc_added_sum: 150 },
      { ...base, day: "2026-03-01", user_login: "bob", user_initiated_interaction_count: 8, code_generation_activity_count: 20, code_acceptance_activity_count: 12, loc_suggested_to_add_sum: 300, loc_added_sum: 250 }
    ];

    const summary = aggregateGitHubCopilotUsageRecords(records);

    expect(summary.totalInteractions).toBe(23);
    expect(summary.totalCodeGenerations).toBe(65);
    expect(summary.totalAcceptances).toBe(42);
    expect(summary.totalLocSuggested).toBe(1000);
    expect(summary.totalLinesAdded).toBe(800);
    expect(summary.activeUserCount).toBe(2);
  });

  it("counts unique users by login, not by record count", () => {
    const base = { used_cli: false, used_chat: false, used_agent: false, used_copilot_coding_agent: false, used_copilot_code_review_active: false };
    const records = [
      { ...base, day: "2026-03-01", user_login: "alice", user_initiated_interaction_count: 1, code_generation_activity_count: 0, code_acceptance_activity_count: 0, loc_suggested_to_add_sum: 0, loc_added_sum: 0 },
      { ...base, day: "2026-03-02", user_login: "alice", user_initiated_interaction_count: 1, code_generation_activity_count: 0, code_acceptance_activity_count: 0, loc_suggested_to_add_sum: 0, loc_added_sum: 0 }
    ];

    expect(aggregateGitHubCopilotUsageRecords(records).activeUserCount).toBe(1);
  });

  it("returns zeros for an empty record set", () => {
    const summary = aggregateGitHubCopilotUsageRecords([]);

    expect(summary.totalInteractions).toBe(0);
    expect(summary.activeUserCount).toBe(0);
    expect(summary.totalCliInputTokens).toBe(0);
    expect(summary.cliModelsUsed).toEqual([]);
  });

  it("aggregates CLI token data from totals_by_cli", () => {
    const records = [
      {
        day: "2026-04-10",
        user_login: "alice",
        user_initiated_interaction_count: 80,
        code_generation_activity_count: 4,
        code_acceptance_activity_count: 4,
        loc_suggested_to_add_sum: 0,
        loc_added_sum: 40,
        totals_by_cli: {
          session_count: 28,
          request_count: 116,
          prompt_count: 80,
          token_usage: {
            output_tokens_sum: 21_887,
            prompt_tokens_sum: 3_311_775,
            avg_tokens_per_request: 28_738
          }
        },
        totals_by_model_feature: [
          { model: "claude-sonnet-4.6", feature: "copilot_cli", user_initiated_interaction_count: 80 }
        ],
        used_cli: true,
        used_chat: false,
        used_agent: false,
        used_copilot_coding_agent: false,
        used_copilot_code_review_active: false
      },
      {
        day: "2026-04-11",
        user_login: "alice",
        user_initiated_interaction_count: 62,
        code_generation_activity_count: 0,
        code_acceptance_activity_count: 0,
        loc_suggested_to_add_sum: 0,
        loc_added_sum: 0,
        totals_by_cli: {
          session_count: 15,
          request_count: 50,
          prompt_count: 62,
          token_usage: {
            output_tokens_sum: 23_734,
            prompt_tokens_sum: 4_155_169,
            avg_tokens_per_request: 83_103
          }
        },
        totals_by_model_feature: [
          { model: "gpt-5.4", feature: "copilot_cli", user_initiated_interaction_count: 62 }
        ],
        used_cli: true,
        used_chat: false,
        used_agent: false,
        used_copilot_coding_agent: false,
        used_copilot_code_review_active: false
      }
    ];

    const summary = aggregateGitHubCopilotUsageRecords(records);

    expect(summary.totalCliInputTokens).toBe(3_311_775 + 4_155_169);
    expect(summary.totalCliOutputTokens).toBe(21_887 + 23_734);
    expect(summary.totalCliRequests).toBe(116 + 50);
    expect(summary.totalCliSessions).toBe(28 + 15);
    expect(summary.cliModelsUsed).toEqual(["claude-sonnet-4.6", "gpt-5.4"]);
  });

  it("excludes non-CLI model entries from cliModelsUsed", () => {
    const records = [
      {
        day: "2026-04-10",
        user_login: "alice",
        user_initiated_interaction_count: 5,
        code_generation_activity_count: 0,
        code_acceptance_activity_count: 0,
        loc_suggested_to_add_sum: 0,
        loc_added_sum: 0,
        totals_by_model_feature: [
          { model: "claude-sonnet-4.6", feature: "copilot_cli", user_initiated_interaction_count: 3 },
          { model: "gpt-5.4", feature: "copilot_chat", user_initiated_interaction_count: 2 },
          { model: "others", feature: "copilot_cli", user_initiated_interaction_count: 0 }
        ],
        used_cli: true,
        used_chat: true,
        used_agent: false,
        used_copilot_coding_agent: false,
        used_copilot_code_review_active: false
      }
    ];

    const summary = aggregateGitHubCopilotUsageRecords(records);
    // only copilot_cli feature, no "others"
    expect(summary.cliModelsUsed).toEqual(["claude-sonnet-4.6"]);
  });
});
