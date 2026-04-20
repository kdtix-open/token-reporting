import { describe, expect, it, vi } from "vitest";

import { buildBasicAuthHeader, fetchCursorDailyUsage } from "../client";

describe("buildBasicAuthHeader", () => {
  it("encodes the api key as basic auth with an empty password", () => {
    const header = buildBasicAuthHeader("test-api-key");
    const decoded = Buffer.from(
      header.replace("Basic ", ""),
      "base64"
    ).toString("utf8");
    expect(decoded).toBe("test-api-key:");
  });
});

describe("fetchCursorDailyUsage", () => {
  it("posts to the daily-usage-data endpoint with basic auth", async () => {
    const mockResponse = {
      data: [
        {
          userId: "user_abc123",
          day: "2026-03-18",
          date: 1742256000000,
          email: "dev@example.com",
          cmdkUsages: 10,
          composerRequests: 20,
          chatRequests: 30,
          agentRequests: 5,
          usageBasedReqs: 2,
          subscriptionIncludedReqs: 25,
          bugbotUsages: 0
        }
      ],
      period: {
        startDate: 1739836800000,
        endDate: 1742256000000
      }
    };

    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchCursorDailyUsage(
      { apiKey: "test-key" },
      fetchStub
    );

    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain("cursor.com/teams/daily-usage-data");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].cmdkUsages).toBe(10);
  });

  it("throws when the response is not ok", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized"
    });

    await expect(
      fetchCursorDailyUsage({ apiKey: "bad-key" }, fetchStub)
    ).rejects.toThrow("401");
  });
});
