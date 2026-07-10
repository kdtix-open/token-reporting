import { describe, expect, it, vi } from "vitest";

import { pollReportRefreshJob, requestReportRefresh } from "../integrationApiClient";

describe("integrationApiClient", () => {
  it("requestReportRefresh_DefaultBrowserOrigin_PostsToSameOriginApi", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        jobId: "dynamic-refresh-same-origin",
        status: "completed"
      }),
      ok: true,
      status: 202
    });

    await requestReportRefresh({
      defaultApiBaseUrl: "https://dev.projectit.ai/tools/token-reporting",
      fetcher
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://dev.projectit.ai/tools/token-reporting/api/refresh",
      expect.objectContaining({
        method: "POST"
      })
    );
  });

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

  it("pollReportRefreshJob_RunningThenCompleted_ReturnsCompletedJob", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          jobId: "dynamic-refresh-001",
          status: "running"
        }),
        ok: true,
        status: 200
      })
      .mockResolvedValueOnce({
        json: async () => ({
          jobId: "dynamic-refresh-001",
          status: "completed"
        }),
        ok: true,
        status: 200
      });

    const result = await pollReportRefreshJob("dynamic-refresh-001", {
      apiBaseUrl: "http://127.0.0.1:8788",
      fetcher,
      intervalMs: 0,
      timeoutMs: 1000
    });

    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8788/api/refresh/dynamic-refresh-001", {
      method: "GET",
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

  it("pollReportRefreshJob_InvalidSuccessBody_ReturnsFailedOutcome", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({
      json: async () => ({
        jobId: "different-job",
        status: "mystery"
      }),
      ok: true,
      status: 200
    });

    const result = await pollReportRefreshJob("dynamic-refresh-001", {
      apiBaseUrl: "http://127.0.0.1:8788",
      fetcher,
      intervalMs: 0,
      timeoutMs: 1000
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      httpStatus: 200,
      message: "Refresh status response was invalid or did not match the requested job.",
      outcome: "failed"
    });
  });

  it("pollReportRefreshJob_DefaultTimeout_AllowsFullSequentialForensicReviewerWindow", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        forensicRun: {
          reviewerArtifacts: [{ reviewerModel: "kimi", status: "running" }],
          status: "running"
        },
        jobId: "dynamic-refresh-long-forensics",
        providerResults: [{ providerId: "codex", status: "completed" }],
        status: "running"
      }),
      ok: true,
      status: 200
    });

    const resultPromise = pollReportRefreshJob("dynamic-refresh-long-forensics", {
      apiBaseUrl: "http://127.0.0.1:8788",
      fetcher,
      intervalMs: 60_000
    });

    for (let tick = 0; tick < 21; tick += 1) {
      await vi.advanceTimersByTimeAsync(60_000);
    }
    await vi.advanceTimersByTimeAsync(1);

    await expect(resultPromise).resolves.toEqual({
      message:
        "Refresh is still running after 1200 seconds. Check the refresh status or try a narrower provider refresh.",
      outcome: "failed"
    });
    expect(fetcher).toHaveBeenCalledTimes(20);
    vi.useRealTimers();
  }, 10_000);

  it("pollReportRefreshJob_NearDeadline_ClampsStatusRequestToRemainingTimeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              setTimeout(
                () =>
                  resolve({
                    json: async () => ({
                      jobId: "dynamic-refresh-near-deadline",
                      status: "running"
                    }),
                    ok: true,
                    status: 200
                  } as Response),
                50
              );
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise<Response>(() => {
              // Intentionally unresolved so the poller must honor the remaining overall deadline.
            })
        );
      const resultPromise = pollReportRefreshJob("dynamic-refresh-near-deadline", {
        apiBaseUrl: "http://127.0.0.1:8788",
        fetcher,
        intervalMs: 1,
        timeoutMs: 75
      });
      let result: Awaited<typeof resultPromise> | undefined;
      resultPromise.then((value) => {
        result = value;
      });

      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetcher).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(24);
      await Promise.resolve();

      expect(result).toEqual({
        message:
          "Refresh is still running after 0.1 seconds. Check the refresh status or try a narrower provider refresh.",
        outcome: "failed"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("pollReportRefreshJob_AbortErrorFromTimeout_ReturnsFailedOutcome", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        const signal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

      const resultPromise = pollReportRefreshJob("dynamic-refresh-abort-timeout", {
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
    } finally {
      vi.useRealTimers();
    }
  });

  it("pollReportRefreshJob_StatusRequestTimeoutBeforeDeadline_ContinuesPolling", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Response>(() => {
              // The first status request hits its per-request timeout, not the overall deadline.
            })
        )
        .mockResolvedValueOnce({
          json: async () => ({
            jobId: "dynamic-refresh-transient-timeout",
            status: "completed"
          }),
          ok: true,
          status: 200
        });
      const resultPromise = pollReportRefreshJob("dynamic-refresh-transient-timeout", {
        apiBaseUrl: "http://127.0.0.1:8788",
        fetcher,
        intervalMs: 0,
        timeoutMs: 90_000
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await vi.runOnlyPendingTimersAsync();

      await expect(resultPromise).resolves.toEqual({
        job: {
          jobId: "dynamic-refresh-transient-timeout",
          status: "completed"
        },
        outcome: "accepted"
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pollReportRefreshJob_StatusBodyTimeoutBeforeDeadline_ContinuesPolling", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi
        .fn()
        .mockImplementationOnce((_url: RequestInfo | URL, init?: RequestInit) =>
          Promise.resolve({
            json: async () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                  reject(new DOMException("The operation was aborted.", "AbortError"));
                });
              }),
            ok: true,
            status: 200
          } as Response)
        )
        .mockResolvedValueOnce({
          json: async () => ({
            jobId: "dynamic-refresh-body-timeout",
            status: "completed"
          }),
          ok: true,
          status: 200
        });
      const resultPromise = pollReportRefreshJob("dynamic-refresh-body-timeout", {
        apiBaseUrl: "http://127.0.0.1:8788",
        fetcher,
        intervalMs: 0,
        timeoutMs: 90_000
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await vi.runOnlyPendingTimersAsync();

      await expect(resultPromise).resolves.toEqual({
        job: {
          jobId: "dynamic-refresh-body-timeout",
          status: "completed"
        },
        outcome: "accepted"
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
