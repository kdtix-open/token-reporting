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
  /**
   * System RAM needed for KV-cache CPU offload when the context window is
   * too large to fit the KV cache in VRAM. Omitted for models where the KV
   * cache fits comfortably in VRAM at the stated context window.
   */
  systemRamGbMin?: number;
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

  /**
   * The lowest-tier catalogue entry where contextFits AND throughputFits are
   * both true for the current workload.
   *
   * Only populated when contextConfidence is "high" or "low" — not when it is
   * "insufficient_data", because contextFits would be trivially true (no data
   * means no context constraint) and surfacing a "best fit" would be a false
   * positive.  Null when no profile satisfies both constraints.
   */
  recommendedProfile: LocalModelProfile | null;

  /**
   * Describes which requirements no profile in the catalogue can satisfy.
   * Only set when contextConfidence is "high" or "low" AND recommendedProfile
   * is null (i.e. something is genuinely unmet).
   */
  workloadGap: { context: boolean; throughput: boolean } | null;
}

// ── HuggingFace model catalogue ─────────────────────────────────────────────
// Architecture (layers/kv_heads/head_dim) verified from config.json on HuggingFace.
// GGUF file sizes from bartowski's GGUF pages (bartowski/...-GGUF).
// Throughput derived from llama.cpp Vulkan Scoreboard (discussion #10879) scaled
// by model-size ratio and ×1.08 CUDA factor; flagged as estimates, not direct measurements.
// All estimates assume Q4_K_M quantization via llama.cpp at concurrency=1 unless noted.

const CATALOGUE: Omit<LocalModelProfile, "contextFits" | "throughputFits">[] = [
  {
    tier: "min",
    name: "Llama 3.1 8B Instruct",
    hfRepoId: "meta-llama/Llama-3.1-8B-Instruct",
    contextWindow: 131_072,
    parameterCount: "8B",
    quantization: "Q4_K_M",
    // KV math (verified from config.json): 32 layers × 8 KV heads × 128 head_dim.
    // fp16 KV: 128 KB/token → at 128K ctx: 16.0 GB; Q8 KV: 64 KB/token → 8.0 GB.
    // Weights Q4_K_M: 4.92 GiB (bartowski GGUF, confirmed).
    // 8 GB VRAM: loads weights but only ~25K ctx (fp16 KV) / ~49K ctx (Q8 KV).
    // 16 GB minimum for full 128K context: 4.92 + 8.0 GB Q8 KV = 12.9 GB → fits in 16 GB ✓.
    vramGbMin: 16,
    // RTX 4060 Ti 16GB: 288 GB/s ÷ 4.92 GB ≈ 58 tok/s theoretical → ~50 tok/s real (CUDA).
    // RTX 4070 Ti Super 16GB (672 GB/s): ~85 tok/s | RTX 3090 24GB (936 GB/s): ~120 tok/s.
    gpuClass: "RTX 4060 Ti 16GB (~50 tok/s) — RTX 4070 Ti Super 16GB (~85 tok/s) — RTX 3090 24GB (~120 tok/s)",
    tokensPerSecEstimate: 50,
    license: "Meta Llama 3.1 Community",
    codeCapability: "good",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Best entry point for full 128K context. 16 GB is the minimum for the full window (Q8 KV + 4.92 GB weights = ~13 GB); an 8 GB card can load the model but caps context at ~49K tokens (Q8 KV). Commercial use permitted for orgs with < 700 M MAU. Throughput on a 4060 Ti 16GB: ~50 tok/s; upgrade to a 3090/4070 Ti Super for 85–120 tok/s."
  },
  {
    tier: "recommended",
    name: "Qwen2.5-Coder 14B Instruct",
    hfRepoId: "Qwen/Qwen2.5-Coder-14B-Instruct",
    contextWindow: 131_072,
    parameterCount: "14B",
    quantization: "Q4_K_M",
    // KV math (verified from config.json): 48 layers × 8 KV heads × 128 head_dim.
    // fp16 KV: 192 KB/token; Q8 KV: 96 KB/token.
    // Weights Q4_K_M: 8.99 GiB (bartowski GGUF, confirmed).
    // 12 GB: loads model (~9.7 GB) + ~2.3 GB KV → ~13K ctx (fp16) / ~26K ctx (Q8 KV).
    // 16 GB: ~34K ctx (fp16 KV) / ~68K ctx (Q8 KV).
    // 24 GB: full 128K with Q8 KV (12 GB KV + 9.7 GB weights = 21.7 GB → fits ✓).
    //        fp16 KV at 128K = 24 GB → total 33.7 GB → needs 40+ GB.
    vramGbMin: 12,
    // RTX 4070 Ti Super 16GB (672 GB/s) ÷ 9.7 GB model → ~55 tok/s (CUDA est.).
    // RTX 4090 24GB (1008 GB/s) → ~80 tok/s.
    gpuClass: "RTX 4070 Ti Super 16GB (~55 tok/s, ≤32K ctx) — RTX 4090 / A10G 24GB (~80 tok/s, full 128K Q8 KV)",
    tokensPerSecEstimate: 55,
    license: "Apache 2.0",
    codeCapability: "excellent",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Code-specialized fine-tune; Apache 2.0 licence; strong completions, chat, and function-calling. Best quality/cost balance for developer tooling. A 12 GB card handles up to ~26K context (Q8 KV); full 128K context requires a 24 GB GPU (Q8 KV: weights 9.7 GB + KV 12 GB = 21.7 GB total). Throughput: ~55 tok/s on RTX 4070 Ti Super; ~80 tok/s on RTX 4090."
  },
  {
    tier: "enterprise",
    name: "Qwen2.5 72B Instruct",
    hfRepoId: "Qwen/Qwen2.5-72B-Instruct",
    contextWindow: 131_072,
    parameterCount: "72B",
    quantization: "Q4_K_M",
    // KV math (verified from config.json): 80 layers × 8 KV heads × 128 head_dim.
    // fp16 KV: 320 KB/token → at 128K ctx: 40.0 GB; Q8 KV: 20.0 GB.
    // Weights Q4_K_M: 47.42 GiB = ~50.9 GB (bartowski GGUF, confirmed).
    // Minimum cluster VRAM: 80 GB (e.g. 2× A100 40GB NVLink); model fits with 29 GB for KV.
    // 4× RTX 4090 PCIe (96 GB total): model (51 GB) + Q8 KV at 128K (20 GB) = 71 GB → fits ✓.
    //   fp16 KV at 128K (40 GB): 51 + 40 = 91 GB → very tight on 96 GB cluster.
    // 2× A100 80GB NVLink (160 GB total): ample room for full context at any KV precision.
    // vramGbMin is TOTAL cluster VRAM (not per-GPU).
    vramGbMin: 80,
    // 4× RTX 4090 over PCIe: all-reduce latency limits to ~20 tok/s (llama.cpp TP).
    // 2× A100 80GB with NVLink (600 GB/s bidirectional): ~35 tok/s (llama.cpp); ~50 tok/s with vLLM.
    gpuClass: "2× A100 80GB NVLink (~35 tok/s, 160 GB total) — or 4× RTX 4090 PCIe (~20 tok/s, 96 GB total)",
    tokensPerSecEstimate: 20,
    license: "Apache 2.0",
    codeCapability: "excellent",
    toolUseSupport: true,
    commercialSafe: true,
    note: "GPT-4o-class quality. Requires a GPU cluster: model weights alone are ~51 GB (Q4_K_M), so minimum cluster VRAM is 80 GB (e.g. 2× A100 40GB). Apache 2.0 — no usage restrictions. Use when Codex/Claude quality parity is required. Throughput: ~20 tok/s on 4× RTX 4090 via PCIe (interconnect-limited); ~35 tok/s on 2× A100 80GB NVLink."
  },
  {
    tier: "enterprise",
    name: "Qwen2.5-7B-Instruct-1M",
    hfRepoId: "Qwen/Qwen2.5-7B-Instruct-1M",
    contextWindow: 1_010_000,
    parameterCount: "7B",
    quantization: "Q8_0",
    vramGbMin: 24,
    // KV math (verified from config.json): 28 layers × 4 KV heads × 128 head_dim.
    // fp16 KV: 56 KB/token; Q8 KV: 28 KB/token.
    // Weights Q8_0: 8.10 GiB = ~8.7 GB (bartowski GGUF, confirmed).
    // With 24 GB VRAM: 24 - 8.7 = 15.3 GB for KV → Q8 KV: ~558K tokens hot in VRAM.
    // At 1M context: ~452K tokens offloaded to system RAM (Q8 KV ≈ 12.2 GB).
    // System RAM min (Q8 KV): 12.2 GB offloaded + ~16 GB OS headroom = ~29 GB → 32 GB minimum.
    // System RAM min (fp16 KV): ~39 GB offloaded + 16 GB headroom = ~55 GB → 64 GB minimum.
    // A100 80 GB: full 1M Q8 KV (28 GB) + weights (8.7 GB) = 36.7 GB → fits with no offload ✓.
    // ⚠ Speed at true 1M context with CPU KV offload is RAM-bandwidth-limited:
    //   DDR5-6000 (96 GB/s) with Q8 KV (28 GB to read per token) → ~3.4 tok/s theoretical max.
    //   Community data: 1-5 tok/s at 100K+ context; sub-1 tok/s at full 1M (CPU offload).
    //   Usable speeds (>5 tok/s) require an A100-class GPU with full in-VRAM KV.
    systemRamGbMin: 32,
    gpuClass: "RTX 4090 24GB + ≥32 GB system RAM (Q8 KV offload, ~558K tokens hot) — or A100 80 GB (full in-VRAM, no offload)",
    // tokensPerSecEstimate reflects true 1M context performance (CPU offload path).
    // For contexts < 558K tokens (all in VRAM), expect ~80 tok/s on RTX 4090.
    tokensPerSecEstimate: 5,
    license: "Apache 2.0",
    codeCapability: "good",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Million-token context window for long-prompt / cached-context workloads (e.g. Claude Code with system-prompt cache). On a 24 GB GPU, weights (~8.7 GB) run in VRAM and ~558K KV tokens stay hot; remaining tokens spill to system RAM — bring ≥32 GB (Q8 KV) or ≥64 GB (fp16 KV). At full 1M context generation speed is RAM-bandwidth-limited: ~1–5 tok/s via CPU offload. An A100 80 GB eliminates the offload entirely (~80 tok/s). Pair with Qwen2.5-Coder 14B for short-context coding tasks."
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

  // ── Workload recommendation ────────────────────────────────────────────────
  // Only compute a recommendation when we have real context data — when
  // contextConfidence is "insufficient_data" contextFits is trivially true for
  // every profile (no constraint to check), which would produce false positives.
  const hasRealContext = contextConfidence !== "insufficient_data";

  const recommendedProfile: LocalModelProfile | null = hasRealContext
    ? (profiles.find((p) => p.contextFits && p.throughputFits) ?? null)
    : null;

  const workloadGap =
    hasRealContext && recommendedProfile === null
      ? {
          context: profiles.every((p) => !p.contextFits),
          throughput: profiles.every((p) => !p.throughputFits)
        }
      : null;

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
    profiles,
    recommendedProfile,
    workloadGap
  };
}
