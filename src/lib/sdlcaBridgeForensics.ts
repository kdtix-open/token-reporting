import type {
  DynamicForensicExecutionResult,
  DynamicForensicRunRequest,
  DynamicForensicReviewerArtifact
} from "./integrationContractDynamic";
import { redactLogValue, type ObservabilityLogger } from "./observabilityLogger";

type SdlcaBridgeProviderKind = "claude" | "codex" | "copilot" | "cursor";

interface SdlcaBridgeProvider {
  forensicCapabilities?: {
    artifactSchemaVersion?: string;
    executionKind?: string;
    resultKind?: string;
    supportedProviderRoles?: string[];
    supportsReviewerArtifacts?: boolean;
  };
  kind: SdlcaBridgeProviderKind;
}

interface SdlcaBridgeExecuteResponse {
  result?: unknown;
}

export interface SdlcaBridgeForensicExecutorOptions {
  bridgeToken: string;
  bridgeUrl: string;
  fetcher?: typeof fetch;
  logger?: ObservabilityLogger;
  timeoutMs?: number;
  workingDirectory: string;
}

export function createSdlcaBridgeForensicExecutor(
  options: SdlcaBridgeForensicExecutorOptions
) {
  const fetcher = options.fetcher ?? fetch;
  const bridgeUrl = trimTrailingSlash(options.bridgeUrl);
  const logger = options.logger?.withContext({ component: "sdlcaBridgeForensics" });

  return async (
    request: DynamicForensicRunRequest
  ): Promise<DynamicForensicExecutionResult> => {
    logger?.info("SDLCA bridge forensic run started", {
      huggingFaceCandidateSetId: request.huggingFaceCandidateSetId,
      reviewerModels: request.reviewerModels,
      runId: request.runId,
      usageSnapshotId: request.usageSnapshotId
    });
    const providers = await fetchForensicProviders(fetcher, bridgeUrl, options.bridgeToken, logger);
    const reviewerArtifacts: DynamicForensicReviewerArtifact[] = [];

    for (const reviewerModel of request.reviewerModels) {
      const providerKind = providerKindForReviewerModel(reviewerModel);
      if (!providers.has(providerKind)) {
        logger?.error("SDLCA bridge forensic provider unavailable", {
          providerKind,
          reviewerModel,
          runId: request.runId
        });
        reviewerArtifacts.push(
          failedReviewerArtifact(
            request.runId,
            reviewerModel,
            providerKind,
            "bridge_forensic_provider_unavailable"
          )
        );
        continue;
      }

      reviewerArtifacts.push(
        await executeReviewer({
          bridgeToken: options.bridgeToken,
          bridgeUrl,
          fetcher,
          logger,
          providerKind,
          request,
          reviewerModel,
          timeoutMs: options.timeoutMs,
          workingDirectory: options.workingDirectory
        })
      );
    }

    const status = reviewerArtifacts.every((artifact) => artifact.status === "completed")
      ? "completed"
      : "degraded";
    logger?.info("SDLCA bridge forensic run completed", {
      completedReviewerCount: reviewerArtifacts.filter((artifact) => artifact.status === "completed")
        .length,
      failedReviewerCount: reviewerArtifacts.filter((artifact) => artifact.status === "failed")
        .length,
      runId: request.runId,
      status
    });

    return {
      reviewerArtifacts,
      status
    };
  };
}

async function fetchForensicProviders(
  fetcher: typeof fetch,
  bridgeUrl: string,
  bridgeToken: string,
  logger: ObservabilityLogger | undefined
): Promise<Set<SdlcaBridgeProviderKind>> {
  const startedAt = Date.now();
  logger?.debug("SDLCA bridge provider discovery started", { bridgeUrl });
  const response = await fetcher(`${bridgeUrl}/providers`, {
    headers: bridgeHeaders(bridgeToken),
    method: "GET"
  });
  const durationMs = Date.now() - startedAt;
  if (!response.ok) {
    logger?.error("SDLCA bridge provider discovery failed", {
      durationMs,
      status: response.status
    });
    throw new Error(`sdlca_bridge_provider_discovery_failed_${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  logger?.trace("SDLCA bridge provider discovery response received", {
    durationMs,
    payload
  });
  const providers = readBridgeProviderEntries(payload);
  const forensicProviders = new Set(
    providers
      .filter(isForensicProvider)
      .map((provider) => provider.kind)
  );
  logger?.info("SDLCA bridge forensic providers discovered", {
    durationMs,
    providerKinds: Array.from(forensicProviders)
  });

  return forensicProviders;
}

function readBridgeProviderEntries(raw: unknown): unknown[] {
  if (!isRecord(raw)) return [];
  if (Array.isArray(raw.result)) return raw.result;
  if (Array.isArray(raw.providers)) return raw.providers;
  return [];
}

async function executeReviewer(args: {
  bridgeToken: string;
  bridgeUrl: string;
  fetcher: typeof fetch;
  logger: ObservabilityLogger | undefined;
  providerKind: SdlcaBridgeProviderKind;
  request: DynamicForensicRunRequest;
  reviewerModel: string;
  timeoutMs?: number;
  workingDirectory: string;
}): Promise<DynamicForensicReviewerArtifact> {
  const artifactUri = reviewerArtifactUri(args.request.runId, args.reviewerModel);
  const model = bridgeModelOverrideForReviewerModel(args.reviewerModel);
  const body = {
    executionKind: "forensic",
    ...(model ? { model } : {}),
    prompt: buildReviewerPrompt(args.request, args.reviewerModel, args.providerKind),
    providerKind: args.providerKind,
    providerRole: "reviewer",
    schema: forensicArtifactSchema,
    timeoutMs: args.timeoutMs,
    workingDirectory: args.workingDirectory
  };
  args.logger?.debug("SDLCA bridge reviewer dispatch started", {
    bridgeProviderKind: args.providerKind,
    reviewerModel: args.reviewerModel,
    runId: args.request.runId,
    timeoutMs: args.timeoutMs
  });
  args.logger?.trace("SDLCA bridge reviewer dispatch payload", {
    body,
    reviewerModel: args.reviewerModel,
    runId: args.request.runId
  });
  const startedAt = Date.now();
  const response = await args.fetcher(`${args.bridgeUrl}/execute`, {
    body: JSON.stringify(body),
    headers: {
      ...bridgeHeaders(args.bridgeToken),
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    const diagnostics = {
      bridgeErrorSummary: await readBridgeErrorSummary(response),
      bridgeHttpStatus: response.status,
      bridgeProviderKind: args.providerKind,
      durationMs
    };
    args.logger?.error("SDLCA bridge reviewer dispatch failed", {
      bridgeProviderKind: args.providerKind,
      diagnostics,
      durationMs,
      reviewerModel: args.reviewerModel,
      runId: args.request.runId,
      status: response.status
    });
    return failedReviewerArtifact(
      args.request.runId,
      args.reviewerModel,
      args.providerKind,
      `sdlca_bridge_forensic_execute_failed_${response.status}`,
      diagnostics
    );
  }

  const payload = (await response.json()) as SdlcaBridgeExecuteResponse;
  args.logger?.trace("SDLCA bridge reviewer response received", {
    bridgeProviderKind: args.providerKind,
    durationMs,
    payload,
    reviewerModel: args.reviewerModel,
    runId: args.request.runId,
    status: response.status
  });
  const validation = validateForensicArtifact(payload.result, args.providerKind);
  if (!validation.artifact) {
    const diagnostics = {
      bridgeHttpStatus: response.status,
      bridgeProviderKind: args.providerKind,
      durationMs,
      resultSummary: summarizeBridgeResult(payload.result),
      validationErrors: validation.errors
    };
    args.logger?.error("SDLCA bridge reviewer result invalid", {
      bridgeProviderKind: args.providerKind,
      diagnostics,
      durationMs,
      reviewerModel: args.reviewerModel,
      runId: args.request.runId
    });
    return failedReviewerArtifact(
      args.request.runId,
      args.reviewerModel,
      args.providerKind,
      "sdlca_bridge_forensic_result_invalid",
      diagnostics
    );
  }

  args.logger?.info("SDLCA bridge reviewer artifact completed", {
    artifactUri,
    bridgeProviderKind: args.providerKind,
    durationMs,
    reviewerModel: args.reviewerModel,
    runId: args.request.runId
  });

  return {
    artifact: validation.artifact,
    artifactUri,
    bridgeProviderKind: args.providerKind,
    reviewerModel: args.reviewerModel,
    status: "completed"
  };
}

function failedReviewerArtifact(
  runId: string,
  reviewerModel: string,
  providerKind: SdlcaBridgeProviderKind,
  degradedReason: string,
  diagnostics?: Record<string, unknown>
): DynamicForensicReviewerArtifact {
  return {
    artifactUri: reviewerArtifactUri(runId, reviewerModel),
    bridgeProviderKind: providerKind,
    degradedReason,
    diagnostics: diagnostics ? sanitizeDiagnostics(diagnostics) : undefined,
    reviewerModel,
    status: "failed"
  };
}

function validateForensicArtifact(
  raw: unknown,
  providerKind: SdlcaBridgeProviderKind
): { artifact?: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { errors: ["result_expected_object"] };
  }

  if (raw.artifactSchemaVersion !== "sdlca.bridge.forensic.v0") {
    errors.push("artifactSchemaVersion_expected_sdlca.bridge.forensic.v0");
  }
  if (raw.artifactKind !== "local_model_forensic_review") {
    errors.push("artifactKind_expected_local_model_forensic_review");
  }
  if (raw.providerKind !== providerKind) {
    errors.push(`providerKind_expected_${providerKind}`);
  }
  if (!Array.isArray(raw.findings)) {
    errors.push("findings_expected_array");
  }
  if (!Array.isArray(raw.recommendations)) {
    errors.push("recommendations_expected_array");
  }
  if (typeof raw.summary !== "string") {
    errors.push("summary_expected_string");
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { artifact: raw, errors };
}

async function readBridgeErrorSummary(response: Response): Promise<string | undefined> {
  try {
    const raw =
      typeof response.text === "function"
        ? await response.text()
        : JSON.stringify(await response.json());
    return sanitizeDiagnosticString(extractBridgeErrorMessage(raw));
  } catch {
    return undefined;
  }
}

function extractBridgeErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      const error = parsed.error;
      if (typeof error === "string") return error;
      if (isRecord(error) && typeof error.message === "string") return error.message;
      if (typeof parsed.message === "string") return parsed.message;
    }
  } catch {
    // Fall back to the raw bridge response text below.
  }

  return raw;
}

function summarizeBridgeResult(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    return {
      type: Array.isArray(raw) ? "array" : typeof raw
    };
  }

  return sanitizeDiagnostics({
    artifactKind: raw.artifactKind,
    artifactSchemaVersion: raw.artifactSchemaVersion,
    hasFindings: Array.isArray(raw.findings),
    hasRecommendations: Array.isArray(raw.recommendations),
    hasSummary: typeof raw.summary === "string",
    keys: Object.keys(raw).sort(),
    providerKind: raw.providerKind
  });
}

function sanitizeDiagnostics(value: Record<string, unknown>): Record<string, unknown> {
  return redactLogValue(value) as Record<string, unknown>;
}

function sanitizeDiagnosticString(value: string): string {
  return value
    .replace(
      /\b[A-Za-z0-9_-]*(?:api[_-]?key|authorization|bearer|credential|password|secret|token)[A-Za-z0-9_-]*\b\s*[:=]\s*[^\s,;"')]+/gi,
      "[REDACTED]"
    )
    .slice(0, 2_000);
}

function isForensicProvider(value: unknown): value is SdlcaBridgeProvider {
  if (!isRecord(value)) return false;
  if (!isProviderKind(value.kind)) return false;

  const capability = isRecord(value.forensicCapabilities) ? value.forensicCapabilities : null;
  if (!capability) return false;

  const roles = Array.isArray(capability.supportedProviderRoles)
    ? capability.supportedProviderRoles
    : [];

  return (
    capability.executionKind === "forensic" &&
    capability.resultKind === "forensic" &&
    capability.supportsReviewerArtifacts === true &&
    roles.includes("reviewer")
  );
}

function providerKindForReviewerModel(reviewerModel: string): SdlcaBridgeProviderKind {
  const normalized = reviewerModel.toLowerCase();
  if (normalized.includes("sonnet") || normalized.includes("opus")) return "claude";
  if (normalized.includes("composer")) return "cursor";
  if (normalized.includes("copilot")) return "copilot";
  return "codex";
}

function bridgeModelOverrideForReviewerModel(reviewerModel: string): string | undefined {
  const normalized = reviewerModel.trim();
  const lower = normalized.toLowerCase();
  const genericReviewerLabels = new Set([
    "composer",
    "copilot",
    "gemini",
    "gpt",
    "grok",
    "kimi",
    "opus",
    "sonnet"
  ]);

  return normalized && !genericReviewerLabels.has(lower) ? normalized : undefined;
}

function buildReviewerPrompt(
  request: DynamicForensicRunRequest,
  reviewerModel: string,
  providerKind: SdlcaBridgeProviderKind
): string {
  return [
    "Produce a local-model forensic reviewer artifact for Token Reporting.",
    "Return only JSON matching the supplied schema.",
    "Do not include raw provider Admin API snapshots or credentials.",
    `Reviewer model: ${reviewerModel}`,
    `Bridge provider kind: ${providerKind}`,
    `Run id: ${request.runId}`,
    `Usage snapshot id: ${request.usageSnapshotId}`,
    `Hugging Face candidate set id: ${request.huggingFaceCandidateSetId}`,
    "Evidence packet:",
    JSON.stringify(request.evidencePacket, null, 2)
  ].join("\n");
}

const forensicArtifactSchema = {
  additionalProperties: true,
  properties: {
    artifactKind: { const: "local_model_forensic_review" },
    artifactSchemaVersion: { const: "sdlca.bridge.forensic.v0" },
    findings: {
      items: {
        additionalProperties: true,
        properties: {
          details: { type: "string" },
          evidenceRefs: { items: { type: "string" }, type: "array" },
          severity: { enum: ["info", "low", "medium", "high"] },
          title: { type: "string" }
        },
        required: ["details", "severity", "title"],
        type: "object"
      },
      type: "array"
    },
    generatedAt: { type: "string" },
    providerKind: { enum: ["claude", "codex", "copilot", "cursor"] },
    providerRole: { enum: ["reviewer"] },
    provenance: {
      additionalProperties: true,
      properties: {
        redacted: { const: true },
        snapshotId: { type: "string" },
        source: { type: "string" }
      },
      required: ["redacted", "source"],
      type: "object"
    },
    recommendations: { items: { type: "string" }, type: "array" },
    summary: { type: "string" }
  },
  required: [
    "artifactKind",
    "artifactSchemaVersion",
    "findings",
    "generatedAt",
    "providerKind",
    "providerRole",
    "provenance",
    "recommendations",
    "summary"
  ],
  type: "object"
} as const;

function bridgeHeaders(bridgeToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    "x-sdlca-bridge-token": bridgeToken
  };
}

function reviewerArtifactUri(runId: string, reviewerModel: string): string {
  return `local://token-reporting/forensics/${runId}/reviewers/${encodeURIComponent(
    reviewerModel
  )}.json`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isProviderKind(value: unknown): value is SdlcaBridgeProviderKind {
  return value === "claude" || value === "codex" || value === "copilot" || value === "cursor";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
