import type {
  DynamicForensicExecutionResult,
  DynamicForensicRunRequest,
  DynamicForensicReviewerArtifact
} from "./integrationContractDynamic";
import { redactLogValue, type ObservabilityLogger } from "./observabilityLogger";

type SdlcaBridgeProviderKind = "claude" | "codex" | "copilot" | "cursor";
const bridgeSensitiveKeyPattern =
  /(?:api[_-]?key|authorization|bearer|credential|password|secret|(?:access|auth|bridge|id|refresh|session)[_-]?token|token)$/i;

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
        const artifact = failedReviewerArtifact(
          request.runId,
          reviewerModel,
          providerKind,
          "bridge_forensic_provider_unavailable"
        );
        reviewerArtifacts.push(artifact);
        await notifyReviewerArtifact({ artifact, logger, request, reviewerArtifacts, reviewerModel });
        continue;
      }

      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const runningArtifact = runningReviewerArtifact(
        request.runId,
        reviewerModel,
        providerKind,
        startedAtIso
      );
      const artifactIndex = reviewerArtifacts.push(runningArtifact) - 1;
      await notifyReviewerArtifact({
        artifact: runningArtifact,
        logger,
        request,
        reviewerArtifacts,
        reviewerModel
      });

      const artifact = await executeReviewer({
        bridgeToken: options.bridgeToken,
        bridgeUrl,
        fetcher,
        logger,
        providerKind,
        request,
        reviewerModel,
        startedAt,
        startedAtIso,
        timeoutMs: options.timeoutMs,
        workingDirectory: options.workingDirectory
      });
      reviewerArtifacts[artifactIndex] = artifact;
      await notifyReviewerArtifact({ artifact, logger, request, reviewerArtifacts, reviewerModel });
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

async function notifyReviewerArtifact(args: {
  artifact: DynamicForensicReviewerArtifact;
  logger: ObservabilityLogger | undefined;
  request: DynamicForensicRunRequest;
  reviewerArtifacts: DynamicForensicReviewerArtifact[];
  reviewerModel: string;
}): Promise<void> {
  try {
    await args.request.onReviewerArtifact?.(
      cloneReviewerArtifact(args.artifact),
      args.reviewerArtifacts.map(cloneReviewerArtifact)
    );
  } catch (error) {
    args.logger?.error(
      "SDLCA bridge reviewer progress callback failed",
      {
        reviewerModel: args.reviewerModel,
        runId: args.request.runId
      },
      error
    );
  }
}

function cloneReviewerArtifact(
  artifact: DynamicForensicReviewerArtifact
): DynamicForensicReviewerArtifact {
  return JSON.parse(JSON.stringify(artifact)) as DynamicForensicReviewerArtifact;
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
    payload: redactBridgeValue(payload)
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
  startedAt: number;
  startedAtIso: string;
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
    body: redactBridgeValue(body),
    reviewerModel: args.reviewerModel,
    runId: args.request.runId
  });
  const abortController = createTimeoutAbortController(args.timeoutMs);
  const requestInit: RequestInit = {
    body: JSON.stringify(body),
    headers: {
      ...bridgeHeaders(args.bridgeToken),
      "Content-Type": "application/json"
    },
    method: "POST",
    ...(abortController ? { signal: abortController.controller.signal } : {})
  };
  let response: Response;
  try {
    response = await args.fetcher(`${args.bridgeUrl}/execute`, requestInit);
  } catch (error) {
    abortController?.clear();
    const durationMs = Date.now() - args.startedAt;
    const timedOut = abortController?.timedOut() === true || isAbortError(error);
    const diagnostics = {
      bridgeProviderKind: args.providerKind,
      durationMs,
      errorSummary: sanitizeDiagnosticString(error instanceof Error ? error.message : String(error)),
      timeoutMs: args.timeoutMs
    };
    const degradedReason = timedOut
      ? "sdlca_bridge_forensic_execute_timeout"
      : "sdlca_bridge_forensic_execute_error";
    args.logger?.error("SDLCA bridge reviewer dispatch failed", {
      bridgeProviderKind: args.providerKind,
      diagnostics,
      durationMs,
      reviewerModel: args.reviewerModel,
      runId: args.request.runId,
      timedOut
    });
    return failedReviewerArtifact(
      args.request.runId,
      args.reviewerModel,
      args.providerKind,
      degradedReason,
      diagnostics,
      args.startedAtIso
    );
  }

  try {
    const durationMs = Date.now() - args.startedAt;

    if (!response.ok) {
      const bridgeErrorSummary = await readBridgeErrorSummary(response);
      const timedOut = abortController?.timedOut() === true;
      const diagnostics = {
        bridgeErrorSummary,
        bridgeHttpStatus: response.status,
        bridgeProviderKind: args.providerKind,
        durationMs,
        timeoutMs: args.timeoutMs
      };
      const degradedReason = timedOut
        ? "sdlca_bridge_forensic_execute_timeout"
        : isBridgeJsonParseFailure(bridgeErrorSummary)
          ? "sdlca_bridge_forensic_output_parse_failed"
          : `sdlca_bridge_forensic_execute_failed_${response.status}`;
      args.logger?.error("SDLCA bridge reviewer dispatch failed", {
        bridgeProviderKind: args.providerKind,
        diagnostics,
        durationMs,
        reviewerModel: args.reviewerModel,
        runId: args.request.runId,
        status: response.status,
        timedOut
      });
      return failedReviewerArtifact(
        args.request.runId,
        args.reviewerModel,
        args.providerKind,
        degradedReason,
        diagnostics,
        args.startedAtIso
      );
    }

    let payload: SdlcaBridgeExecuteResponse;
    try {
      payload = (await response.json()) as SdlcaBridgeExecuteResponse;
    } catch (error) {
      const timedOut = abortController?.timedOut() === true || isAbortError(error);
      const diagnostics = {
        bridgeErrorSummary: sanitizeDiagnosticString(
          error instanceof Error ? error.message : String(error)
        ),
        bridgeHttpStatus: response.status,
        bridgeProviderKind: args.providerKind,
        durationMs: Date.now() - args.startedAt,
        timeoutMs: args.timeoutMs
      };
      args.logger?.error("SDLCA bridge reviewer response JSON parse failed", {
        bridgeProviderKind: args.providerKind,
        diagnostics,
        durationMs: diagnostics.durationMs,
        reviewerModel: args.reviewerModel,
        runId: args.request.runId,
        status: response.status,
        timedOut
      });
      return failedReviewerArtifact(
        args.request.runId,
        args.reviewerModel,
        args.providerKind,
        timedOut
          ? "sdlca_bridge_forensic_execute_timeout"
          : "sdlca_bridge_forensic_output_parse_failed",
        diagnostics,
        args.startedAtIso
      );
    }
  args.logger?.trace("SDLCA bridge reviewer response received", {
    bridgeProviderKind: args.providerKind,
    durationMs,
    payload: redactBridgeValue(payload),
    reviewerModel: args.reviewerModel,
    runId: args.request.runId,
    status: response.status
  });
  const normalization = normalizeBridgeForensicArtifact(
    payload.result,
    args.providerKind,
    args.request.createdAt
  );
  const validation = validateForensicArtifact(normalization.result, args.providerKind);
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
      diagnostics,
      args.startedAtIso
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
    completedAt: new Date().toISOString(),
    diagnostics: normalization.normalized
      ? sanitizeDiagnostics({
          normalizedFromBridgeResult: true,
          originalResultSummary: summarizeBridgeResult(payload.result)
        })
      : undefined,
    reviewerModel: args.reviewerModel,
    startedAt: args.startedAtIso,
    status: "completed"
  };
  } finally {
    abortController?.clear();
  }
}

function runningReviewerArtifact(
  runId: string,
  reviewerModel: string,
  providerKind: SdlcaBridgeProviderKind,
  startedAt: string
): DynamicForensicReviewerArtifact {
  return {
    artifactUri: reviewerArtifactUri(runId, reviewerModel),
    bridgeProviderKind: providerKind,
    reviewerModel,
    startedAt,
    status: "running"
  };
}

function failedReviewerArtifact(
  runId: string,
  reviewerModel: string,
  providerKind: SdlcaBridgeProviderKind,
  degradedReason: string,
  diagnostics?: Record<string, unknown>,
  startedAt?: string
): DynamicForensicReviewerArtifact {
  return {
    artifactUri: reviewerArtifactUri(runId, reviewerModel),
    bridgeProviderKind: providerKind,
    completedAt: new Date().toISOString(),
    degradedReason,
    diagnostics: diagnostics ? sanitizeDiagnostics(diagnostics) : undefined,
    reviewerModel,
    startedAt,
    status: "failed"
  };
}

function createTimeoutAbortController(timeoutMs: number | undefined):
  | {
      clear: () => void;
      controller: AbortController;
      timedOut: () => boolean;
    }
  | undefined {
  if (
    typeof AbortController === "undefined" ||
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0
  ) {
    return undefined;
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    clear: () => clearTimeout(timeout),
    controller,
    timedOut: () => timedOut
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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

function normalizeBridgeForensicArtifact(
  raw: unknown,
  providerKind: SdlcaBridgeProviderKind,
  fallbackGeneratedAt: string
): { normalized: boolean; result: unknown } {
  const currentValidation = validateForensicArtifact(raw, providerKind);
  if (currentValidation.artifact) {
    return { normalized: false, result: sanitizeForensicArtifact(currentValidation.artifact) };
  }
  if (!isRecord(raw)) {
    return { normalized: false, result: raw };
  }

  if (!isNormalizableBridgeResult(raw, providerKind)) {
    return { normalized: false, result: raw };
  }

  const artifact = {
    artifactKind: "local_model_forensic_review",
    artifactSchemaVersion: "sdlca.bridge.forensic.v0",
    findings: normalizeFindings(raw.findings),
    generatedAt: readString(raw, "generatedAt") ?? fallbackGeneratedAt,
    localModelAssessment: isRecord(raw.localModelAssessment)
      ? redactLogValue(raw.localModelAssessment)
      : undefined,
    providerKind,
    providerRole: "reviewer",
    provenance: normalizeProvenance(raw),
    recommendations: normalizeRecommendations(raw),
    reviewer: isRecord(raw.reviewer) ? redactLogValue(raw.reviewer) : undefined,
    runId: readString(raw, "runId"),
    summary: normalizeArtifactSummary(raw)
  };

  return {
    normalized: true,
    result: sanitizeForensicArtifact(removeUndefinedFields(artifact))
  };
}

function normalizeFindings(rawFindings: unknown): Record<string, unknown>[] {
  if (!Array.isArray(rawFindings)) {
    return [
      {
        details: "Bridge reviewer returned structured output without itemized findings.",
        severity: "info",
        title: "Structured reviewer output received"
      }
    ];
  }

  const findings = rawFindings
    .map(normalizeFinding)
    .filter((finding): finding is Record<string, unknown> => finding !== null);

  return findings.length > 0
    ? findings
    : [
        {
          details: "Bridge reviewer returned an empty findings array.",
          severity: "info",
          title: "No reviewer findings returned"
        }
      ];
}

function normalizeFinding(rawFinding: unknown): Record<string, unknown> | null {
  if (typeof rawFinding === "string") {
    return {
      details: redactFreeText(rawFinding),
      severity: "info",
      title: "Bridge reviewer finding"
    };
  }
  if (!isRecord(rawFinding)) return null;

  const evidenceRefs = readStringArray(rawFinding.evidenceRefs).map(redactFreeText);
  return removeUndefinedFields({
    details: redactFreeText(
      readString(rawFinding, "details") ??
      readString(rawFinding, "detail") ??
      readString(rawFinding, "description") ??
      stringifyRedacted(rawFinding)
    ),
    evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    severity: normalizeSeverity(rawFinding.severity),
    title: redactFreeText(
      readString(rawFinding, "title") ??
      readString(rawFinding, "finding") ??
      readString(rawFinding, "summary") ??
      readString(rawFinding, "category") ??
      "Bridge reviewer finding"
    )
  });
}

function normalizeRecommendations(raw: Record<string, unknown>): string[] {
  const source = Array.isArray(raw.recommendations)
    ? raw.recommendations
    : Array.isArray(raw.nextActions)
      ? raw.nextActions
      : [];

  return source
    .map(recommendationToString)
    .filter((recommendation): recommendation is string => recommendation !== null)
    .slice(0, 20);
}

function recommendationToString(value: unknown): string | null {
  if (typeof value === "string") return redactFreeText(value);
  if (!isRecord(value)) return null;

  const title = readString(value, "title") ?? readString(value, "action");
  const details = readString(value, "details") ?? readString(value, "description");
  if (title && details) return redactFreeText(`${title}: ${details}`);
  return title || details ? redactFreeText(title ?? details ?? "") : null;
}

function normalizeArtifactSummary(raw: Record<string, unknown>): string {
  const value = raw.summary;
  if (typeof value === "string" && value.trim()) return redactFreeText(value);
  if (isRecord(value)) {
    return redactFreeText(
      readString(value, "conclusion") ??
      readString(value, "recommendation") ??
      readString(value, "summary") ??
      readString(value, "headline") ??
      readString(value, "text") ??
      stringifyRedacted(value)
    );
  }
  if (isRecord(raw.verdict)) {
    const status = readString(raw.verdict, "status");
    const rationale = readString(raw.verdict, "rationale");
    if (status && rationale) return redactFreeText(`${status}: ${rationale}`);
    return redactFreeText(status ?? rationale ?? stringifyRedacted(raw.verdict));
  }

  return "Bridge reviewer returned structured findings without a string summary.";
}

function stringifyRedacted(value: unknown): string {
  return redactFreeText(JSON.stringify(redactLogValue(value)));
}

function redactBridgeValue(value: unknown): unknown {
  return redactBridgeArtifactValue(redactLogValue(value));
}

function sanitizeForensicArtifact(artifact: Record<string, unknown>): Record<string, unknown> {
  return redactBridgeArtifactValue(artifact) as Record<string, unknown>;
}

function redactBridgeArtifactValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactFreeText(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";

  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactBridgeArtifactValue(item, seen));

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      bridgeSensitiveKeyPattern.test(key) ? "[REDACTED]" : redactBridgeArtifactValue(child, seen)
    ])
  );
}

function redactFreeText(value: string): string {
  return value
    .replace(
      /(^|[{\s,])("?[A-Za-z0-9_.-]*(?:api[_-]?key|authorization|bearer|credential|password|secret|token)[A-Za-z0-9_.-]*"?\s*[:=]\s*)(["'])[^"'\r\n]*(\3)/giu,
      "$1$2$3[REDACTED]$4"
    )
    .replace(/\b(authorization\s*:\s*(?:bearer\s+)?)[^\s"',;]+/giu, "$1[REDACTED]")
    .replace(/\b(bearer\s+)[^\s"',;]+/giu, "$1[REDACTED]")
    .replace(
      /\b([A-Za-z0-9_.-]*(?:api[_-]?key|credential|password|secret|token)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)[^\s"',;]+(\2)/giu,
      "$1[REDACTED]"
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[REDACTED]");
}

function isNormalizableBridgeResult(
  raw: Record<string, unknown>,
  providerKind: SdlcaBridgeProviderKind
): boolean {
  const bridgeProviderKind = readString(raw, "bridgeProviderKind");
  const reviewerModel = readString(raw, "reviewerModel");
  const hasForensicContent =
    Array.isArray(raw.findings) || Array.isArray(raw.recommendations) || isRecord(raw.verdict);

  if (raw.schemaVersion === "sdlca.bridge.forensic.v0") return hasForensicContent;
  if (raw.artifactSchemaVersion === "sdlca.bridge.forensic.v0") return false;

  return bridgeProviderKind === providerKind && reviewerModel !== undefined && hasForensicContent;
}

function normalizeProvenance(raw: Record<string, unknown>): Record<string, unknown> {
  const provenance = isRecord(raw.provenance) ? raw.provenance : {};
  const evidenceIntegrity = isRecord(raw.evidenceIntegrity) ? raw.evidenceIntegrity : {};
  const inputs = isRecord(raw.inputs) ? raw.inputs : {};
  return removeUndefinedFields({
    redacted: true,
    snapshotId: readString(provenance, "snapshotId") ?? readString(inputs, "usageSnapshotId"),
    source:
      readString(provenance, "source") ??
      readString(evidenceIntegrity, "source") ??
      "sdlca_bridge_forensic_review"
  });
}

function normalizeSeverity(value: unknown): "info" | "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high" ? value : "info";
}

function readString(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function removeUndefinedFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, unknown] => entry[1] !== undefined)
  );
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
  return redactBridgeValue(value) as Record<string, unknown>;
}

function sanitizeDiagnosticString(value: string): string {
  return redactFreeText(value).slice(0, 2_000);
}

function isBridgeJsonParseFailure(summary: string | undefined): boolean {
  if (!summary) return false;
  const normalized = summary.toLowerCase();
  return (
    normalized.includes("after json") ||
    normalized.includes("unexpected non-whitespace") ||
    normalized.includes("unexpected token") ||
    normalized.includes("json.parse")
  );
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
    "Return exactly one JSON object and nothing else.",
    "Do not include markdown fences, prose, explanations, or text before or after the JSON object.",
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
