import type { LocalSessionDistribution } from "./localSessionDistribution";
import type { ProviderReportSummary } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export type ContextConfidence = "high" | "low" | "insufficient_data";
export type CodeCapability = "excellent" | "good" | "fair";
export type ModelTier = "min" | "recommended" | "enterprise";

export interface LocalModelProfile {
  tier: ModelTier;
  name: string;
  hfRepoId: string;
  contextWindow: number;
  parameterCount: string;
  /** Quantization used for VRAM and speed estimates */
  quantization: string;
  vramGbMin: number;
  gpuClass: string;
  /** Tokens/sec at concurrency=1 under the stated quantization */
  tokensPerSecEstimate: number;
  license: string;
  codeCapability: CodeCapability;
  toolUseSupport: boolean;
  commercialSafe: boolean;
  /** Does context window satisfy the estimated required window? */
  contextFits: boolean;
  /** Can throughput serve estimated daily load in an 8-hour active window? */
  throughputFits: boolean;
  note: string;
}

export interface TokenObservedProvider {
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  /** Null when provider has no per-request count (e.g. Claude) */
  requestCount: number | null;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface RequestOnlyProvider {
  providerId: string;
  requestCount: number;
  note: string;
}

export interface LocalModelMigrationReport {
  /** Providers that contributed real token counts */
  tokenObservedProviders: TokenObservedProvider[];
  /** Providers with request counts but no token telemetry */
  requestOnlyProviders: RequestOnlyProvider[];

  // ── Aggregate token totals ──────────────────────────────────────────────
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Cache reads: low-cost on cloud; maps to KV-cache hits on local stack */
  totalCacheReadTokens: number;
  /** Cache creation: similar to regular input cost */
  totalCacheCreationTokens: number;
  /** Pure compute tokens = input + output + cacheCreation (not cacheRead) */
  totalPureComputeTokens: number;

  // ── Per-request sizing ──────────────────────────────────────────────────
  tokenObservedRequests: number | null;
  avgTokensPerObservedRequest: number | null;
  /**
   * Estimated context window needed.
   * - When local session telemetry is present (~/.codex + ~/.claude jsonl
   *   parsed by scripts/analyze-local-sessions.ts) this is the empirical
   *   p99 of per-turn context tokens — confidence "high".
   * - Otherwise it falls back to avgTokensPerRequest × 2.5 from the cloud
   *   admin-API window aggregates — confidence "low".
   */
  estimatedContextWindowNeeded: number | null;
  contextConfidence: ContextConfidence;
  /** Populated when the local-sessions snapshot was used. */
  localDistribution: LocalSessionDistribution | null;

  // ── Throughput ──────────────────────────────────────────────────────────
  windowDays: number;
  dailyAvgComputeTokens: number;
  /**
   * Required tokens/sec to serve daily load in an 8-hour active window.
   * This is a minimum steady-state throughput — bursts will require more.
   */
  requiredTokensPerSec: number;

  // ── Model profiles ──────────────────────────────────────────────────────
  profiles: LocalModelProfile[];
}

// ── HuggingFace model catalogue ─────────────────────────────────────────────
// Sources: HuggingFace model cards + VRAM/speed benchmarks (2025-04)
// All estimates assume Q4_K_M quantization via llama.cpp/Ollama at concurrency=1.

const CATALOGUE: Omit<LocalModelProfile, "contextFits" | "throughputFits">[] = [
  {
    tier: "min",
    name: "Llama 3.1 8B Instruct",
    hfRepoId: "meta-llama/Llama-3.1-8B-Instruct",
    contextWindow: 131_072,
    parameterCount: "8B",
    quantization: "Q4_K_M",
    vramGbMin: 8,
    gpuClass: "RTX 4060 Ti 16GB or better",
    tokensPerSecEstimate: 80,
    license: "Meta Llama 3.1 Community",
    codeCapability: "good",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Best low-VRAM entry point. 128K context handles most workloads. Commercial use permitted for orgs with < 700M MAU."
  },
  {
    tier: "recommended",
    name: "Qwen2.5-Coder 14B Instruct",
    hfRepoId: "Qwen/Qwen2.5-Coder-14B-Instruct",
    contextWindow: 131_072,
    parameterCount: "14B",
    quantization: "Q4_K_M",
    vramGbMin: 10,
    gpuClass: "RTX 4090 24GB or A10G 24GB",
    tokensPerSecEstimate: 55,
    license: "Apache 2.0",
    codeCapability: "excellent",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Code-specialized fine-tune; Apache 2.0 licence; strong completions, chat, and function-calling. Best quality/cost balance for developer tooling."
  },
  {
    tier: "enterprise",
    name: "Qwen2.5 72B Instruct",
    hfRepoId: "Qwen/Qwen2.5-72B-Instruct",
    contextWindow: 131_072,
    parameterCount: "72B",
    quantization: "Q4_K_M",
    vramGbMin: 40,
    gpuClass: "2× A100 80GB or 4× RTX 4090",
    tokensPerSecEstimate: 15,
    license: "Apache 2.0",
    codeCapability: "excellent",
    toolUseSupport: true,
    commercialSafe: true,
    note: "GPT-4o-class quality. Requires GPU cluster. Apache 2.0 — no usage restrictions. Use when Codex/Claude quality parity is required."
  },
  {
    tier: "enterprise",
    name: "Qwen2.5-7B-Instruct-1M",
    hfRepoId: "Qwen/Qwen2.5-7B-Instruct-1M",
    contextWindow: 1_010_000,
    parameterCount: "7B",
    quantization: "Q8_0",
    vramGbMin: 24,
    gpuClass: "RTX 4090 24GB or A10G + 80GB system RAM for KV cache",
    tokensPerSecEstimate: 35,
    license: "Apache 2.0",
    codeCapability: "good",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Million-token context window for long-prompt / cached-context workloads (e.g. Claude Code with system-prompt cache). Trades raw capability for unmatched window depth — pair with Qwen2.5-Coder 14B for short-context coding tasks."
  }
];

// ── Standard context window sizes (tokens) ─────────────────────────────────
const STANDARD_CONTEXT_SIZES = [
  4_096, 8_192, 16_384, 32_768, 65_536, 131_072, 200_000, 500_000, 1_000_000
];

function ceilToStandardContext(tokens: number): number {
  return STANDARD_CONTEXT_SIZES.find((s) => s >= tokens) ?? 200_000;
}

// ── Duck-type helpers ───────────────────────────────────────────────────────

function hasTokenFields(s: ProviderReportSummary): s is ProviderReportSummary & {
  inputTokens: number;
  outputTokens: number;
} {
  return "inputTokens" in s && "outputTokens" in s;
}

function getNum(s: ProviderReportSummary, field: string): number {
  const val = (s as unknown as Record<string, unknown>)[field];
  return typeof val === "number" ? val : 0;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildLocalModelReport(
  summaries: ProviderReportSummary[],
  localDistribution: LocalSessionDistribution | null = null
): LocalModelMigrationReport {
  const tokenObservedProviders: TokenObservedProvider[] = [];
  const requestOnlyProviders: RequestOnlyProvider[] = [];

  for (const s of summaries) {
    if (hasTokenFields(s)) {
      // Prefer `uncachedInputTokens` when the provider exposes it (Codex enriched
      // schema). Otherwise `inputTokens` is already the uncached value (Claude convention).
      const uncached = (s as unknown as Record<string, unknown>)["uncachedInputTokens"];
      const inputForCompute =
        typeof uncached === "number" ? uncached : getNum(s, "inputTokens");
      tokenObservedProviders.push({
        providerId: s.providerId,
        inputTokens: inputForCompute,
        outputTokens: getNum(s, "outputTokens"),
        requestCount: "requestCount" in s ? getNum(s, "requestCount") : null,
        cacheReadTokens: getNum(s, "cacheReadTokens"),
        cacheCreationTokens: getNum(s, "cacheCreationTokens")
      });
    } else if (s.providerId === "cursor") {
      const totalReqs =
        getNum(s, "totalCmdkUsages") +
        getNum(s, "totalComposerRequests") +
        getNum(s, "totalChatRequests") +
        getNum(s, "totalAgentRequests");
      if (totalReqs > 0) {
        requestOnlyProviders.push({
          providerId: s.providerId,
          requestCount: totalReqs,
          note: "Request counts only — token telemetry not available via Cursor admin API"
        });
      }
    } else if (s.providerId === "github-copilot") {
      const cliInput = getNum(s, "cliInputTokens");
      const cliOutput = getNum(s, "cliOutputTokens");
      const cliReqs = getNum(s, "cliRequestCount");
      const interactions = getNum(s, "totalInteractions");

      if (cliInput > 0) {
        // CLI token telemetry available — treat as token-observed.
        // cliRequestCount is CLI API calls, used as request denominator for sizing.
        // Note: coverage is CLI-only; IDE chat/agent interactions are not counted.
        tokenObservedProviders.push({
          providerId: s.providerId,
          inputTokens: cliInput,
          outputTokens: cliOutput,
          requestCount: cliReqs > 0 ? cliReqs : null,
          cacheReadTokens: 0,
          cacheCreationTokens: 0
        });
      } else if (interactions > 0) {
        requestOnlyProviders.push({
          providerId: s.providerId,
          requestCount: interactions,
          note: "Interaction counts only — CLI token telemetry not available in this snapshot"
        });
      }
    }
  }

  // ── Token aggregates ──────────────────────────────────────────────────────
  const totalInputTokens = tokenObservedProviders.reduce((a, p) => a + p.inputTokens, 0);
  const totalOutputTokens = tokenObservedProviders.reduce((a, p) => a + p.outputTokens, 0);
  const totalCacheReadTokens = tokenObservedProviders.reduce((a, p) => a + p.cacheReadTokens, 0);
  const totalCacheCreationTokens = tokenObservedProviders.reduce((a, p) => a + p.cacheCreationTokens, 0);
  // Cache reads hit KV cache on local stack — exclude from pure compute cost
  const totalPureComputeTokens =
    totalInputTokens + totalOutputTokens + totalCacheCreationTokens;

  // ── Per-request sizing ────────────────────────────────────────────────────
  const tokenObservedRequests = tokenObservedProviders.some((p) => p.requestCount !== null)
    ? tokenObservedProviders.reduce((a, p) => a + (p.requestCount ?? 0), 0)
    : null;

  let avgTokensPerObservedRequest: number | null = null;
  let estimatedContextWindowNeeded: number | null = null;
  let contextConfidence: ContextConfidence = "insufficient_data";

  // Prefer empirical p99 from local session telemetry when present.
  if (localDistribution && localDistribution.combined.sampleCount > 0) {
    estimatedContextWindowNeeded = ceilToStandardContext(
      Math.ceil(localDistribution.combined.p99)
    );
    contextConfidence = "high";
    if (
      tokenObservedRequests !== null &&
      tokenObservedRequests > 0 &&
      totalPureComputeTokens > 0
    ) {
      avgTokensPerObservedRequest = totalPureComputeTokens / tokenObservedRequests;
    } else {
      avgTokensPerObservedRequest = localDistribution.combined.mean;
    }
  } else if (
    tokenObservedRequests !== null &&
    tokenObservedRequests > 0 &&
    totalPureComputeTokens > 0
  ) {
    avgTokensPerObservedRequest = totalPureComputeTokens / tokenObservedRequests;
    // 2.5× heuristic safety factor — avg×multiplier proxy for p95 (low confidence).
    estimatedContextWindowNeeded = ceilToStandardContext(
      Math.ceil(avgTokensPerObservedRequest * 2.5)
    );
    contextConfidence = "low";
  }

  // ── Throughput ────────────────────────────────────────────────────────────
  // Infer window days from the first summary with a concrete report window
  const first = summaries[0];
  let windowDays = 28;
  if (first?.reportStartDay && first?.reportEndDay) {
    const start = new Date(first.reportStartDay + "T00:00:00Z").getTime();
    const end = new Date(first.reportEndDay + "T00:00:00Z").getTime();
    const computed = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (computed > 0) windowDays = computed;
  }

  const dailyAvgComputeTokens = windowDays > 0 ? totalPureComputeTokens / windowDays : 0;
  // Assume 8-hour active development window per day
  const requiredTokensPerSec = dailyAvgComputeTokens / (8 * 3600);

  // ── Model profiles ────────────────────────────────────────────────────────
  const profiles: LocalModelProfile[] = CATALOGUE.map((m) => ({
    ...m,
    contextFits:
      estimatedContextWindowNeeded === null || m.contextWindow >= estimatedContextWindowNeeded,
    throughputFits: m.tokensPerSecEstimate >= requiredTokensPerSec
  }));

  return {
    tokenObservedProviders,
    requestOnlyProviders,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreationTokens,
    totalPureComputeTokens,
    tokenObservedRequests,
    avgTokensPerObservedRequest,
    estimatedContextWindowNeeded,
    contextConfidence,
    localDistribution,
    windowDays,
    dailyAvgComputeTokens,
    requiredTokensPerSec,
    profiles
  };
}
