export type IntegrationContractMethod = "DELETE" | "GET" | "OPTIONS" | "POST" | "PUT";

export interface IntegrationContractRequest {
  body?: unknown;
  method: string;
  path: string;
}

export interface IntegrationContractResponse {
  body: unknown;
  headers?: Record<string, string>;
  status: number;
}

const allProviderIds = ["claude", "codex", "cursor", "github-copilot", "claude-code"];

export const staticContractFixtures = {
  contract: {
    capabilities: [
      "provider-usage-refresh",
      "historical-usage-accumulation",
      "report-export",
      "budget-status",
      "forecast",
      "local-model-forensics"
    ],
    contractId: "kdtix.token-reporting.integration",
    contractVersion: "sdlca-token-reporting-static-v0.1",
    endpoints: [
      { method: "GET", path: "/api/integration/contract" },
      { method: "POST", path: "/api/refresh" },
      { method: "GET", path: "/api/refresh/:jobId" },
      { method: "GET", path: "/api/providers/:providerId/usage" },
      { method: "GET", path: "/api/budgets" },
      { method: "GET", path: "/api/providers/:providerId/budget-status" },
      { method: "POST", path: "/api/exports" },
      { method: "GET", path: "/api/local-model-profiles/latest" },
      { method: "POST", path: "/api/local-model-profiles/forensic-runs" }
    ],
    issue: "kdtix-open/agent-project-queue#1244",
    serviceId: "kdtix.token-reporting"
  },
  budgetByProvider: {
    "claude": {
      budgetKind: "tokens_per_day",
      confidence: 0.92,
      dispatchGuard: {
        allowDispatch: true,
        decision: "allow",
        reasonCodes: ["healthy_budget", "fresh_snapshot"]
      },
      estimatedDispatchesRemaining: {
        reviewer: 18,
        worker: 11
      },
      forecastWindowMinutes: 240,
      lastFetchedAt: "2026-06-06T20:00:00.000Z",
      limit: 120_000_000,
      provenance: {
        redacted: true,
        source: "static_fixture",
        snapshotId: "static-budget-snapshot-claude-001"
      },
      providerId: "claude",
      providerLabel: "Claude",
      remaining: 87_500_000,
      resetAt: "2026-06-07T00:00:00.000Z",
      scopeId: "tenant:kdtix-open:workspace:claude",
      scopeLabel: "kdtix-open Claude workspace",
      threshold: "green",
      used: 32_500_000
    },
    "codex": {
      budgetKind: "tokens_per_day",
      confidence: 0.81,
      dispatchGuard: {
        allowDispatch: true,
        decision: "prefer_alternate",
        recommendedProviderId: "claude",
        reasonCodes: ["near_token_exhaustion", "high_worker_completion_risk"]
      },
      estimatedDispatchesRemaining: {
        reviewer: 3,
        worker: 1
      },
      forecastWindowMinutes: 120,
      lastFetchedAt: "2026-06-06T20:00:00.000Z",
      limit: 300_000_000,
      provenance: {
        redacted: true,
        source: "static_fixture",
        snapshotId: "static-budget-snapshot-codex-001"
      },
      providerId: "codex",
      providerLabel: "OpenAI Codex",
      remaining: 14_200_000,
      resetAt: "2026-06-07T00:00:00.000Z",
      scopeId: "tenant:kdtix-open:project:codex",
      scopeLabel: "kdtix-open Codex project",
      threshold: "red",
      used: 285_800_000
    },
    "cursor": {
      budgetKind: "requests_per_month",
      confidence: 0.88,
      dispatchGuard: {
        allowDispatch: false,
        decision: "block",
        reasonCodes: ["budget_exhausted", "cooldown_required"]
      },
      estimatedDispatchesRemaining: {
        reviewer: 0,
        worker: 0
      },
      forecastWindowMinutes: 60,
      lastFetchedAt: "2026-06-06T20:00:00.000Z",
      limit: 10_000,
      provenance: {
        redacted: true,
        source: "static_fixture",
        snapshotId: "static-budget-snapshot-cursor-001"
      },
      providerId: "cursor",
      providerLabel: "Cursor",
      remaining: 0,
      resetAt: "2026-07-01T00:00:00.000Z",
      retryAfterSeconds: 2_100_000,
      scopeId: "tenant:kdtix-open:team:cursor",
      scopeLabel: "kdtix-open Cursor team",
      threshold: "exhausted",
      used: 10_000
    },
    "github-copilot": {
      budgetKind: "seat_based_monthly_spend",
      confidence: 0.74,
      dispatchGuard: {
        allowDispatch: true,
        decision: "allow",
        reasonCodes: ["seat_based_budget", "no_hard_token_limit_reported"]
      },
      estimatedDispatchesRemaining: {
        reviewer: 999,
        worker: 999
      },
      forecastWindowMinutes: 1440,
      lastFetchedAt: "2026-06-06T20:00:00.000Z",
      limit: 500,
      provenance: {
        redacted: true,
        source: "static_fixture",
        snapshotId: "static-budget-snapshot-github-copilot-001"
      },
      providerId: "github-copilot",
      providerLabel: "GitHub Copilot",
      remaining: 429.07,
      resetAt: "2026-07-01T00:00:00.000Z",
      scopeId: "tenant:kdtix-open:org:github-copilot",
      scopeLabel: "kdtix-open GitHub Copilot org",
      threshold: "green",
      used: 70.93
    },
    "claude-code": {
      budgetKind: "tokens_per_day",
      confidence: 0.79,
      dispatchGuard: {
        allowDispatch: true,
        decision: "allow",
        reasonCodes: ["workspace_pool_isolated", "fresh_snapshot"]
      },
      estimatedDispatchesRemaining: {
        reviewer: 9,
        worker: 6
      },
      forecastWindowMinutes: 240,
      lastFetchedAt: "2026-06-06T20:00:00.000Z",
      limit: 180_000_000,
      provenance: {
        redacted: true,
        source: "static_fixture",
        snapshotId: "static-budget-snapshot-claude-code-001"
      },
      providerId: "claude-code",
      providerLabel: "Claude Code",
      remaining: 61_900_000,
      resetAt: "2026-06-07T00:00:00.000Z",
      scopeId: "tenant:kdtix-open:workspace:claude-code",
      scopeLabel: "kdtix-open Claude Code workspace",
      threshold: "amber",
      used: 118_100_000
    }
  },
  exportReceipt: {
    artifactId: "static-export-json-001",
    expiresAt: "2026-06-06T21:00:00.000Z",
    format: "json",
    mimeType: "application/json",
    status: "ready"
  },
  forensicRun: {
    huggingFaceCandidateSetId: "static-hf-candidates-2026-06-06",
    parentSynthesisArtifactUri: "static://token-reporting/forensics/parent-synthesis.json",
    runId: "static-forensic-run-001",
    status: "completed",
    usageSnapshotId: "static-usage-snapshot-001"
  },
  latestModelProfile: {
    generatedAt: "2026-06-06T20:00:00.000Z",
    recommendation: {
      confidence: 0.84,
      modelId: "Qwen/Qwen2.5-7B-Instruct-1M",
      rationale: "Static fixture: large context fit with moderate local footprint."
    },
    runId: "static-forensic-run-001",
    status: "completed"
  },
  refreshJob: {
    completedAt: "2026-06-06T20:02:00.000Z",
    jobId: "static-refresh-001",
    startedAt: "2026-06-06T20:00:00.000Z",
    status: "completed"
  },
  usageByProvider: {
    "claude": {
      providerId: "claude",
      providerLabel: "Claude",
      reportEndDay: "2026-06-06",
      reportStartDay: "2025-06-06",
      snapshotId: "static-usage-snapshot-claude-001",
      totals: {
        cacheCreationTokens: 2_100_000,
        cacheReadTokens: 203_060_000,
        inputTokens: 1_890_000,
        outputTokens: 1_600_000,
        requestsCount: 42_000,
        totalCostUsd: 217.58
      }
    },
    "claude-code": {
      providerId: "claude-code",
      providerLabel: "Claude Code",
      reportEndDay: "2026-06-06",
      reportStartDay: "2026-04-02",
      snapshotId: "static-usage-snapshot-claude-code-001",
      totals: {
        cacheCreationTokens: 0,
        cacheReadTokens: 17_390_000_000,
        inputTokens: 1_850_000,
        outputTokens: 64_030_000,
        requestsCount: 53_000,
        totalCostUsd: 274.84
      }
    },
    "codex": {
      providerId: "codex",
      providerLabel: "OpenAI Codex",
      reportEndDay: "2026-06-07",
      reportStartDay: "2026-03-22",
      snapshotId: "static-usage-snapshot-codex-001",
      totals: {
        cacheCreationTokens: 0,
        cacheReadTokens: 247_200_000,
        inputTokens: 272_800_000,
        outputTokens: 1_330_000,
        requestsCount: 77_000,
        totalCostUsd: 292.38
      }
    },
    "cursor": {
      providerId: "cursor",
      providerLabel: "Cursor",
      reportEndDay: "2026-06-07",
      reportStartDay: "2026-03-22",
      snapshotId: "static-usage-snapshot-cursor-001",
      totals: {
        cacheCreationTokens: 0,
        cacheReadTokens: 425_900_000,
        inputTokens: 28_900_000,
        outputTokens: 1_500_000,
        requestsCount: 78_000,
        totalCostUsd: 383.05
      }
    },
    "github-copilot": {
      providerId: "github-copilot",
      providerLabel: "GitHub Copilot",
      reportEndDay: "2026-06-05",
      reportStartDay: "2026-03-22",
      snapshotId: "static-usage-snapshot-github-copilot-001",
      totals: {
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        inputTokens: 8_280_000_000,
        outputTokens: 48_200_000,
        requestsCount: 63_000,
        totalCostUsd: 70.93
      }
    }
  }
} as const;

export async function handleIntegrationContractRequest(
  request: IntegrationContractRequest
): Promise<IntegrationContractResponse> {
  const method = normalizeMethod(request.method);
  const path = normalizePath(request.path);

  if (method === "GET" && path === "/api/integration/contract") {
    return jsonResponse(200, staticContractFixtures.contract);
  }
  if (method === "POST" && path === "/api/refresh") {
    return jsonResponse(202, buildRefreshResponse(request.body));
  }
  if (method === "GET" && path.startsWith("/api/refresh/")) {
    return jsonResponse(200, buildRefreshStatus(path));
  }
  if (method === "GET" && path === "/api/budgets") {
    return jsonResponse(200, buildBudgetsResponse());
  }
  if (method === "GET" && path.startsWith("/api/providers/")) {
    const budgetResponse = providerBudgetStatusResponse(path);
    if (budgetResponse) return budgetResponse;
  }
  if (method === "GET" && path.startsWith("/api/providers/")) {
    return providerUsageResponse(path);
  }
  if (method === "POST" && path === "/api/exports") {
    return jsonResponse(202, staticContractFixtures.exportReceipt);
  }
  if (method === "GET" && path === "/api/local-model-profiles/latest") {
    return jsonResponse(200, staticContractFixtures.latestModelProfile);
  }
  if (method === "POST" && path === "/api/local-model-profiles/forensic-runs") {
    return jsonResponse(202, buildForensicRunResponse(request.body));
  }

  return jsonResponse(404, {
    code: "not_found",
    message: `No static integration fixture exists for ${method} ${path}`
  });
}

function buildForensicRunResponse(body: unknown): Record<string, unknown> {
  const requestedModels = readStringArrayField(body, "reviewerModels");
  const reviewerModels = requestedModels.length > 0 ? requestedModels : ["sonnet", "gpt"];

  return {
    ...staticContractFixtures.forensicRun,
    reviewerArtifacts: reviewerModels.map((reviewerModel) => ({
      artifactUri: `static://token-reporting/forensics/${reviewerModel}.json`,
      reviewerModel,
      status: "completed"
    })),
    usageSnapshotId: readStringField(body, "usageSnapshotId") ?? "static-usage-snapshot-001"
  };
}

function buildBudgetsResponse(): Record<string, unknown> {
  const budgets = Object.values(staticContractFixtures.budgetByProvider);

  return {
    budgets,
    contractVersion: staticContractFixtures.contract.contractVersion,
    generatedAt: "2026-06-06T20:00:00.000Z",
    status: budgets.some((budget) => budget.threshold === "exhausted") ? "degraded" : "healthy"
  };
}

function buildRefreshResponse(body: unknown): Record<string, unknown> {
  const requestedProviders = readStringArrayField(body, "providers");
  const providerIds = requestedProviders.length > 0 ? requestedProviders : allProviderIds;
  const scenario = readStringField(body, "scenario");
  const status = scenario === "degraded" ? "degraded" : "completed";

  return {
    ...staticContractFixtures.refreshJob,
    mode: readStringField(body, "mode") ?? "incremental",
    providerResults: providerIds.map((providerId) => providerRefreshResult(providerId, scenario)),
    status
  };
}

function buildRefreshStatus(path: string): Record<string, unknown> {
  const jobId = path.split("/").at(-1) ?? staticContractFixtures.refreshJob.jobId;

  return {
    ...staticContractFixtures.refreshJob,
    jobId
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(status: number, body: unknown): IntegrationContractResponse {
  return {
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Token-Reporting-Contract": staticContractFixtures.contract.contractVersion
    },
    status
  };
}

function normalizeMethod(method: string): IntegrationContractMethod {
  const normalized = method.trim().toUpperCase();
  if (["DELETE", "GET", "OPTIONS", "POST", "PUT"].includes(normalized)) {
    return normalized as IntegrationContractMethod;
  }

  return "GET";
}

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? "/";
  return withoutQuery.endsWith("/") && withoutQuery !== "/"
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

function providerRefreshResult(providerId: string, scenario: string | undefined) {
  if (scenario === "degraded" && providerId === "cursor") {
    return {
      accumulatedThrough: "2026-06-06",
      degradedReason: "static_fixture_provider_rate_limited",
      providerId,
      status: "degraded"
    };
  }

  return {
    accumulatedThrough: "2026-06-06",
    providerId,
    status: "completed"
  };
}

function providerBudgetStatusResponse(path: string): IntegrationContractResponse | undefined {
  const match = /^\/api\/providers\/([^/]+)\/budget-status$/.exec(path);
  if (!match) return undefined;

  const providerId = match[1];
  const budget = (staticContractFixtures.budgetByProvider as Record<string, unknown>)[providerId];

  if (!budget) {
    return jsonResponse(404, {
      code: "provider_budget_not_found",
      message: `No static provider budget fixture exists for ${providerId}`
    });
  }

  return jsonResponse(200, budget);
}

function providerUsageResponse(path: string): IntegrationContractResponse {
  const match = /^\/api\/providers\/([^/]+)\/usage$/.exec(path);
  const providerId = match?.[1];
  const usage = providerId
    ? (staticContractFixtures.usageByProvider as Record<string, unknown>)[providerId]
    : undefined;

  if (!usage) {
    return jsonResponse(404, {
      code: "provider_not_found",
      message: `No static provider usage fixture exists for ${providerId ?? "unknown"}`
    });
  }

  return jsonResponse(200, usage);
}

function readStringArrayField(value: unknown, field: string): string[] {
  if (!isRecord(value)) return [];
  const raw = value[field];

  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function readStringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value[field];

  return typeof raw === "string" ? raw : undefined;
}
