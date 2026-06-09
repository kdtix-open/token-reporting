import fs from "node:fs/promises";
import path from "node:path";

import { providerRegistry } from "../providers/registry";
import { createMemoryForensicRunStore, type ForensicRunStore } from "./forensicRunStore";
import { assertWritableOperationAllowed } from "./permissions";
import {
  handleIntegrationContractRequest,
  staticContractFixtures,
  type IntegrationContractRequest,
  type IntegrationContractResponse
} from "./integrationContractStub";
import { createMemoryRefreshJobStore, type RefreshJobStore } from "./refreshJobStore";
import type { ProviderReportSummary } from "./types";

export interface DynamicProviderBudgetLimit {
  budgetKind: string;
  limit: number;
  resetAt?: string;
  scopeId?: string;
  scopeLabel?: string;
}

export type DynamicRefreshMode = "historical" | "incremental";
export type DynamicProviderRefreshStatus = "completed" | "degraded" | "failed" | "skipped";

export interface DynamicRefreshRequest {
  includeForensicModelProfiles: boolean;
  includeHuggingFaceRefresh: boolean;
  mode: DynamicRefreshMode;
  providers: string[];
  reviewerModels: string[];
}

export interface DynamicProviderRefreshResult {
  accumulatedThrough?: string;
  completedAt?: string;
  degradedReason?: string;
  providerId: string;
  startedAt?: string;
  status: DynamicProviderRefreshStatus;
}

export interface DynamicRefreshExecutionResult {
  huggingFaceCandidateSetId?: string;
  providerResults: DynamicProviderRefreshResult[];
}

export type DynamicRefreshExecutor = (
  request: DynamicRefreshRequest
) => Promise<DynamicRefreshExecutionResult>;

export interface DynamicForensicReviewerArtifact {
  artifact?: Record<string, unknown>;
  artifactUri: string;
  bridgeProviderKind?: string;
  degradedReason?: string;
  diagnostics?: Record<string, unknown>;
  reviewerModel: string;
  status: "queued" | "running" | "completed" | "failed";
}

export interface DynamicForensicRunRequest {
  createdAt: string;
  evidencePacket: Record<string, unknown>;
  huggingFaceCandidateSetId: string;
  reviewerModels: string[];
  runId: string;
  usageSnapshotId: string;
}

export interface DynamicForensicExecutionResult {
  degradedReason?: string;
  reviewerArtifacts: DynamicForensicReviewerArtifact[];
  status: "completed" | "degraded" | "failed";
}

export type DynamicForensicExecutor = (
  request: DynamicForensicRunRequest
) => Promise<DynamicForensicExecutionResult>;

export interface DynamicIntegrationContractOptions {
  budgetLimits?: Record<string, DynamicProviderBudgetLimit>;
  dataRoot?: string;
  env?: NodeJS.ProcessEnv;
  forensicExecutor?: DynamicForensicExecutor;
  loadSummaries?: () => Promise<ProviderReportSummary[]>;
  now?: () => Date;
  forensicRunStore?: ForensicRunStore;
  refreshExecutor?: DynamicRefreshExecutor;
  refreshJobStore?: RefreshJobStore;
}

const dynamicContractVersion = "sdlca-token-reporting-dynamic-v0.1";

export function createDynamicIntegrationContractHandler(
  options: DynamicIntegrationContractOptions = {}
): (request: IntegrationContractRequest) => Promise<IntegrationContractResponse> {
  const now = options.now ?? (() => new Date());
  const env = options.env ?? process.env;
  const loadSummaries =
    options.loadSummaries ??
    (() => loadProviderSummariesFromDataRoot(options.dataRoot ?? path.resolve("public/data")));
  const forensicRunStore = options.forensicRunStore ?? createMemoryForensicRunStore();
  const refreshJobStore = options.refreshJobStore ?? createMemoryRefreshJobStore();

  return async (request) => {
    const method = request.method.trim().toUpperCase();
    const requestPath = normalizePath(request.path);

    if (method === "GET" && requestPath === "/api/integration/contract") {
      return jsonResponse(200, {
        ...staticContractFixtures.contract,
        contractVersion: dynamicContractVersion,
        mode: "dynamic"
      });
    }

    if (method === "POST" && requestPath === "/api/refresh") {
      return dynamicRefreshResponse(
        request.body,
        options.forensicExecutor,
        forensicRunStore,
        options.refreshExecutor,
        loadSummaries,
        refreshJobStore,
        now(),
        env
      );
    }

    if (method === "GET" && requestPath.startsWith("/api/refresh/")) {
      return dynamicRefreshStatusResponse(requestPath, refreshJobStore);
    }

    if (method === "POST" && requestPath === "/api/local-model-profiles/forensic-runs") {
      return dynamicForensicRunResponse(
        request.body,
        options.forensicExecutor,
        loadSummaries,
        forensicRunStore,
        now(),
        env
      );
    }

    if (method === "GET" && requestPath === "/api/local-model-profiles/latest") {
      const latestResponse = await dynamicLatestLocalModelProfileResponse(forensicRunStore);
      if (latestResponse) return latestResponse;
    }

    if (method === "GET" && requestPath === "/api/budgets") {
      const summaries = await loadSummaries();
      return jsonResponse(
        200,
        buildDynamicBudgetsResponse(summaries, options.budgetLimits ?? {}, now())
      );
    }

    if (method === "GET" && requestPath.startsWith("/api/providers/")) {
      const budgetResponse = await dynamicBudgetStatusResponse(
        requestPath,
        loadSummaries,
        options.budgetLimits ?? {},
        now()
      );
      if (budgetResponse) return budgetResponse;

      const usageResponse = await dynamicUsageResponse(requestPath, loadSummaries);
      if (usageResponse) return usageResponse;
    }

    const fallback = await handleIntegrationContractRequest(request);
    return {
      ...fallback,
      headers: {
        ...fallback.headers,
        "X-Token-Reporting-Contract": dynamicContractVersion
      }
    };
  };
}

export async function loadProviderSummariesFromDataRoot(
  dataRoot: string
): Promise<ProviderReportSummary[]> {
  const summaries: ProviderReportSummary[] = [];

  for (const adapter of providerRegistry) {
    const raw = await readFirstJson(
      snapshotPaths(adapter.dataPath).map((snapshotPath) => path.join(dataRoot, snapshotPath))
    );
    summaries.push(raw === undefined ? adapter.seedSummary : adapter.transformSnapshot(raw));
  }

  return summaries;
}

function buildDynamicBudgetsResponse(
  summaries: ProviderReportSummary[],
  budgetLimits: Record<string, DynamicProviderBudgetLimit>,
  generatedAt: Date
): Record<string, unknown> {
  const budgets = summaries.map((summary) =>
    buildProviderBudgetStatus(summary, budgetLimits[summary.providerId], generatedAt)
  );

  return {
    budgets,
    contractVersion: dynamicContractVersion,
    generatedAt: generatedAt.toISOString(),
    status: budgets.some((budget) => budget.threshold === "exhausted") ? "degraded" : "healthy"
  };
}

function buildProviderBudgetStatus(
  summary: ProviderReportSummary,
  budgetLimit: DynamicProviderBudgetLimit | undefined,
  generatedAt: Date
): Record<string, unknown> {
  const budgetKind = budgetLimit?.budgetKind ?? inferredBudgetKind(summary);
  const used = Math.max(0, budgetUsageForKind(summary, budgetKind));
  const limit = Math.max(0, budgetLimit?.limit ?? used * 1.25);
  const remaining = Math.max(0, limit - used);
  const threshold = classifyThreshold(used, limit);
  const dispatchGuard = dispatchGuardForThreshold(threshold);
  const avgObservedUnits =
    summary.spendProjection.windowDays > 0 ? used / summary.spendProjection.windowDays : used;
  const reviewerEstimate = Math.floor(remaining / Math.max(1, avgObservedUnits));
  const workerEstimate = Math.floor(remaining / Math.max(1, avgObservedUnits * 2));

  return {
    budgetKind,
    confidence: budgetLimit ? 0.78 : 0.48,
    dispatchGuard,
    estimatedDispatchesRemaining: {
      reviewer: reviewerEstimate,
      worker: workerEstimate
    },
    forecastWindowMinutes: summary.spendProjection.windowDays * 24 * 60,
    lastFetchedAt: generatedAt.toISOString(),
    limit,
    provenance: {
      redacted: true,
      source: "accumulated_provider_snapshot",
      snapshotId: `dynamic-budget-${summary.providerId}-${summary.reportEndDay}`
    },
    providerId: summary.providerId,
    providerLabel: summary.providerLabel,
    remaining,
    resetAt: budgetLimit?.resetAt,
    scopeId: budgetLimit?.scopeId ?? `provider:${summary.providerId}`,
    scopeLabel: budgetLimit?.scopeLabel ?? summary.providerLabel,
    threshold,
    used
  };
}

async function dynamicRefreshResponse(
  body: unknown,
  forensicExecutor: DynamicForensicExecutor | undefined,
  forensicRunStore: ForensicRunStore,
  refreshExecutor: DynamicRefreshExecutor | undefined,
  loadSummaries: () => Promise<ProviderReportSummary[]>,
  refreshJobStore: RefreshJobStore,
  generatedAt: Date,
  env: NodeJS.ProcessEnv
): Promise<IntegrationContractResponse> {
  try {
    assertWritableOperationAllowed("Token Reporting provider refresh", env);
  } catch (error) {
    return jsonResponse(403, {
      code: "read_only",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const refreshRequest = readRefreshRequest(body);
  const validationError = validateRefreshProviders(refreshRequest.providers);
  if (validationError) return validationError;

  const executor = refreshExecutor ?? defaultRefreshExecutor;
  const jobId = `dynamic-refresh-${compactTimestamp(generatedAt)}`;
  const startedAt = generatedAt.toISOString();

  let executionResult: DynamicRefreshExecutionResult;
  try {
    executionResult = await executor(refreshRequest);
  } catch (error) {
    executionResult = {
      providerResults: refreshRequest.providers.map((providerId) => ({
        degradedReason: error instanceof Error ? error.message : String(error),
        providerId,
        status: "failed"
      }))
    };
  }

  const summaries = await loadSummaries().catch(() => [] as ProviderReportSummary[]);
  const summariesByProvider = new Map(summaries.map((summary) => [summary.providerId, summary]));
  const resultsByProvider = new Map(
    executionResult.providerResults.map((result) => [result.providerId, result])
  );
  const completedAt = generatedAt.toISOString();
  const providerResults = refreshRequest.providers.map((providerId) => {
    const result = resultsByProvider.get(providerId) ?? {
      degradedReason: "dynamic_refresh_executor_returned_no_result",
      providerId,
      status: "degraded" as const
    };
    const summary = summariesByProvider.get(providerId);

    return {
      accumulatedThrough: result.accumulatedThrough ?? summary?.reportEndDay,
      completedAt: result.completedAt ?? completedAt,
      degradedReason: result.degradedReason,
      providerId,
      startedAt: result.startedAt ?? startedAt,
      status: result.status
    };
  });
  const refreshStatus = refreshJobStatus(providerResults);
  const refreshHuggingFaceCandidateSetId =
    readStringField(body, "huggingFaceCandidateSetId") ??
    executionResult.huggingFaceCandidateSetId;
  const forensicRun = refreshRequest.includeForensicModelProfiles
    ? await createDynamicForensicRun({
        body: {
          huggingFaceCandidateSetId: refreshHuggingFaceCandidateSetId,
          reviewerModels: refreshRequest.reviewerModels,
          usageSnapshotId: readStringField(body, "usageSnapshotId")
        },
        forensicExecutor,
        forensicRunStore,
        generatedAt,
        loadSummaries
      })
    : undefined;
  const status = combinedRefreshStatus(refreshStatus, readStringField(forensicRun, "status"));
  const job = {
    completedAt,
    contractVersion: dynamicContractVersion,
    forensicRun,
    huggingFaceCandidateSetId: refreshHuggingFaceCandidateSetId,
    includeForensicModelProfiles: refreshRequest.includeForensicModelProfiles,
    includeHuggingFaceRefresh: refreshRequest.includeHuggingFaceRefresh,
    jobId,
    mode: refreshRequest.mode,
    providerResults,
    startedAt,
    status
  };

  await refreshJobStore.set(jobId, job);

  return jsonResponse(status === "failed" ? 500 : 202, job);
}

async function dynamicRefreshStatusResponse(
  requestPath: string,
  refreshJobStore: RefreshJobStore
): Promise<IntegrationContractResponse> {
  const jobId = requestPath.split("/").at(-1) ?? "";
  const job = await refreshJobStore.get(jobId);
  if (!job) {
    return jsonResponse(404, {
      code: "refresh_job_not_found",
      message: `No dynamic refresh job exists for ${jobId}`
    });
  }

  return jsonResponse(200, job);
}

async function dynamicForensicRunResponse(
  body: unknown,
  forensicExecutor: DynamicForensicExecutor | undefined,
  loadSummaries: () => Promise<ProviderReportSummary[]>,
  forensicRunStore: ForensicRunStore,
  generatedAt: Date,
  env: NodeJS.ProcessEnv
): Promise<IntegrationContractResponse> {
  try {
    assertWritableOperationAllowed("Token Reporting local-model forensic run", env);
  } catch (error) {
    return jsonResponse(403, {
      code: "read_only",
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const run = await createDynamicForensicRun({
    body,
    forensicExecutor,
    forensicRunStore,
    generatedAt,
    loadSummaries
  });

  return jsonResponse(202, run);
}

async function createDynamicForensicRun(args: {
  body: unknown;
  forensicExecutor: DynamicForensicExecutor | undefined;
  forensicRunStore: ForensicRunStore;
  generatedAt: Date;
  loadSummaries: () => Promise<ProviderReportSummary[]>;
}): Promise<Record<string, unknown>> {
  const { body, forensicExecutor, forensicRunStore, generatedAt, loadSummaries } = args;
  const createdAt = generatedAt.toISOString();
  const runId = `dynamic-forensic-${compactTimestamp(generatedAt)}`;
  const reviewerModels = readForensicReviewerModels(body);
  const summaries = await loadSummaries().catch(() => [] as ProviderReportSummary[]);
  const providerSnapshotIds = summaries.map(
    (summary) => `dynamic-usage-${summary.providerId}-${summary.reportEndDay}`
  );
  const usageSnapshotId =
    readStringField(body, "usageSnapshotId") ??
    providerSnapshotIds[0] ??
    `dynamic-usage-unavailable-${compactTimestamp(generatedAt)}`;
  const huggingFaceCandidateSetId =
    readStringField(body, "huggingFaceCandidateSetId") ??
    `dynamic-hf-candidates-unavailable-${compactTimestamp(generatedAt)}`;
  const evidencePacketArtifactUri =
    `local://token-reporting/forensics/${runId}/evidence-packet.json`;
  const evidencePacket = {
    artifactUri: evidencePacketArtifactUri,
    generatedAt: createdAt,
    huggingFaceCandidateSetId,
    providerSnapshotIds,
    usageSnapshotId
  };
  const queuedArtifacts = reviewerModels.map((reviewerModel) => ({
    artifactUri: `local://token-reporting/forensics/${runId}/reviewers/${encodeURIComponent(
      reviewerModel
    )}.json`,
    reviewerModel,
    status: "queued" as const
  }));
  const executionResult = forensicExecutor
    ? await forensicExecutor({
        createdAt,
        evidencePacket,
        huggingFaceCandidateSetId,
        reviewerModels,
        runId,
        usageSnapshotId
      }).catch((error) => ({
        degradedReason: error instanceof Error ? error.message : String(error),
        reviewerArtifacts: queuedArtifacts.map((artifact) => ({
          ...artifact,
          degradedReason: error instanceof Error ? error.message : String(error),
          status: "failed" as const
        })),
        status: "failed" as const
      }))
    : {
        degradedReason: "bridge_forensic_executor_not_configured",
        reviewerArtifacts: queuedArtifacts,
        status: "degraded" as const
      };
  const parentSynthesis = buildParentSynthesis(executionResult.reviewerArtifacts);

  const run = {
    bridgeDispatch: {
      executionKind: "forensic",
      status: forensicExecutor ? executionResult.status : "not_configured"
    },
    contractVersion: dynamicContractVersion,
    createdAt,
    degradedReason: executionResult.degradedReason,
    evidencePacket,
    huggingFaceCandidateSetId,
    parentSynthesis,
    parentSynthesisArtifactUri: parentSynthesis
      ? `local://token-reporting/forensics/${runId}/parent-synthesis.json`
      : undefined,
    reviewerArtifacts: executionResult.reviewerArtifacts,
    reviewerModels,
    runId,
    status: executionResult.status,
    updatedAt: createdAt,
    usageSnapshotId
  };

  await forensicRunStore.set(runId, run);

  return run;
}

async function dynamicLatestLocalModelProfileResponse(
  forensicRunStore: ForensicRunStore
): Promise<IntegrationContractResponse | undefined> {
  const latest = await forensicRunStore.latest();
  if (!latest) return undefined;

  const generatedAt =
    readStringField(latest, "updatedAt") ??
    readStringField(latest, "createdAt") ??
    new Date(0).toISOString();

  return jsonResponse(200, {
    contractVersion: dynamicContractVersion,
    degradedReason: readStringField(latest, "degradedReason"),
    generatedAt,
    huggingFaceCandidateSetId: readStringField(latest, "huggingFaceCandidateSetId"),
    recommendation: latestRecommendation(latest),
    runId: readStringField(latest, "runId"),
    status: readStringField(latest, "status") ?? "unknown",
    usageSnapshotId: readStringField(latest, "usageSnapshotId")
  });
}

function buildParentSynthesis(
  reviewerArtifacts: DynamicForensicReviewerArtifact[]
): Record<string, unknown> | undefined {
  const completedArtifacts = reviewerArtifacts.filter(
    (reviewerArtifact) => reviewerArtifact.status === "completed" && reviewerArtifact.artifact
  );
  if (completedArtifacts.length === 0) return undefined;

  const recommendations = completedArtifacts.flatMap((reviewerArtifact) => {
    const artifact = reviewerArtifact.artifact ?? {};
    const raw = artifact.recommendations;
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
  });
  const dissentingFindings = completedArtifacts.flatMap((reviewerArtifact) => {
    const artifact = reviewerArtifact.artifact ?? {};
    const rawFindings = artifact.findings;
    if (!Array.isArray(rawFindings)) return [];

    return rawFindings.filter(
      (finding): finding is Record<string, unknown> =>
        isRecord(finding) && finding.severity === "high"
    );
  });

  return {
    confidence: Number(Math.min(0.95, 0.55 + completedArtifacts.length * 0.15).toFixed(2)),
    dissentingFindings,
    recommendation:
      recommendations[0] ??
      "Review completed forensic artifacts before changing local-model profiles.",
    reviewerCount: completedArtifacts.length
  };
}

function latestRecommendation(latest: Record<string, unknown>): Record<string, unknown> | null {
  const parentSynthesis = isRecord(latest.parentSynthesis) ? latest.parentSynthesis : null;
  if (!parentSynthesis) return null;

  const recommendation = readStringField(parentSynthesis, "recommendation");
  if (!recommendation) return null;

  return {
    confidence: readNumberField(parentSynthesis, "confidence") ?? 0.5,
    modelId: readStringField(latest, "huggingFaceCandidateSetId") ?? "unknown",
    rationale: recommendation
  };
}

async function defaultRefreshExecutor(
  request: DynamicRefreshRequest
): Promise<DynamicRefreshExecutionResult> {
  return {
    providerResults: request.providers.map((providerId) => ({
      degradedReason: "dynamic_refresh_executor_not_configured",
      providerId,
      status: "degraded"
    }))
  };
}

function inferredBudgetKind(summary: ProviderReportSummary): string {
  return summary.comparisonMetric.unit === "requests" ? "requests_per_window" : "tokens_per_window";
}

function budgetUsageForKind(summary: ProviderReportSummary, budgetKind: string): number {
  const normalizedKind = budgetKind.toLowerCase();

  if (normalizedKind.includes("request")) {
    return (
      readNumberField(summary, "requestCount") ??
      readNumberField(summary, "requestsCount") ??
      (summary.comparisonMetric.unit === "requests" ? summary.comparisonMetric.value ?? 0 : 0)
    );
  }

  if (normalizedKind.includes("token")) {
    const tokenTotal =
      (readNumberField(summary, "inputTokens") ?? 0) +
      (readNumberField(summary, "outputTokens") ?? 0) +
      (readNumberField(summary, "cacheReadTokens") ?? 0) +
      (readNumberField(summary, "cacheCreationTokens") ?? 0);

    return tokenTotal > 0 || summary.comparisonMetric.unit !== "tokens"
      ? tokenTotal
      : summary.comparisonMetric.value ?? 0;
  }

  return summary.comparisonMetric.value ?? 0;
}

function classifyThreshold(
  used: number,
  limit: number
): "green" | "amber" | "red" | "exhausted" {
  if (limit <= 0 || used >= limit) return "exhausted";
  const ratio = used / limit;
  if (ratio >= 0.9) return "red";
  if (ratio >= 0.7) return "amber";
  return "green";
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanField(value: unknown, field: string): boolean {
  if (!isRecord(value)) return false;
  return value[field] === true;
}

function readForensicReviewerModels(body: unknown): string[] {
  const requestedModels = readStringArrayField(body, "reviewerModels");
  return requestedModels.length > 0
    ? Array.from(new Set(requestedModels))
    : ["sonnet", "opus", "gpt", "grok", "composer", "gemini", "kimi"];
}

function readRefreshMode(value: unknown): DynamicRefreshMode {
  if (!isRecord(value)) return "incremental";
  return value.mode === "historical" ? "historical" : "incremental";
}

function readRefreshRequest(body: unknown): DynamicRefreshRequest {
  const requestedProviders = readStringArrayField(body, "providers");

  return {
    includeForensicModelProfiles: readBooleanField(body, "includeForensicModelProfiles"),
    includeHuggingFaceRefresh: readBooleanField(body, "includeHuggingFaceRefresh"),
    mode: readRefreshMode(body),
    providers:
      requestedProviders.length > 0
        ? Array.from(new Set(requestedProviders))
        : providerRegistry.map((adapter) => adapter.providerId),
    reviewerModels: readStringArrayField(body, "reviewerModels")
  };
}

function readStringArrayField(value: unknown, field: string): string[] {
  if (!isRecord(value)) return [];
  const raw = value[field];

  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function readStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null;
  const raw = value[field];
  return typeof raw === "string" ? raw : null;
}

function refreshJobStatus(
  providerResults: Array<{ status: DynamicProviderRefreshStatus }>
): DynamicProviderRefreshStatus {
  if (providerResults.some((result) => result.status === "failed")) return "failed";
  if (providerResults.some((result) => result.status !== "completed")) return "degraded";
  return "completed";
}

function combinedRefreshStatus(
  refreshStatus: DynamicProviderRefreshStatus,
  forensicStatus: string | null
): DynamicProviderRefreshStatus {
  if (refreshStatus === "failed" || forensicStatus === "failed") return "failed";
  if (
    refreshStatus === "degraded" ||
    refreshStatus === "skipped" ||
    (forensicStatus !== null && forensicStatus !== "completed")
  ) {
    return "degraded";
  }
  return "completed";
}

function validateRefreshProviders(providers: string[]): IntegrationContractResponse | undefined {
  const knownProviderIds = new Set(providerRegistry.map((adapter) => adapter.providerId));
  const unknownProviders = providers.filter((providerId) => !knownProviderIds.has(providerId));
  if (unknownProviders.length === 0) return undefined;

  return jsonResponse(400, {
    code: "invalid_provider",
    message: `Unknown provider ids: ${unknownProviders.join(", ")}`
  });
}

function dispatchGuardForThreshold(threshold: "green" | "amber" | "red" | "exhausted") {
  if (threshold === "exhausted") {
    return {
      allowDispatch: false,
      decision: "block",
      reasonCodes: ["budget_exhausted", "cooldown_required"]
    };
  }
  if (threshold === "red") {
    return {
      allowDispatch: true,
      decision: "prefer_alternate",
      reasonCodes: ["near_budget_exhaustion", "high_worker_completion_risk"]
    };
  }
  if (threshold === "amber") {
    return {
      allowDispatch: true,
      decision: "allow_with_warning",
      reasonCodes: ["budget_warning"]
    };
  }

  return {
    allowDispatch: true,
    decision: "allow",
    reasonCodes: ["healthy_budget"]
  };
}

async function dynamicBudgetStatusResponse(
  requestPath: string,
  loadSummaries: () => Promise<ProviderReportSummary[]>,
  budgetLimits: Record<string, DynamicProviderBudgetLimit>,
  generatedAt: Date
): Promise<IntegrationContractResponse | undefined> {
  const match = /^\/api\/providers\/([^/]+)\/budget-status$/.exec(requestPath);
  if (!match) return undefined;

  const providerId = match[1];
  const summary = (await loadSummaries()).find((candidate) => candidate.providerId === providerId);
  if (!summary) {
    return jsonResponse(404, {
      code: "provider_budget_not_found",
      message: `No dynamic provider budget exists for ${providerId}`
    });
  }

  return jsonResponse(200, buildProviderBudgetStatus(summary, budgetLimits[providerId], generatedAt));
}

async function dynamicUsageResponse(
  requestPath: string,
  loadSummaries: () => Promise<ProviderReportSummary[]>
): Promise<IntegrationContractResponse | undefined> {
  const match = /^\/api\/providers\/([^/]+)\/usage$/.exec(requestPath);
  if (!match) return undefined;

  const providerId = match[1];
  const summary = (await loadSummaries()).find((candidate) => candidate.providerId === providerId);
  if (!summary) {
    return jsonResponse(404, {
      code: "provider_usage_not_found",
      message: `No dynamic provider usage exists for ${providerId}`
    });
  }

  return jsonResponse(200, usageFromSummary(summary));
}

function jsonResponse(status: number, body: unknown): IntegrationContractResponse {
  return {
    body,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Token-Reporting-Contract": dynamicContractVersion
    },
    status
  };
}

function normalizePath(requestPath: string): string {
  const withoutQuery = requestPath.split("?")[0] ?? "/";
  return withoutQuery.endsWith("/") && withoutQuery !== "/"
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

async function readFirstJson(paths: string[]): Promise<unknown | undefined> {
  for (const candidate of paths) {
    try {
      return JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
    } catch {
      // Continue to the next candidate. The caller falls back to seed data.
    }
  }

  return undefined;
}

function readNumberField(value: unknown, field: string): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function snapshotPaths(dataPath: string): string[] {
  const slash = dataPath.lastIndexOf("/");
  if (slash === -1) return [dataPath];
  return [`${dataPath.slice(0, slash + 1)}accumulated-metadata.json`, dataPath];
}

function usageFromSummary(summary: ProviderReportSummary): Record<string, unknown> {
  return {
    providerId: summary.providerId,
    providerLabel: summary.providerLabel,
    reportEndDay: summary.reportEndDay,
    reportStartDay: summary.reportStartDay,
    snapshotId: `dynamic-usage-${summary.providerId}-${summary.reportEndDay}`,
    totals: {
      cacheCreationTokens: readNumberField(summary, "cacheCreationTokens") ?? 0,
      cacheReadTokens: readNumberField(summary, "cacheReadTokens") ?? 0,
      inputTokens: readNumberField(summary, "inputTokens") ?? 0,
      observedMetricUnit: summary.comparisonMetric.unit,
      observedMetricValue: summary.comparisonMetric.value ?? 0,
      outputTokens: readNumberField(summary, "outputTokens") ?? 0,
      requestsCount:
        readNumberField(summary, "requestCount") ??
        (summary.comparisonMetric.unit === "requests" ? summary.comparisonMetric.value ?? 0 : 0),
      totalCostUsd: summary.spendProjection.totalUsd
    }
  };
}
