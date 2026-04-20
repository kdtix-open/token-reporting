import { describe, expect, it, vi } from "vitest";

import { fetchClaudeUsageReport } from "../client";

const makeBucket = (date: string, tokens: number) => ({
  starting_at: `${date}T00:00:00Z`,
  ending_at: `${date}T00:00:00Z`,
  results: [
    {
      uncached_input_tokens: tokens,
      cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 300 },
      cache_read_input_tokens: 800,
      output_tokens: 1200
    }
  ]
});

describe("fetchClaudeUsageReport", () => {
  it("fetches from the Anthropic usage report endpoint with admin key header", async () => {
    const mockResponse = {
      data: [makeBucket("2026-03-19", 5000)],
      has_more: false,
      next_page: null
    };

    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchClaudeUsageReport(
      { apiKey: "sk-ant-admin-test" },
      fetchStub
    );

    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as [
      URL,
      RequestInit & { headers: Record<string, string> }
    ];
    expect(url.toString()).toContain("api.anthropic.com");
    expect(url.toString()).toContain("usage_report/messages");
    expect(url.searchParams.get("starting_at")).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(url.searchParams.has("bucket")).toBe(false);
    expect(init.headers["x-api-key"]).toBe("sk-ant-admin-test");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].results[0].uncached_input_tokens).toBe(5000);
  });

  it("follows pagination until has_more is false", async () => {
    // next_page encodes the next starting_at date as base64 with "page_" prefix
    const nextDate = "2026-03-26T00:00:00Z";
    const cursor = "page_" + Buffer.from(nextDate).toString("base64");
    const page1 = { data: [makeBucket("2026-03-19", 1000)], has_more: true, next_page: cursor };
    const page2 = { data: [makeBucket("2026-03-26", 2000)], has_more: false, next_page: null };

    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, json: async () => page2 });

    const result = await fetchClaudeUsageReport({ apiKey: "sk-ant-admin-test" }, fetchStub);

    expect(fetchStub).toHaveBeenCalledTimes(2);
    const [secondUrl] = fetchStub.mock.calls[1] as [URL, RequestInit];
    expect(secondUrl.searchParams.get("starting_at")).toBe(nextDate);
    expect(secondUrl.searchParams.has("page_token")).toBe(false);
    expect(result.data).toHaveLength(2);
    expect(result.has_more).toBe(false);
    expect(result.data[0].results[0].uncached_input_tokens).toBe(1000);
    expect(result.data[1].results[0].uncached_input_tokens).toBe(2000);
  });

  it("throws when the response is not ok", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden"
    });

    await expect(
      fetchClaudeUsageReport({ apiKey: "bad-key" }, fetchStub)
    ).rejects.toThrow("403");
  });
});
