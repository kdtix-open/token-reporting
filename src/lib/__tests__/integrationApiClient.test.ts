import { describe, expect, it, vi } from "vitest";

import { requestReportRefresh } from "../integrationApiClient";

describe("integrationApiClient", () => {
  it("requestReportRefresh_DefaultRequest_PostsIncrementalForensicRefresh", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        jobId: "dynamic-refresh-001",
        status: "completed"
      }),
      ok: true,
      status: 202
    });

    const result = await requestReportRefresh({
      apiBaseUrl: "http://127.0.0.1:8788",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8788/api/refresh", {
      body: JSON.stringify({
        includeForensicModelProfiles: true,
        includeHuggingFaceRefresh: true,
        mode: "incremental"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: expect.any(AbortSignal)
    });
    expect(result).toEqual({
      job: {
        jobId: "dynamic-refresh-001",
        status: "completed"
      },
      outcome: "accepted"
    });
  });

  it("requestReportRefresh_ReadOnlyResponse_ReturnsBlockedOutcome", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        code: "read_only",
        message: "Refresh is disabled."
      }),
      ok: false,
      status: 403
    });

    const result = await requestReportRefresh({
      apiBaseUrl: "http://127.0.0.1:8788/",
      fetcher
    });

    expect(result).toEqual({
      httpStatus: 403,
      message: "Refresh is disabled.",
      outcome: "blocked"
    });
  });

  it("requestReportRefresh_Timeout_ReturnsFailedOutcome", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      () => new Promise<Response>(() => {
        // Intentionally unresolved to exercise the client timeout path.
      })
    );

    const resultPromise = requestReportRefresh({
      apiBaseUrl: "http://127.0.0.1:8788",
      fetcher,
      timeoutMs: 50
    });

    await vi.advanceTimersByTimeAsync(50);
    await expect(resultPromise).resolves.toEqual({
      message:
        "Refresh is still running after 0.1 seconds. Check the refresh status or try a narrower provider refresh.",
      outcome: "failed"
    });
    vi.useRealTimers();
  });
});
