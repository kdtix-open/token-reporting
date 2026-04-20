import { describe, expect, it, vi } from "vitest";

import {
  buildGitHubCopilotLatestUsersReportRequest,
  fetchGitHubCopilotLatestUsersReportMetadata,
  fetchGitHubCopilotUsageFiles,
  parseGitHubCopilotNdjson
} from "../client";

describe("buildGitHubCopilotLatestUsersReportRequest", () => {
  it("uses the organization users 28 day latest endpoint and current api version", () => {
    const request = buildGitHubCopilotLatestUsersReportRequest({
      organization: "kdtix-open",
      token: "test-token"
    });

    expect(request.url.toString()).toBe(
      "https://api.github.com/orgs/kdtix-open/copilot/metrics/reports/users-28-day/latest"
    );
    expect(request.init.method).toBe("GET");
    expect(request.init.headers).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer test-token",
      "X-GitHub-Api-Version": "2026-03-10"
    });
  });

  it("parses the latest report payload from the api response", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        download_links: ["https://example.com/report.json"],
        report_start_day: "2026-03-01",
        report_end_day: "2026-03-28"
      })
    });

    await expect(
      fetchGitHubCopilotLatestUsersReportMetadata(
        {
          organization: "kdtix-open",
          token: "test-token"
        },
        fetchStub
      )
    ).resolves.toEqual({
      download_links: ["https://example.com/report.json"],
      report_start_day: "2026-03-01",
      report_end_day: "2026-03-28"
    });
  });
});

describe("parseGitHubCopilotNdjson", () => {
  it("parses valid NDJSON into typed usage records", () => {
    const ndjson = [
      JSON.stringify({
        day: "2026-03-01",
        user_id: 1,
        user_login: "alice",
        user_initiated_interaction_count: 5,
        code_generation_activity_count: 20,
        code_acceptance_activity_count: 15,
        loc_suggested_to_add_sum: 100,
        loc_added_sum: 80
      }),
      JSON.stringify({
        day: "2026-03-02",
        user_login: "alice",
        user_initiated_interaction_count: 3
      })
    ].join("\n");

    const records = parseGitHubCopilotNdjson(ndjson);

    expect(records).toHaveLength(2);
    expect(records[0].user_login).toBe("alice");
    expect(records[0].loc_added_sum).toBe(80);
    expect(records[1].user_initiated_interaction_count).toBe(3);
    expect(records[1].loc_added_sum).toBe(0);
  });

  it("ignores blank lines including a trailing newline", () => {
    const ndjson =
      "\n\n" +
      JSON.stringify({ day: "2026-03-01", user_login: "bob" }) +
      "\n\n";

    expect(parseGitHubCopilotNdjson(ndjson)).toHaveLength(1);
  });
});

describe("fetchGitHubCopilotUsageFiles", () => {
  it("downloads each signed url and concatenates records", async () => {
    const line1 = JSON.stringify({
      day: "2026-03-01",
      user_login: "alice",
      user_initiated_interaction_count: 5
    });
    const line2 = JSON.stringify({
      day: "2026-03-02",
      user_login: "bob",
      user_initiated_interaction_count: 3
    });

    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => line1 })
      .mockResolvedValueOnce({ ok: true, text: async () => line2 });

    const records = await fetchGitHubCopilotUsageFiles(
      [
        "https://example.com/part-1.json",
        "https://example.com/part-2.json"
      ],
      fetchStub
    );

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(2);
    expect(records[0].user_login).toBe("alice");
    expect(records[1].user_login).toBe("bob");
  });

  it("throws when a signed url returns a non-ok response", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden"
    });

    await expect(
      fetchGitHubCopilotUsageFiles(
        ["https://example.com/part.json"],
        fetchStub
      )
    ).rejects.toThrow("403");
  });

  it("returns an empty array when no download links are provided", async () => {
    const fetchStub = vi.fn();

    await expect(
      fetchGitHubCopilotUsageFiles([], fetchStub)
    ).resolves.toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("buildGitHubCopilotLatestUsersReportRequest", () => {
  it("uses the organization users 28 day latest endpoint and current api version", () => {
    const request = buildGitHubCopilotLatestUsersReportRequest({
      organization: "kdtix-open",
      token: "test-token"
    });

    expect(request.url.toString()).toBe(
      "https://api.github.com/orgs/kdtix-open/copilot/metrics/reports/users-28-day/latest"
    );
    expect(request.init.method).toBe("GET");
    expect(request.init.headers).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer test-token",
      "X-GitHub-Api-Version": "2026-03-10"
    });
  });

  it("parses the latest report payload from the api response", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        download_links: ["https://example.com/report.json"],
        report_start_day: "2026-03-01",
        report_end_day: "2026-03-28"
      })
    });

    await expect(
      fetchGitHubCopilotLatestUsersReportMetadata(
        {
          organization: "kdtix-open",
          token: "test-token"
        },
        fetchStub
      )
    ).resolves.toEqual({
      download_links: ["https://example.com/report.json"],
      report_start_day: "2026-03-01",
      report_end_day: "2026-03-28"
    });
  });
});
