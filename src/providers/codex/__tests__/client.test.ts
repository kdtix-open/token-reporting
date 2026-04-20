import { describe, expect, it, vi } from "vitest";

import { fetchCodexUsageReport } from "../client";

describe("fetchCodexUsageReport", () => {
  it("fetches from the OpenAI completions usage endpoint with bearer auth", async () => {
    const mockResponse = {
      data: [
        {
          start_time: 1740787200,
          end_time: 1740873600,
          results: [
            {
              input_tokens: 8000,
              output_tokens: 2000,
              num_model_requests: 150
            }
          ]
        }
      ],
      has_more: false,
      next_page: null
    };

    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await fetchCodexUsageReport(
      { apiKey: "sk-org-admin-test" },
      fetchStub
    );

    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as [URL, RequestInit & { headers: Record<string, string> }];
    expect(url.toString()).toContain("api.openai.com");
    expect(url.toString()).toContain("usage/completions");
    expect(url.searchParams.get("bucket_width")).toBe("1d");
    expect(init.headers.Authorization).toBe("Bearer sk-org-admin-test");
    expect(result.data).toHaveLength(1);
    expect(result.data[0].results[0].input_tokens).toBe(8000);
  });

  it("throws when the response is not ok", async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized"
    });

    await expect(
      fetchCodexUsageReport({ apiKey: "bad-key" }, fetchStub)
    ).rejects.toThrow("401");
  });
});
