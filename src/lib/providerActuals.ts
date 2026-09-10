import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { providerRegistry, type ProviderAdapter } from "../providers/registry";
import type { ProviderReportSummary, SpendCostSource } from "./types";

/** Where a validated summary came from; unknown includes unproven injected summaries. */
export type ProviderActualsOrigin = "accumulated" | "latest" | "seed" | "unknown";

/** Persisted source facts, kept separate from the time a caller reads them. */
export interface ProviderActualsProvenance {
  origin: ProviderActualsOrigin;
  snapshotId: string | null;
  fetchedAt: string | null;
  /** Native summary fields whose defaults cannot establish a source observation. */
  unavailableMetrics?: string[];
}

/** Base provider summaries remain usable by existing forensic consumers. */
export interface ProviderActualsSummary extends ProviderReportSummary {
  actualsProvenance?: ProviderActualsProvenance;
}

/** A configured limit, not a capacity inferred from observed consumption. */
export interface ProviderActualsBudgetLimit {
  budgetKind: string;
  limit: number;
  resetAt?: string;
  scopeId?: string;
  scopeLabel?: string;
}

type Threshold = "green" | "amber" | "red" | "exhausted" | "unknown";

/** Read/JSON/schema failures are isolated to one candidate, then one provider. */
export async function loadProviderActualsSummaries(dataRoot: string): Promise<ProviderActualsSummary[]> {
  return Promise.all(providerRegistry.map((adapter) => loadProvider(adapter, dataRoot)));
}

async function loadProvider(adapter: ProviderAdapter, dataRoot: string): Promise<ProviderActualsSummary> {
  const directory = path.dirname(adapter.dataPath);
  const candidates = [
    { origin: "accumulated" as const, file: path.join(directory, "accumulated-metadata.json") },
    { origin: "latest" as const, file: adapter.dataPath }
  ];
  for (const candidate of candidates) {
    try {
      const contents = await fs.readFile(path.join(dataRoot, candidate.file), "utf8");
      const raw: unknown = JSON.parse(contents);
      const summary = adapter.transformSnapshot(raw);
      return {
        ...summary,
        actualsProvenance: {
          origin: candidate.origin,
          snapshotId: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
          fetchedAt: stringField(raw, "fetchedAt"),
          unavailableMetrics: unavailableMetrics(adapter.providerId, raw)
        }
      };
    } catch {
      // Neither private paths nor parse/schema details belong in public responses.
    }
  }
  return { ...adapter.seedSummary,
    actualsProvenance: { origin: "seed", snapshotId: null, fetchedAt: null } };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function stringField(value: unknown, field: string): string | null {
  const raw = record(value)?.[field];
  return typeof raw === "string" ? raw : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usageNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function unavailableMetrics(providerId: string, raw: unknown): string[] {
  if (providerId === "claude-code") return claudeCodeUnavailableMetrics(raw);
  if (providerId !== "cursor") return nativeUnavailableMetrics(providerId, raw);
  return [...cursorTokenUnavailableMetrics(raw), ...cursorRequestUnavailableMetrics(raw),
    ...cursorCostUnavailableMetrics(raw)];
}

function claudeCodeUnavailableMetrics(raw: unknown): string[] {
  const buckets = record(raw)?.dailyBuckets;
  const keys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens", "requestCount"];
  if (!Array.isArray(buckets) || buckets.length === 0) {
    return [...keys, "observedMetricValue", "reportStartDay", "reportEndDay"];
  }
  const missing = keys.filter((key) => buckets.some((bucket: unknown) =>
    usageNumber(record(bucket)?.[key]) === null));
  return missing.includes("requestCount") ? [...missing, "observedMetricValue"] : missing;
}

function cursorTokenUnavailableMetrics(raw: unknown): string[] {
  const keys = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"];
  const events = record(record(raw)?.events)?.usageEvents;
  if (!Array.isArray(events) || events.length === 0) return keys;
  return keys.filter((key) => events.some((event: unknown) =>
    usageNumber(record(record(event)?.tokenUsage)?.[key]) === null));
}

function cursorRequestUnavailableMetrics(raw: unknown): string[] {
  const keys = ["cmdkUsages", "composerRequests", "chatRequests", "agentRequests"];
  const rows = record(record(raw)?.daily ?? raw)?.data;
  const complete = Array.isArray(rows) && rows.every((row: unknown) =>
    keys.every((key) => usageNumber(record(row)?.[key]) !== null));
  return complete ? [] : ["requestsCount", "observedMetricValue"];
}

function cursorCostUnavailableMetrics(raw: unknown): string[] {
  const events = record(raw)?.events;
  const spend = record(raw)?.spend;
  if (events !== undefined || spend !== undefined) {
    const rows = events !== undefined ? record(events)?.usageEvents : record(spend)?.teamMemberSpend;
    const key = events !== undefined ? "chargedCents" : "spendCents";
    const complete = Array.isArray(rows) && rows.length > 0
      && rows.every((row: unknown) => finiteNumber(record(row)?.[key]) !== null);
    return complete ? [] : ["actualCostUsd", "totalCostUsd"];
  }
  const rows = record(record(raw)?.daily ?? raw)?.data;
  const complete = Array.isArray(rows) && rows.every((row: unknown) =>
    usageNumber(record(row)?.usageBasedReqs) !== null);
  return complete ? [] : ["totalCostUsd"];
}

function fieldAt(value: unknown, keys: string[]): unknown {
  return keys.reduce<unknown>((current, key) => record(current)?.[key], value);
}

function bucketRows(value: unknown): unknown[] | null {
  const data = record(value)?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.flatMap((bucket: unknown) => {
    const results = record(bucket)?.results;
    return Array.isArray(results) ? results as unknown[] : [];
  });
}

function costNumber(value: unknown): number | null {
  if (typeof value === "string" && value.trim() !== "") return finiteNumber(Number(value));
  return finiteNumber(value);
}

function nativeUnavailableMetrics(providerId: string, raw: unknown): string[] {
  if (providerId !== "codex" && providerId !== "claude") return [];
  const fields: Record<string, string[][]> = providerId === "codex" ? {
    inputTokens: [["input_tokens"]], outputTokens: [["output_tokens"]],
    cacheReadTokens: [["input_cached_tokens"]], requestCount: [["num_model_requests"]]
  } : {
    inputTokens: [["uncached_input_tokens"]], outputTokens: [["output_tokens"]],
    cacheReadTokens: [["cache_read_input_tokens"]],
    cacheCreationTokens: [["cache_creation", "ephemeral_5m_input_tokens"],
      ["cache_creation", "ephemeral_1h_input_tokens"]]
  };
  const rows = bucketRows(record(raw)?.usage ?? raw);
  const missing = Object.entries(fields).filter(([, paths]) => rows === null
    || rows.some((row) => paths.some((keys) => usageNumber(fieldAt(row, keys)) === null)))
    .map(([name]) => name);
  if (missing.includes(providerId === "codex" ? "requestCount" : "outputTokens")) {
    missing.push("observedMetricValue");
  }
  if (rows === null) missing.push("reportStartDay", "reportEndDay");
  return [...missing, ...nativeCostUnavailableMetrics(providerId, raw)];
}

function nativeCostUnavailableMetrics(providerId: string, raw: unknown): string[] {
  const costs = bucketRows(record(raw)?.costs);
  const costPath = providerId === "codex" ? ["amount", "value"] : ["amount"];
  const currencyPath = providerId === "codex" ? ["amount", "currency"] : ["currency"];
  const unavailable = costs?.some((row) => {
    const currency = fieldAt(row, currencyPath);
    return costNumber(fieldAt(row, costPath)) === null
      || typeof currency !== "string" || currency.trim().toLowerCase() !== "usd";
  });
  return unavailable ? ["actualCostUsd", "totalCostUsd"] : [];
}

function missingMetric(summary: ProviderActualsSummary, field: string): boolean {
  return summary.actualsProvenance?.unavailableMetrics?.includes(field) ?? false;
}

function summaryUsageNumber(summary: ProviderActualsSummary, field: string): number | null {
  return missingMetric(summary, field) ? null : usageNumber(record(summary)?.[field]);
}

function timestamp(value: unknown, observedAt: Date): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const day = Date.parse(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds <= observedAt.getTime()
    ? new Date(milliseconds).toISOString() : null;
}

function provenance(summary: ProviderActualsSummary): ProviderActualsProvenance {
  const source = summary.actualsProvenance;
  const origin = source?.origin;
  if (origin !== "accumulated" && origin !== "latest" && origin !== "seed") {
    return { origin: "unknown", snapshotId: null, fetchedAt: null };
  }
  return { origin, fetchedAt: source?.fetchedAt ?? null,
    snapshotId: /^sha256:[a-f0-9]{64}$/.test(source?.snapshotId ?? "") ? source!.snapshotId : null };
}

function tokenSemantics(providerId: string) {
  if (providerId === "codex") return "includes_cache_read";
  if (["claude", "claude-code", "cursor"].includes(providerId)) return "separate_cache_components";
  return "unknown";
}

function tokenTotals(summary: ProviderActualsSummary, seed: boolean) {
  const missing = summary.actualsProvenance?.unavailableMetrics ?? [];
  const read = (key: string) => seed || missing.includes(key) ? null : usageNumber(record(summary)?.[key]);
  const components = {
    inputTokens: read("inputTokens"), outputTokens: read("outputTokens"),
    cacheReadTokens: read("cacheReadTokens"),
    cacheCreationTokens: read(summary.providerId === "cursor" ? "cacheWriteTokens" : "cacheCreationTokens")
  };
  const semantics = tokenSemantics(summary.providerId);
  const additive = semantics === "unknown" ? [] : semantics === "includes_cache_read"
    ? [components.inputTokens, components.outputTokens] : Object.values(components);
  const known = additive.filter((value): value is number => value !== null);
  const observedTokenSubtotal = known.length ? finiteNumber(known.reduce((sum, value) => sum + value, 0)) : null;
  const tokenComponentsComplete = semantics !== "unknown" && known.length === additive.length
    && observedTokenSubtotal !== null;
  return { ...components, tokenComponentsComplete, observedTokenSubtotal,
    totalTokens: tokenComponentsComplete ? observedTokenSubtotal : null };
}

function costSource(summary: ProviderReportSummary): SpendCostSource | null {
  const source = summary.spendProjection.costSource;
  return ["actual", "estimated", "seat_based"].includes(source) ? source : null;
}

function costObservation(summary: ProviderActualsSummary, seed: boolean) {
  if (seed) return { costSource: null, totalCostUsd: null };
  const actual = missingMetric(summary, "actualCostUsd") ? null : finiteNumber(record(summary)?.actualCostUsd);
  if (actual !== null) return { costSource: "actual" as const, totalCostUsd: actual };
  const basis = costSource(summary);
  const costInputsKnown = basis !== "estimated" || tokenTotals(summary, false).tokenComponentsComplete;
  const missingSeatEstimate = summary.providerId === "github-copilot"
    && usageNumber(record(summary)?.estimatedMonthlyCostUsd) === null;
  const windowDays = usageNumber(summary.spendProjection.windowDays);
  const projectionAvailable = !missingSeatEstimate && !missingMetric(summary, "totalCostUsd")
    && costInputsKnown && windowDays !== null && windowDays > 0;
  const amount = basis === "actual" ? finiteNumber(summary.spendProjection.totalUsd)
    : usageNumber(summary.spendProjection.totalUsd);
  return { costSource: basis, totalCostUsd: projectionAvailable ? amount : null };
}

function calendarDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === value
    ? value : null;
}

function reportWindow(summary: ProviderActualsSummary, seed: boolean) {
  const start = seed || missingMetric(summary, "reportStartDay") ? null : calendarDay(summary.reportStartDay);
  const end = seed || missingMetric(summary, "reportEndDay") ? null : calendarDay(summary.reportEndDay);
  return start !== null && end !== null && start <= end
    ? { reportStartDay: start, reportEndDay: end } : { reportStartDay: null, reportEndDay: null };
}

/** Serialize nullable observations without presenting seed or response time as actuals. */
export function buildProviderActualsUsage(summary: ProviderActualsSummary, observedAt: Date) {
  const source = provenance(summary);
  const seed = source.origin === "seed";
  const snapshotGeneratedAt = seed ? null : timestamp(summary.snapshotGeneratedAt, observedAt);
  const observedMetricValue = seed || missingMetric(summary, "observedMetricValue")
    ? null : usageNumber(summary.comparisonMetric.value);
  const cost = costObservation(summary, seed);
  const requestsCount = seed ? null : summaryUsageNumber(summary, "requestCount")
    ?? summaryUsageNumber(summary, "requestsCount")
    ?? (summary.comparisonMetric.unit === "requests" ? observedMetricValue : null);
  return {
    providerId: summary.providerId, providerLabel: summary.providerLabel,
    ...reportWindow(summary, seed),
    origin: source.origin, snapshotId: seed ? null : source.snapshotId,
    snapshotGeneratedAt, observedAt: observedAt.toISOString(),
    lastFetchedAt: seed ? null : timestamp(source.fetchedAt, observedAt),
    freshness: snapshotGeneratedAt === null ? "unknown" as const : "timestamp_known" as const,
    costSource: cost.costSource,
    inputTokenSemantics: tokenSemantics(summary.providerId),
    units: { tokens: "tokens", requests: "requests", cost: "USD" },
    coverage: { status: "unknown" as const, notes: [
      "Snapshot boundaries and timestamps do not prove complete daily or account coverage.",
      "Provider channels may overlap; these responses are not additive across providers."
    ] },
    totals: { ...tokenTotals(summary, seed), requestsCount,
      observedMetricUnit: summary.comparisonMetric.unit, observedMetricValue,
      totalCostUsd: cost.totalCostUsd }
  };
}

type ActualsUsage = ReturnType<typeof buildProviderActualsUsage>;

function budgetUsage(usage: ActualsUsage, budgetKind: string) {
  const kind = budgetKind.toLowerCase();
  if (["tokens", "tokens_per_window"].includes(kind)) return usage.totals.totalTokens;
  if (["requests", "requests_per_window"].includes(kind)) return usage.totals.requestsCount;
  if (["usd", "usd_per_window", "cost_usd"].includes(kind)) {
    return usage.costSource === "actual" ? usageNumber(usage.totals.totalCostUsd) : null;
  }
  return null;
}

function unknownReasons(usage: ActualsUsage, used: number | null, limit: number | null) {
  const reasons: string[] = [];
  if (usage.origin === "seed") reasons.push("seed_data");
  if (usage.origin === "unknown") reasons.push("source_unknown");
  if (usage.freshness === "unknown") reasons.push("freshness_unknown");
  if (used === null) reasons.push("usage_unknown");
  if (limit === null) reasons.push("budget_limit_unknown");
  return reasons;
}

function thresholdFor(used: number | null, limit: number | null, reasons: string[]): Threshold {
  if (reasons.length || used === null || limit === null) return "unknown";
  if (limit <= 0 || used >= limit) return "exhausted";
  if (used / limit >= 0.9) return "red";
  if (used / limit >= 0.7) return "amber";
  return "green";
}

function dispatchGuard(threshold: Threshold, reasons: string[]) {
  const policies = {
    unknown: { allowDispatch: false, decision: "block", reasonCodes: reasons },
    exhausted: { allowDispatch: false, decision: "block", reasonCodes: ["budget_exhausted", "cooldown_required"] },
    red: { allowDispatch: true, decision: "prefer_alternate",
      reasonCodes: ["near_budget_exhaustion", "high_worker_completion_risk"] },
    amber: { allowDispatch: true, decision: "allow_with_warning", reasonCodes: ["budget_warning"] },
    green: { allowDispatch: true, decision: "allow", reasonCodes: ["healthy_budget"] }
  };
  return policies[threshold];
}

/** Compute only configured, observable headroom; unknown evidence denies dispatch. */
export function buildProviderActualsBudgetStatus(
  summary: ProviderActualsSummary, budgetLimit: ProviderActualsBudgetLimit | undefined, observedAt: Date
) {
  const usage = buildProviderActualsUsage(summary, observedAt);
  const budgetKind = budgetLimit?.budgetKind ?? `${summary.comparisonMetric.unit}_per_window`;
  const used = budgetUsage(usage, budgetKind);
  const limit = usageNumber(budgetLimit?.limit);
  const reasons = unknownReasons(usage, used, limit);
  const threshold = thresholdFor(used, limit, reasons);
  return {
    budgetKind, used, limit,
    remaining: used === null || limit === null ? null : Math.max(0, limit - used),
    threshold, dispatchGuard: dispatchGuard(threshold, reasons),
    confidence: null, estimatedDispatchesRemaining: { reviewer: null, worker: null },
    forecastWindowMinutes: null, lastFetchedAt: usage.lastFetchedAt,
    snapshotGeneratedAt: usage.snapshotGeneratedAt, observedAt: usage.observedAt,
    origin: usage.origin, freshness: usage.freshness, costSource: usage.costSource,
    coverage: usage.coverage, units: usage.units,
    provenance: { redacted: true, source: usage.origin, snapshotId: usage.snapshotId },
    providerId: summary.providerId, providerLabel: summary.providerLabel,
    resetAt: budgetLimit?.resetAt ?? null,
    scopeId: budgetLimit?.scopeId ?? `provider:${summary.providerId}`,
    scopeLabel: budgetLimit?.scopeLabel ?? summary.providerLabel
  };
}
