import { describe, expect, it } from "vitest";

import {
  handleIntegrationContractRequest,
  staticContractFixtures
} from "../integrationContractStub";

describe("integrationContractStub", () => {
  it("handleIntegrationContractRequest_ContractEndpoint_ReturnsManifestAndCapabilities", async () => {
    const response = await handleIntegrationContractRequest({
      method: "GET",
      path: "/api/integration/contract"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contractId: "kdtix.token-reporting.integration",
      contractVersion: "sdlca-token-reporting-static-v0.1",
      serviceId: "kdtix.token-reporting"
    });
    const body = response.body as {
      capabilities: string[];
      endpoints: Array<{ method: string; path: string }>;
    };

    expect(body.capabilities).toContain("local-model-forensics");
    expect(body.endpoints).toContainEqual({
      method: "POST",
      path: "/api/refresh"
    });
    expect(body.endpoints).toContainEqual({
      method: "GET",
      path: "/api/budgets"
    });
    expect(body.endpoints).toContainEqual({
      method: "GET",
      path: "/api/providers/:providerId/budget-status"
    });
  });

  it("handleIntegrationContractRequest_RefreshEndpoint_ReturnsDeterministicCompletedJob", async () => {
    const response = await handleIntegrationContractRequest({
      body: {
        includeForensicModelProfiles: true,
        includeHuggingFaceRefresh: true,
        mode: "incremental",
        providers: ["claude", "codex"]
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      jobId: staticContractFixtures.refreshJob.jobId,
      mode: "incremental",
      status: "completed"
    });
    const body = response.body as {
      providerResults: Array<{ providerId: string; status: string }>;
    };

    expect(body.providerResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: "claude", status: "completed" }),
        expect.objectContaining({ providerId: "codex", status: "completed" })
      ])
    );
  });

  it("handleIntegrationContractRequest_RefreshEndpoint_CanReturnDegradedFixture", async () => {
    const response = await handleIntegrationContractRequest({
      body: {
        mode: "incremental",
        scenario: "degraded"
      },
      method: "POST",
      path: "/api/refresh"
    });

    expect(response.status).toBe(202);
    const body = response.body as {
      providerResults: Array<Record<string, unknown>>;
      status: string;
    };

    expect(body.status).toBe("degraded");
    expect(body.providerResults).toContainEqual(
      expect.objectContaining({
        degradedReason: "static_fixture_provider_rate_limited",
        providerId: "cursor",
        status: "degraded"
      })
    );
  });

  it("handleIntegrationContractRequest_UsageEndpoint_ReturnsAccumulatedProviderUsage", async () => {
    const response = await handleIntegrationContractRequest({
      method: "GET",
      path: "/api/providers/claude/usage"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      providerId: "claude",
      reportStartDay: "2025-06-06",
      reportEndDay: "2026-06-06",
      totals: {
        cacheReadTokens: 203_060_000,
        inputTokens: 1_890_000,
        outputTokens: 1_600_000,
        totalCostUsd: 217.58
      }
    });
  });

  it("handleIntegrationContractRequest_BudgetsEndpoint_ReturnsDispatchRiskFixtures", async () => {
    const response = await handleIntegrationContractRequest({
      method: "GET",
      path: "/api/budgets"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contractVersion: "sdlca-token-reporting-static-v0.1",
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

  it("handleIntegrationContractRequest_BudgetStatusEndpoint_ReturnsProviderGuardDetails", async () => {
    const response = await handleIntegrationContractRequest({
      method: "GET",
      path: "/api/providers/codex/budget-status"
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      budgetKind: "tokens_per_day",
      dispatchGuard: {
        decision: "prefer_alternate",
        reasonCodes: ["near_token_exhaustion", "high_worker_completion_risk"]
      },
      estimatedDispatchesRemaining: {
        reviewer: 3,
        worker: 1
      },
      providerId: "codex",
      threshold: "red"
    });
  });

  it("handleIntegrationContractRequest_ForensicRunEndpoint_ReturnsReviewerArtifacts", async () => {
    const response = await handleIntegrationContractRequest({
      body: {
        reviewerModels: ["sonnet", "gpt"],
        usageSnapshotId: "static-usage-snapshot-001"
      },
      method: "POST",
      path: "/api/local-model-profiles/forensic-runs"
    });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      runId: staticContractFixtures.forensicRun.runId,
      status: "completed"
    });
    const body = response.body as {
      reviewerArtifacts: Array<{ reviewerModel: string; status: string }>;
    };

    expect(body.reviewerArtifacts).toEqual([
      expect.objectContaining({ reviewerModel: "sonnet", status: "completed" }),
      expect.objectContaining({ reviewerModel: "gpt", status: "completed" })
    ]);
  });

  it("handleIntegrationContractRequest_UnknownEndpoint_Returns404Envelope", async () => {
    const response = await handleIntegrationContractRequest({
      method: "GET",
      path: "/api/not-real"
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "not_found",
      message: "No static integration fixture exists for GET /api/not-real"
    });
  });
});
