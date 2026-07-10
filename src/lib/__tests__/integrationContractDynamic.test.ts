import { describe, expect, it, vi } from "vitest";

import {
  createDynamicIntegrationContractHandler,
  type DynamicForensicExecutionResult,
  type DynamicForensicReviewerArtifact,
  type DynamicProviderBudgetLimit
} from "../integrationContractDynamic";
import type { ProviderReportSummary, SpendProjection } from "../types";

function spendProjection(totalUsd: number): SpendProjection {
  return {
    costSource: "actual",
    dailyAvgUsd: totalUsd / 7,
    dailyBreakdown: Array.from({ length: 7 }, (_, index) => ({
      costUsd: totalUsd / 7,
      date: `2026-06-0${index + 1}`
    })),
    projectedAnnualUsd: totalUsd * 52,
    projectedMonthlyUsd: totalUsd * (30 / 7),
    totalUsd,
    trend: "flat",
    trendedAnnualUsd: null,
    trendedMonthlyUsd: null,
    windowDays: 7
  };
}

function summary(
  providerId: string,
  providerLabel: string,
  metricValue: number,
  totalUsd: number,
  metricUnit: "requests" | "tokens" = "tokens"
): ProviderReportSummary {
  return {
    comparisonMetric: {
      label: metricUnit === "requests" ? "Total requests" : "Total tokens",
      unit: metricUnit,
      value: metricValue
    },
    providerId,
    providerLabel,
    reportAgeLabel: "fresh",
    reportEndDay: "2026-06-07",
    reportStartDay: "2026-06-01",
    spendProjection: spendProjection(totalUsd)
  };
}

const summaries = [
  summary("claude", "Claude", 100_000, 25),
  summary("codex", "OpenAI Codex", 950_000, 80),
  summary("cursor", "Cursor", 1_000_000, 120)
];

const budgetLimits: Record<string, DynamicProviderBudgetLimit> = {
  claude: {
    budgetKind: "tokens_per_window",
    limit: 1_000_000,
    resetAt: "2026-06-08T00:00:00.000Z",
    scopeId: "tenant:kdtix-open:workspace:claude",
    scopeLabel: "kdtix-open Claude workspace"
  },
  codex: {
    budgetKind: "tokens_per_window",
    limit: 1_000_000,
    resetAt: "2026-06-08T00:00:00.000Z",
    scopeId: "tenant:kdtix-open:project:codex",
    scopeLabel: "kdtix-open Codex project"
  },
  cursor: {
    budgetKind: "tokens_per_window",
    limit: 1_000_000,
    resetAt: "2026-06-08T00:00:00.000Z",
    scopeId: "tenant:kdtix-open:team:cursor",
    scopeLabel: "kdtix-open Cursor team"
  }
};

describe("integrationContractDynamic", () => {
  it("createDynamicIntegrationContractHandler_ContractEndpoint_ReturnsDynamicContract", async () => {
    const handler = createDynamicIntegrationContractHandler({
      loadSummaries: async () => summaries
    });
    const response = await handler({
      method: "GET",
      path: "/api/integration/contract"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contractId: "kdtix.token-reporting.integration",
      contractVersion: "sdlca-token-reporting-dynamic-v0.1",
      mode: "dynamic",
      serviceId: "kdtix.token-reporting"
    });
  });

  it("createDynamicIntegrationContractHandler_UsageEndpoint_ReturnsLiveSummaryUsage", async () => {
    const handler = createDynamicIntegrationContractHandler({
      loadSummaries: async () => summaries
    });
    const response = await handler({
      method: "GET",
      path: "/api/providers/codex/usage"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      providerId: "codex",
      providerLabel: "OpenAI Codex",
      reportEndDay: "2026-06-07",
      reportStartDay: "2026-06-01",
      totals: {
        observedMetricValue: 950_000,
        observedMetricUnit: "tokens",
        totalCostUsd: 80
      }
    });
  });

  it("createDynamicIntegrationContractHandler_BudgetsEndpoint_DerivesDispatchGuards", async () => {
    const handler = createDynamicIntegrationContractHandler({
      budgetLimits,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:00:00.000Z")
    });
    const response = await handler({
      method: "GET",
      path: "/api/budgets"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contractVersion: "sdlca-token-reporting-dynamic-v0.1",
      generatedAt: "2026-06-07T16:00:00.000Z",
      status: "degraded"
    });
    const body = response.body as {
      budgets: Array<{
        dispatchGuard: { decision: string };
        providerId: string;
        threshold: string;
      }>;
    };

    expect(body.budgets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dispatchGuard: expect.objectContaining({ decision: "allow" }),
          providerId: "claude",
          threshold: "green"
        }),
        expect.objectContaining({
          dispatchGuard: expect.objectContaining({ decision: "prefer_alternate" }),
          providerId: "codex",
          threshold: "red"
        }),
        expect.objectContaining({
          dispatchGuard: expect.objectContaining({ decision: "block" }),
          providerId: "cursor",
          threshold: "exhausted"
        })
      ])
    );
  });

  it("createDynamicIntegrationContractHandler_BudgetStatusEndpoint_ReturnsProviderSpecificGuard", async () => {
    const handler = createDynamicIntegrationContractHandler({
      budgetLimits,
      loadSummaries: async () => summaries
    });
    const response = await handler({
      method: "GET",
      path: "/api/providers/codex/budget-status"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      budgetKind: "tokens_per_window",
      dispatchGuard: {
        allowDispatch: true,
        decision: "prefer_alternate",
        reasonCodes: ["near_budget_exhaustion", "high_worker_completion_risk"]
      },
      providerId: "codex",
      remaining: 50_000,
      threshold: "red",
      used: 950_000
    });
  });

  it("createDynamicIntegrationContractHandler_TokenBudgetWithRequestMetric_UsesTokenTotals", async () => {
    const handler = createDynamicIntegrationContractHandler({
      budgetLimits: {
        codex: {
          budgetKind: "tokens_per_window",
          limit: 1_000_000
        }
      },
      loadSummaries: async () => [
        {
          ...summary("codex", "OpenAI Codex", 20, 80, "requests"),
          cacheCreationTokens: 10_000,
          cacheReadTokens: 40_000,
          inputTokens: 850_000,
          outputTokens: 50_000,
          requestCount: 20
        } as ProviderReportSummary
      ]
    });
    const response = await handler({
      method: "GET",
      path: "/api/providers/codex/budget-status"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      budgetKind: "tokens_per_window",
      providerId: "codex",
      remaining: 50_000,
      threshold: "red",
      used: 950_000
    });
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_RunsExecutorAndStoresStatus", async () => {
    const refreshExecutor = vi.fn().mockResolvedValue({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          providerId: "codex",
          status: "completed"
        },
        {
          accumulatedThrough: "2026-06-06",
          degradedReason: "admin_token_not_configured",
          providerId: "cursor",
          status: "degraded"
        }
      ]
    });
    const handler = createDynamicIntegrationContractHandler({
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:45:00.000Z"),
      refreshExecutor
    });

    const refreshResponse = await handler({
      body: {
        mode: "historical",
        providers: ["codex", "cursor"]
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(refreshExecutor).toHaveBeenCalledWith({
      includeForensicModelProfiles: false,
      includeHuggingFaceRefresh: false,
      mode: "historical",
      providers: ["codex", "cursor"],
      reviewerModels: []
    });
    expect(refreshResponse.status).toBe(202);
    expect(refreshResponse.body).toMatchObject({
      completedAt: "2026-06-07T16:45:00.000Z",
      contractVersion: "sdlca-token-reporting-dynamic-v0.1",
      jobId: "dynamic-refresh-20260607T164500000Z",
      mode: "historical",
      status: "degraded"
    });

    const statusResponse = await handler({
      method: "GET",
      path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
    });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toMatchObject({
      jobId: "dynamic-refresh-20260607T164500000Z",
      providerResults: [
        expect.objectContaining({ providerId: "codex", status: "completed" }),
        expect.objectContaining({ providerId: "cursor", status: "degraded" })
      ],
      status: "degraded"
    });
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_AsyncModeStoresRunningThenCompletedJob", async () => {
    let resolveRefresh:
      | ((result: {
          providerResults: Array<{
            accumulatedThrough: string;
            completedAt: string;
            providerId: string;
            status: "completed";
          }>;
        }) => void)
      | undefined;
    const refreshExecutor = vi.fn(
      () =>
        new Promise<{
          providerResults: Array<{
            accumulatedThrough: string;
            completedAt: string;
            providerId: string;
            status: "completed";
          }>;
        }>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const handler = createDynamicIntegrationContractHandler({
      asyncRefresh: true,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:45:00.000Z"),
      refreshExecutor
    });

    const acceptedResponse = await handler({
      body: {
        providers: ["codex"]
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(acceptedResponse.status).toBe(202);
    expect(acceptedResponse.body).toMatchObject({
      jobId: "dynamic-refresh-20260607T164500000Z",
      providerResults: [expect.objectContaining({ providerId: "codex", status: "running" })],
      status: "running"
    });

    const runningResponse = await handler({
      method: "GET",
      path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
    });
    expect(runningResponse.body).toMatchObject({
      jobId: "dynamic-refresh-20260607T164500000Z",
      status: "running"
    });

    resolveRefresh?.({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          completedAt: "2026-06-07T16:45:08.000Z",
          providerId: "codex",
          status: "completed"
        }
      ]
    });

    await vi.waitFor(async () => {
      const completedResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
      });
      expect(completedResponse.body).toMatchObject({
        completedAt: "2026-06-07T16:45:08.000Z",
        jobId: "dynamic-refresh-20260607T164500000Z",
        providerResults: [expect.objectContaining({ providerId: "codex", status: "completed" })],
        status: "completed"
      });
    });
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_AsyncModeUsesUniqueForensicIdsWithinSameMillisecond", async () => {
    const jobs = new Map<string, Record<string, unknown>>();
    let releaseBaseRead: ((value: Record<string, unknown> | undefined) => void) | undefined;
    const baseRead = new Promise<Record<string, unknown> | undefined>((resolve) => {
      releaseBaseRead = resolve;
    });
    const baseJobId = "dynamic-refresh-20260607T164500000Z";
    const refreshJobStore = {
      get: vi.fn(async (jobId: string) => (jobId === baseJobId ? baseRead : jobs.get(jobId))),
      set: vi.fn(async (jobId: string, job: Record<string, unknown>) => {
        jobs.set(jobId, job);
      })
    };
    const refreshExecutor = vi.fn().mockResolvedValue({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          completedAt: "2026-06-07T16:45:08.000Z",
          providerId: "codex",
          status: "completed"
        }
      ]
    });
    const handler = createDynamicIntegrationContractHandler({
      asyncRefresh: true,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:45:00.000Z"),
      refreshExecutor,
      refreshJobStore
    });

    const firstPromise = handler({
      body: {
        includeForensicModelProfiles: true,
        providers: ["codex"],
        reviewerModels: ["sonnet"]
      },
      method: "POST",
      path: "/api/refresh"
    });
    await vi.waitFor(() => expect(refreshJobStore.get).toHaveBeenCalledWith(baseJobId));
    const secondPromise = handler({
      body: {
        includeForensicModelProfiles: true,
        providers: ["codex"],
        reviewerModels: ["sonnet"]
      },
      method: "POST",
      path: "/api/refresh"
    });
    releaseBaseRead?.(undefined);
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    const firstBody = first.body as Record<string, unknown>;
    const secondBody = second.body as Record<string, unknown>;
    const secondRun = secondBody.forensicRun as {
      reviewerArtifacts: Array<{ artifactUri: string }>;
      runId: string;
    };

    expect(firstBody.jobId).toBe("dynamic-refresh-20260607T164500000Z");
    expect(secondBody.jobId).toEqual(
      expect.stringMatching(/^dynamic-refresh-20260607T164500000Z-[a-f0-9]{8}$/)
    );
    expect(secondBody.jobId).not.toBe(firstBody.jobId);
    expect(secondRun.runId).toBe(
      String(secondBody.jobId).replace("dynamic-refresh-", "dynamic-forensic-")
    );
    expect(secondRun.reviewerArtifacts[0]?.artifactUri).toContain(secondRun.runId);
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_AsyncModePublishesProviderAndReviewerProgress", async () => {
    let resolveRefresh:
      | ((result: {
          providerResults: Array<{ accumulatedThrough: string; providerId: string; status: "completed" }>;
        }) => void)
      | undefined;
    let resolveForensics:
      | ((result: DynamicForensicExecutionResult) => void)
      | undefined;
    let publishReviewerProgress: (() => Promise<void>) | undefined;
    const sonnetArtifact: DynamicForensicReviewerArtifact = {
      artifact: {
        artifactKind: "local_model_forensic_review",
        artifactSchemaVersion: "sdlca.bridge.forensic.v0",
        recommendations: ["Keep tail-context work hosted."],
        summary: "Sonnet completed."
      },
      artifactUri:
        "local://token-reporting/forensics/dynamic-forensic-20260607T164500000Z/reviewers/sonnet.json",
      bridgeProviderKind: "claude",
      reviewerModel: "sonnet",
      status: "completed" as const
    };
    const refreshExecutor = vi.fn(
      () =>
        new Promise<{
          providerResults: Array<{ accumulatedThrough: string; providerId: string; status: "completed" }>;
        }>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const forensicExecutor = vi.fn(
      async (request) =>
        new Promise<DynamicForensicExecutionResult>((resolve) => {
          publishReviewerProgress = async () => {
            await request.onReviewerArtifact?.(sonnetArtifact, [sonnetArtifact]);
          };
          resolveForensics = resolve;
        })
    );
    const handler = createDynamicIntegrationContractHandler({
      asyncRefresh: true,
      forensicExecutor,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:45:00.000Z"),
      refreshExecutor
    });

    const acceptedResponse = await handler({
      body: {
        includeForensicModelProfiles: true,
        providers: ["codex"],
        reviewerModels: ["sonnet"]
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(acceptedResponse.status).toBe(202);
    resolveRefresh?.({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          providerId: "codex",
          status: "completed"
        }
      ]
    });

    await vi.waitFor(async () => {
      const progressResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
      });
      expect(progressResponse.body).toMatchObject({
        forensicRun: {
          reviewerArtifacts: [expect.objectContaining({ reviewerModel: "sonnet", status: "queued" })],
          status: "queued"
        },
        providerResults: [expect.objectContaining({ providerId: "codex", status: "completed" })],
        status: "running"
      });
    });

    await publishReviewerProgress?.();

    await vi.waitFor(async () => {
      const reviewerProgressResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
      });
      expect(reviewerProgressResponse.body).toMatchObject({
        forensicRun: {
          reviewerArtifacts: [
            expect.objectContaining({ reviewerModel: "sonnet", status: "completed" })
          ],
          status: "running"
        },
        providerResults: [expect.objectContaining({ providerId: "codex", status: "completed" })],
        status: "running"
      });
    });

    resolveForensics?.({
      reviewerArtifacts: [sonnetArtifact],
      status: "completed"
    });

    await vi.waitFor(async () => {
      const completedResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
      });
      expect(completedResponse.body).toMatchObject({
        forensicRun: {
          reviewerArtifacts: [
            expect.objectContaining({ reviewerModel: "sonnet", status: "completed" })
          ],
          status: "completed"
        },
        providerResults: [expect.objectContaining({ providerId: "codex", status: "completed" })],
        status: "completed"
      });
    });
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_AsyncModeSuppressesRejectedBackgroundFailureWrites", async () => {
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      let getJob: Record<string, unknown> | undefined;
      let setCalls = 0;
      const refreshJobStore = {
        async get() {
          return getJob;
        },
        async set(_jobId: string, job: Record<string, unknown>) {
          setCalls += 1;
          if (setCalls === 1) {
            getJob = job;
            return;
          }
          throw new Error("disk full");
        }
      };
      const refreshExecutor = vi.fn(async () => {
        throw new Error("refresh exploded");
      });
      const handler = createDynamicIntegrationContractHandler({
        asyncRefresh: true,
        loadSummaries: async () => summaries,
        now: () => new Date("2026-06-07T16:45:00.000Z"),
        refreshExecutor,
        refreshJobStore
      });

      const acceptedResponse = await handler({
        body: {
          providers: ["codex"]
        },
        method: "POST",
        path: "/api/refresh"
      });

      expect(acceptedResponse.status).toBe(202);
      await vi.waitFor(() => expect(setCalls).toBeGreaterThanOrEqual(2));
      await new Promise((resolve) => setTimeout(resolve, 0));

      const statusResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
      });

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toMatchObject({
        jobId: "dynamic-refresh-20260607T164500000Z",
        status: "failed"
      });
      expect(unhandledRejections).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_AsyncModeKeepsTerminalStatusWhenFinalPersistenceFails", async () => {
    let getJob: Record<string, unknown> | undefined;
    let setCalls = 0;
    const refreshJobStore = {
      async get() {
        return getJob;
      },
      async set(_jobId: string, job: Record<string, unknown>) {
        setCalls += 1;
        if (setCalls === 1) {
          getJob = job;
          return;
        }
        throw new Error("disk full");
      }
    };
    const refreshExecutor = vi.fn().mockResolvedValue({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          completedAt: "2026-06-07T16:45:08.000Z",
          providerId: "codex",
          status: "completed"
        }
      ]
    });
    const handler = createDynamicIntegrationContractHandler({
      asyncRefresh: true,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:45:00.000Z"),
      refreshExecutor,
      refreshJobStore
    });

    const acceptedResponse = await handler({
      body: {
        providers: ["codex"]
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(acceptedResponse.status).toBe(202);
    await vi.waitFor(() => expect(setCalls).toBeGreaterThanOrEqual(2));

    await vi.waitFor(async () => {
      const statusResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
      });

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toMatchObject({
        jobId: "dynamic-refresh-20260607T164500000Z",
        persistenceWarning: "refresh_job_terminal_not_persisted",
        persistenceRetryAttempts: expect.any(Number),
        providerResults: [expect.objectContaining({ providerId: "codex", status: "completed" })],
        status: "completed"
      });
    });
  });

  it("createDynamicIntegrationContractHandler_RefreshStatus_RetriesTerminalPersistenceAfterStorageRecovers", async () => {
    let getJob: Record<string, unknown> | undefined;
    let setCalls = 0;
    const refreshJobStore = {
      async get() {
        return getJob;
      },
      async set(_jobId: string, job: Record<string, unknown>) {
        setCalls += 1;
        if (setCalls === 2) {
          throw new Error("transient disk full");
        }
        getJob = job;
      }
    };
    const refreshExecutor = vi.fn().mockResolvedValue({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          completedAt: "2026-06-07T16:45:08.000Z",
          providerId: "codex",
          status: "completed"
        }
      ]
    });
    const handler = createDynamicIntegrationContractHandler({
      asyncRefresh: true,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:45:00.000Z"),
      refreshExecutor,
      refreshJobStore
    });

    await handler({
      body: {
        providers: ["codex"]
      },
      method: "POST",
      path: "/api/refresh"
    });
    await vi.waitFor(() => expect(setCalls).toBeGreaterThanOrEqual(2));

    const statusResponse = await handler({
      method: "GET",
      path: "/api/refresh/dynamic-refresh-20260607T164500000Z"
    });

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body).toMatchObject({
      jobId: "dynamic-refresh-20260607T164500000Z",
      providerResults: [expect.objectContaining({ providerId: "codex", status: "completed" })],
      status: "completed"
    });
    expect(statusResponse.body).not.toHaveProperty("persistenceWarning");
    expect(getJob).toMatchObject({
      jobId: "dynamic-refresh-20260607T164500000Z",
      status: "completed"
    });
    expect(getJob).not.toHaveProperty("persistenceWarning");
  });

  it("createDynamicIntegrationContractHandler_RefreshStatus_DoesNotRetryExpiredTerminalCache", async () => {
    const baseNowMs = Date.parse("2026-06-07T16:46:00.000Z");
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(baseNowMs);
    let getJob: Record<string, unknown> | undefined;
    let setCalls = 0;
    const refreshJobStore = {
      async get() {
        return getJob;
      },
      async set(_jobId: string, job: Record<string, unknown>) {
        setCalls += 1;
        if (setCalls === 1) {
          getJob = job;
          return;
        }
        throw new Error("disk full");
      }
    };
    const refreshExecutor = vi.fn().mockResolvedValue({
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          completedAt: "2026-06-07T16:46:08.000Z",
          providerId: "codex",
          status: "completed"
        }
      ]
    });
    const handler = createDynamicIntegrationContractHandler({
      asyncRefresh: true,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T16:46:00.000Z"),
      refreshExecutor,
      refreshJobStore
    });

    try {
      await handler({
        body: {
          providers: ["codex"]
        },
        method: "POST",
        path: "/api/refresh"
      });
      await vi.waitFor(() => expect(setCalls).toBeGreaterThanOrEqual(2));

      nowSpy.mockReturnValue(baseNowMs + 31 * 60 * 1000);
      const statusResponse = await handler({
        method: "GET",
        path: "/api/refresh/dynamic-refresh-20260607T164600000Z"
      });

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body).toMatchObject({
        degradedReason: "refresh_job_worker_not_active_after_restart",
        jobId: "dynamic-refresh-20260607T164600000Z",
        providerResults: [expect.objectContaining({ providerId: "codex", status: "failed" })],
        status: "failed"
      });
      expect(statusResponse.body).not.toHaveProperty("persistenceRetryAttempts");
      expect(setCalls).toBe(4);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("createDynamicIntegrationContractHandler_RefreshStatus_ReconcilesPersistedRunningJobAfterRestart", async () => {
    const refreshJobStore = {
      get: vi.fn(async () => ({
        forensicRun: {
          reviewerArtifacts: [{ reviewerModel: "sonnet", status: "queued" }],
          status: "queued"
        },
        jobId: "dynamic-refresh-abandoned",
        providerResults: [{ providerId: "codex", status: "running" }],
        status: "running"
      })),
      set: vi.fn(async () => undefined)
    };
    const handler = createDynamicIntegrationContractHandler({
      loadSummaries: async () => summaries,
      refreshJobStore
    });

    const response = await handler({
      method: "GET",
      path: "/api/refresh/dynamic-refresh-abandoned"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      forensicRun: {
        reviewerArtifacts: [expect.objectContaining({ reviewerModel: "sonnet", status: "failed" })],
        status: "failed"
      },
      providerResults: [expect.objectContaining({ providerId: "codex", status: "failed" })],
      status: "failed"
    });
    expect(refreshJobStore.set).toHaveBeenCalledWith(
      "dynamic-refresh-abandoned",
      expect.objectContaining({ status: "failed" })
    );
  });

  it("createDynamicIntegrationContractHandler_RefreshStatus_ReadOnlyModeSkipsReconciliationWrite", async () => {
    const refreshJobStore = {
      get: vi.fn(async () => ({
        jobId: "dynamic-refresh-read-only-abandoned",
        providerResults: [{ providerId: "codex", status: "running" }],
        status: "running"
      })),
      set: vi.fn(async () => undefined)
    };
    const handler = createDynamicIntegrationContractHandler({
      env: {
        TOKEN_REPORTING_READ_ONLY: "true"
      },
      loadSummaries: async () => summaries,
      refreshJobStore
    });

    const response = await handler({
      method: "GET",
      path: "/api/refresh/dynamic-refresh-read-only-abandoned"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      persistenceWarning: "refresh_job_reconciliation_not_persisted_read_only",
      status: "failed"
    });
    expect(refreshJobStore.set).not.toHaveBeenCalled();
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_ReadOnlyModeBlocksMutation", async () => {
    const refreshExecutor = vi.fn();
    const handler = createDynamicIntegrationContractHandler({
      env: {
        TOKEN_REPORTING_READ_ONLY: "1"
      },
      loadSummaries: async () => summaries,
      refreshExecutor
    });

    const response = await handler({
      body: { mode: "incremental" },
      method: "POST",
      path: "/api/refresh"
    });

    expect(refreshExecutor).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "read_only",
      message: expect.stringContaining("TOKEN_REPORTING_READ_ONLY")
    });
  });

  it("createDynamicIntegrationContractHandler_RefreshEndpoint_WithForensicFlagCreatesRun", async () => {
    const refreshExecutor = vi.fn().mockResolvedValue({
      huggingFaceCandidateSetId: "hf-candidates-20260607T172000123Z",
      providerResults: [
        {
          accumulatedThrough: "2026-06-07",
          providerId: "codex",
          status: "completed"
        }
      ]
    });
    const forensicExecutor = vi.fn().mockResolvedValue({
      reviewerArtifacts: [
        {
          artifact: {
            artifactKind: "local_model_forensic_review",
            artifactSchemaVersion: "sdlca.bridge.forensic.v0",
            findings: [],
            generatedAt: "2026-06-07T17:20:30.000Z",
            providerKind: "codex",
            providerRole: "reviewer",
            provenance: {
              redacted: true,
              snapshotId: "dynamic-usage-codex-2026-06-07",
              source: "provider_execution"
            },
            recommendations: ["Refresh-triggered forensic review completed."],
            summary: "Refresh-triggered bridge review"
          },
          artifactUri:
            "local://token-reporting/forensics/dynamic-forensic-20260607T172000000Z/reviewers/gpt.json",
          bridgeProviderKind: "codex",
          completedAt: "2026-06-07T17:21:05.000Z",
          reviewerModel: "gpt",
          status: "completed"
        }
      ],
      status: "completed"
    });
    const handler = createDynamicIntegrationContractHandler({
      forensicExecutor,
      loadSummaries: async () => [
        {
          ...summary("codex", "OpenAI Codex", 950_000, 80),
          inputTokens: 850_000,
          outputTokens: 50_000,
          requestCount: 20
        } as ProviderReportSummary
      ],
      now: () => new Date("2026-06-07T17:20:00.000Z"),
      refreshExecutor
    });

    const response = await handler({
      body: {
        includeForensicModelProfiles: true,
        includeHuggingFaceRefresh: true,
        mode: "incremental",
        providers: ["codex"],
        reviewerModels: ["gpt"]
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(refreshExecutor).toHaveBeenCalled();
    expect(forensicExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        huggingFaceCandidateSetId: "hf-candidates-20260607T172000123Z",
        reviewerModels: ["gpt"],
        runId: "dynamic-forensic-20260607T172000000Z",
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      })
    );
    expect(response.body).toMatchObject({
      completedAt: "2026-06-07T17:21:05.000Z",
      forensicRun: {
        parentSynthesis: {
          recommendation: "Refresh-triggered forensic review completed."
        },
        huggingFaceCandidateSetId: "hf-candidates-20260607T172000123Z",
        runId: "dynamic-forensic-20260607T172000000Z",
        status: "completed",
        updatedAt: "2026-06-07T17:21:05.000Z"
      },
      status: "completed"
    });

    const latestResponse = await handler({
      method: "GET",
      path: "/api/local-model-profiles/latest"
    });
    expect(latestResponse.body).toMatchObject({
      runId: "dynamic-forensic-20260607T172000000Z",
      status: "completed"
    });
  });

  it("createDynamicIntegrationContractHandler_ForensicRunEndpoint_CreatesRunAndLatestProfile", async () => {
    const handler = createDynamicIntegrationContractHandler({
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T17:00:00.000Z")
    });

    const response = await handler({
      body: {
        huggingFaceCandidateSetId: "hf-candidates-20260607T164524201Z",
        reviewerModels: ["sonnet", "gpt"],
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      },
      method: "POST",
      path: "/api/local-model-profiles/forensic-runs"
    });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      contractVersion: "sdlca-token-reporting-dynamic-v0.1",
      degradedReason: "bridge_forensic_executor_not_configured",
      huggingFaceCandidateSetId: "hf-candidates-20260607T164524201Z",
      runId: "dynamic-forensic-20260607T170000000Z",
      status: "degraded",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });
    expect(response.body).toMatchObject({
      evidencePacket: {
        artifactUri: "local://token-reporting/forensics/dynamic-forensic-20260607T170000000Z/evidence-packet.json",
        providerSnapshotIds: [
          "dynamic-usage-claude-2026-06-07",
          "dynamic-usage-codex-2026-06-07",
          "dynamic-usage-cursor-2026-06-07"
        ]
      },
      reviewerArtifacts: [
        expect.objectContaining({
          artifactUri: "local://token-reporting/forensics/dynamic-forensic-20260607T170000000Z/reviewers/sonnet.json",
          degradedReason: "bridge_forensic_executor_not_configured",
          reviewerModel: "sonnet",
          status: "failed"
        }),
        expect.objectContaining({
          artifactUri: "local://token-reporting/forensics/dynamic-forensic-20260607T170000000Z/reviewers/gpt.json",
          degradedReason: "bridge_forensic_executor_not_configured",
          reviewerModel: "gpt",
          status: "failed"
        })
      ]
    });

    const latestResponse = await handler({
      method: "GET",
      path: "/api/local-model-profiles/latest"
    });

    expect(latestResponse.status).toBe(200);
    expect(latestResponse.body).toMatchObject({
      generatedAt: "2026-06-07T17:00:00.000Z",
      recommendation: null,
      runId: "dynamic-forensic-20260607T170000000Z",
      status: "degraded"
    });
  });

  it("createDynamicIntegrationContractHandler_ForensicRunEndpoint_ReadOnlyModeBlocksMutation", async () => {
    const handler = createDynamicIntegrationContractHandler({
      env: {
        TOKEN_REPORTING_READ_ONLY: "1"
      },
      loadSummaries: async () => summaries
    });

    const response = await handler({
      body: {
        reviewerModels: ["sonnet"]
      },
      method: "POST",
      path: "/api/local-model-profiles/forensic-runs"
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "read_only",
      message: expect.stringContaining("TOKEN_REPORTING_READ_ONLY")
    });
  });

  it("createDynamicIntegrationContractHandler_ForensicRunEndpoint_UsesConfiguredBridgeExecutor", async () => {
    const forensicExecutor = vi.fn().mockResolvedValue({
      reviewerArtifacts: [
        {
          artifact: {
            artifactKind: "local_model_forensic_review",
            artifactSchemaVersion: "sdlca.bridge.forensic.v0",
            findings: [],
            generatedAt: "2026-06-07T17:30:30.000Z",
            providerKind: "codex",
            providerRole: "reviewer",
            provenance: {
              redacted: true,
              snapshotId: "dynamic-usage-codex-2026-06-07",
              source: "provider_execution"
            },
            recommendations: ["Prefer Qwen2.5-Coder 32B for code-heavy work."],
            summary: "Codex reviewer completed the forensic review."
          },
          artifactUri:
            "local://token-reporting/forensics/dynamic-forensic-20260607T173000000Z/reviewers/gpt.json",
          bridgeProviderKind: "codex",
          reviewerModel: "gpt",
          status: "completed"
        }
      ],
      status: "completed"
    });
    const handler = createDynamicIntegrationContractHandler({
      forensicExecutor,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T17:30:00.000Z")
    });

    const response = await handler({
      body: {
        huggingFaceCandidateSetId: "hf-candidates-20260607T164524201Z",
        reviewerModels: ["gpt"],
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      },
      method: "POST",
      path: "/api/local-model-profiles/forensic-runs"
    });

    expect(forensicExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt: "2026-06-07T17:30:00.000Z",
        huggingFaceCandidateSetId: "hf-candidates-20260607T164524201Z",
        reviewerModels: ["gpt"],
        runId: "dynamic-forensic-20260607T173000000Z",
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      })
    );
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      degradedReason: undefined,
      parentSynthesis: {
        confidence: 0.7,
        dissentingFindings: [],
        recommendation: "Prefer Qwen2.5-Coder 32B for code-heavy work."
      },
      reviewerArtifacts: [
        expect.objectContaining({
          artifact: expect.objectContaining({
            artifactSchemaVersion: "sdlca.bridge.forensic.v0",
            summary: "Codex reviewer completed the forensic review."
          }),
          bridgeProviderKind: "codex",
          reviewerModel: "gpt",
          status: "completed"
        })
      ],
      runId: "dynamic-forensic-20260607T173000000Z",
      status: "completed"
    });

    const latestResponse = await handler({
      method: "GET",
      path: "/api/local-model-profiles/latest"
    });
    expect(latestResponse.body).toMatchObject({
      recommendation: {
        confidence: 0.7,
        modelId: "hf-candidates-20260607T164524201Z",
        rationale: "Prefer Qwen2.5-Coder 32B for code-heavy work."
      },
      runId: "dynamic-forensic-20260607T173000000Z",
      status: "completed"
    });
  });

  it("createDynamicIntegrationContractHandler_ForensicRunEndpoint_ReportsDegradedBridgeDispatch", async () => {
    const forensicExecutor = vi.fn().mockResolvedValue({
      degradedReason: "bridge_forensic_provider_unavailable",
      reviewerArtifacts: [
        {
          artifactUri:
            "local://token-reporting/forensics/dynamic-forensic-20260607T173000000Z/reviewers/gpt.json",
          bridgeProviderKind: "codex",
          degradedReason: "bridge_forensic_provider_unavailable",
          reviewerModel: "gpt",
          status: "failed"
        }
      ],
      status: "degraded"
    });
    const handler = createDynamicIntegrationContractHandler({
      forensicExecutor,
      loadSummaries: async () => summaries,
      now: () => new Date("2026-06-07T17:30:00.000Z")
    });

    const response = await handler({
      body: {
        reviewerModels: ["gpt"],
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      },
      method: "POST",
      path: "/api/local-model-profiles/forensic-runs"
    });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      bridgeDispatch: {
        executionKind: "forensic",
        status: "degraded"
      },
      degradedReason: "bridge_forensic_provider_unavailable",
      reviewerArtifacts: [
        expect.objectContaining({
          bridgeProviderKind: "codex",
          degradedReason: "bridge_forensic_provider_unavailable",
          reviewerModel: "gpt",
          status: "failed"
        })
      ],
      runId: "dynamic-forensic-20260607T173000000Z",
      status: "degraded"
    });
  });
});
