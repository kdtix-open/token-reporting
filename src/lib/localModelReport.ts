import type { LocalSessionDistribution } from "./localSessionDistribution";
import type { HuggingFaceCandidateSet } from "./huggingFaceCandidates";
import type { ProviderReportSummary } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export type ContextConfidence = "high" | "low" | "insufficient_data";
export type ContextEvidenceSource =
  | "none"
  | "global_local_session_distribution"
  | "global_local_session_distribution_scaled_to_scope"
  | "scoped_cloud_token_heuristic";
export type CodeCapability = "excellent" | "good" | "fair";
export type ModelTier = "min" | "recommended" | "pro" | "enterprise";
export type LocalModelWorkloadScopeId =
  | "all_provider_traffic"
  | "repo_automation_project"
  | "agent_memory"
  | "copilot_cli"
  | "agentic_worker"
  | "reviewer";
export type ForensicRoutingStrategy =
  | "hosted_guardrail"
  | "local_candidate"
  | "reviewer_consensus"
  | "tiered_hybrid";

export interface LocalModelTenant {
  tenantId: string;
  tenantName: string;
}

export interface LocalModelWorkloadScope {
  allocationMode: "observed" | "estimated";
  contextWindowMultiplier: number;
  description: string;
  id: LocalModelWorkloadScopeId;
  label: string;
  pipelineKey: string;
  providerWeights: Record<string, number>;
  tenantId: string;
  tenantName: string;
}

export interface LocalModelForensicFinding {
  details: string;
  evidenceRefs: string[];
  severity: string;
  title: string;
}

export interface LocalModelAppliedForensicGuidance {
  appliedSections: string[];
  blockingFindings: LocalModelForensicFinding[];
  confidence: number | null;
  hostedWorkloadScope: string;
  impactSummary: string;
  localWorkloadScope: string;
  recommendation: string;
  reviewerCount: number | null;
  routingStrategy: ForensicRoutingStrategy;
  runId: string | null;
  status: string | null;
  updatedAt: string | null;
}

export interface LocalModelForensicRunInput {
  parentSynthesis?: {
    confidence?: number;
    dissentingFindings?: Array<Record<string, unknown>>;
    recommendation?: string;
    reviewerCount?: number;
  };
  runId?: string;
  status?: string;
  updatedAt?: string;
}

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
   * Effective context window achievable at vramGbMin (Q8 KV). Omitted when
   * the full contextWindow fits in VRAM at the stated minimum. When present,
   * more VRAM is required to serve the full contextWindow.
   */
  effectiveContextAtMinVram?: number;
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
  hfCandidateSetId?: string;
  hfDegradedReason?: string;
  hfDownloads?: number;
  hfLastModified?: string;
  hfLikes?: number;
  forensicInterpretation?: string;
  note: string;
}

export interface TokenObservedProvider {
  allocationWeight?: number;
  providerId: string;
  inputTokens: number;
  outputTokens: number;
  /** Null when provider has no per-request count (e.g. Claude) */
  requestCount: number | null;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  windowDays?: number | null;
}

export interface RequestOnlyProvider {
  allocationWeight?: number;
  providerId: string;
  requestCount: number;
  note: string;
}

export interface BuildLocalModelReportOptions {
  tenantId?: string;
  tenantName?: string;
  workloadScopeId?: LocalModelWorkloadScopeId;
  workloadScopes?: LocalModelWorkloadScope[];
}

export interface LocalModelMigrationReport {
  tenant: LocalModelTenant;
  selectedWorkloadScope: LocalModelWorkloadScope;
  availableWorkloadScopes: LocalModelWorkloadScope[];

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
  contextEvidenceSource: ContextEvidenceSource;
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
   * Additional catalogue entries that also satisfy contextFits AND throughputFits,
   * ordered by recommendation preference (ascending tier / cost) after the
   * recommendedProfile. Empty when contextConfidence is "insufficient_data" or
   * when fewer than two profiles satisfy the workload.
   */
  alternativeProfiles: LocalModelProfile[];

  /**
   * Describes which requirements no profile in the catalogue can satisfy.
   * Only set when contextConfidence is "high" or "low" AND recommendedProfile
   * is null (i.e. something is genuinely unmet).
   */
  workloadGap: { context: boolean; throughput: boolean } | null;

  /**
   * Reviewer synthesis applied to this local migration report. This does not
   * mutate raw token math; it changes how sizing/profile recommendations are
   * interpreted for local-vs-hosted routing.
   */
  appliedForensicGuidance: LocalModelAppliedForensicGuidance | null;
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
    // 12 GB: loads model (~9.7 GB) + ~2.3 GB KV → ~25K ctx (Q8 KV) — effectiveContextAtMinVram.
    // 16 GB: ~34K ctx (fp16 KV) / ~68K ctx (Q8 KV).
    // 24 GB: full 128K with Q8 KV (12 GB KV + 9.7 GB weights = 21.7 GB → fits ✓).
    //        fp16 KV at 128K = 24 GB → total 33.7 GB → needs 40+ GB.
    vramGbMin: 12,
    // Effective Q8 KV context at 12 GB VRAM: (12 - 9.7) GB / 96 KB = ~25K tokens.
    effectiveContextAtMinVram: 25_165,
    // RTX 4070 Ti Super 16GB (672 GB/s) ÷ 9.7 GB model → ~55 tok/s (CUDA est.).
    // RTX 4090 24GB (1008 GB/s) → ~80 tok/s.
    gpuClass: "RTX 4070 Ti Super 16GB (~55 tok/s, ≤32K ctx) — RTX 4090 / A10G 24GB (~80 tok/s, full 128K Q8 KV)",
    tokensPerSecEstimate: 55,
    license: "Apache 2.0",
    codeCapability: "excellent",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Code-specialized fine-tune; Apache 2.0 licence; strong completions, chat, and function-calling. Best quality/cost balance for developer tooling. A 12 GB card handles up to ~25K context (Q8 KV); full 128K context requires a 24 GB GPU (Q8 KV: weights 9.7 GB + KV 12 GB = 21.7 GB total). Throughput: ~55 tok/s on RTX 4070 Ti Super; ~80 tok/s on RTX 4090."
  },
  {
    tier: "pro",
    name: "Qwen2.5-Coder 32B Instruct",
    hfRepoId: "Qwen/Qwen2.5-Coder-32B-Instruct",
    contextWindow: 131_072,
    parameterCount: "32B",
    quantization: "Q4_K_M",
    // KV math (architecture: 64 layers × 8 KV heads × 128 head_dim).
    // fp16 KV: 256 KB/token; Q8 KV: 128 KB/token.
    // Weights Q4_K_M: ~19.3 GiB (~20.7 GB), estimated from 32.8B param count × 4.5 bits/B.
    // 24 GB: loads weights (~20.7 GB) → ~2.5 GB headroom → ~20K ctx (fp16 KV) / ~40K ctx (Q8 KV).
    // 40 GB (A100 40GB): 40 - 20.7 = 19.3 GB KV → Q8 KV: ~154K ctx → full 128K ✓.
    // 48 GB (2× RTX 3090 NVLink): ample room for full 128K Q8 KV.
    vramGbMin: 24,
    // Effective Q8 KV context at 24 GB VRAM: (24 - 20.7) GB / 128 KB ≈ 40K tokens.
    effectiveContextAtMinVram: 40_960,
    // RTX 4090 24GB (1008 GB/s) ÷ 20.7 GB × 0.85 CUDA ≈ 41 tok/s.
    // A100 40GB (1,555 GB/s HBM2e) ÷ 20.7 GB × 0.85 ≈ 64 tok/s.
    gpuClass: "RTX 4090 24GB (~40 tok/s, ≤40K ctx Q8 KV) — A100 40GB (~60 tok/s, full 128K Q8 KV) — 2× RTX 3090 48GB (~40 tok/s, full 128K Q8 KV)",
    tokensPerSecEstimate: 40,
    license: "Apache 2.0",
    codeCapability: "excellent",
    toolUseSupport: true,
    commercialSafe: true,
    note: "Most downloaded code model on HuggingFace (6.5M+ downloads). Apache 2.0 — no usage restrictions. Excellent coding, chat, and tool use. At minimum VRAM (24 GB): weights ~20.7 GB leave ~3.3 GB for KV → ~40K effective context (Q8 KV); suitable for most single-file tasks. Full 128K context needs ≥40 GB (e.g. A100 40GB: 20.7 GB weights + 16 GB Q8 KV = 36.7 GB). Throughput: ~40 tok/s on RTX 4090; ~60 tok/s on A100 40GB."
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

function defaultLocalModelWorkloadScopes(tenant: LocalModelTenant): LocalModelWorkloadScope[] {
  return [
    {
      allocationMode: "observed",
      contextWindowMultiplier: 1,
      description: "All provider Admin/API token usage currently visible for this tenant.",
      id: "all_provider_traffic",
      label: `All ${tenant.tenantName} provider traffic`,
      pipelineKey: "all",
      providerWeights: {},
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName
    },
    {
      allocationMode: "estimated",
      contextWindowMultiplier: 0.55,
      description:
        "Repo automation project lane, excluding Copilot CLI dominance unless explicitly selected.",
      id: "repo_automation_project",
      label: "Repo Automation",
      pipelineKey: "repo-automation",
      providerWeights: {
        claude: 0.45,
        "claude-code": 0.25,
        codex: 0.25,
        cursor: 0.05
      },
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName
    },
    {
      allocationMode: "estimated",
      contextWindowMultiplier: 1,
      description: "Long-context memory, retrieval, and context-carrying agent work.",
      id: "agent_memory",
      label: "Agent Memory",
      pipelineKey: "agent-memory",
      providerWeights: {
        claude: 0.5,
        "claude-code": 0.2,
        codex: 0.3
      },
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName
    },
    {
      allocationMode: "observed",
      contextWindowMultiplier: 0.15,
      description: "GitHub Copilot CLI token telemetry only.",
      id: "copilot_cli",
      label: "Copilot CLI",
      pipelineKey: "copilot-cli",
      providerWeights: {
        "github-copilot": 1
      },
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName
    },
    {
      allocationMode: "estimated",
      contextWindowMultiplier: 0.7,
      description: "Agentic worker execution lane across hosted coding providers.",
      id: "agentic_worker",
      label: "Agentic Worker",
      pipelineKey: "agentic-worker",
      providerWeights: {
        claude: 0.3,
        "claude-code": 0.1,
        codex: 0.45,
        cursor: 0.15
      },
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName
    },
    {
      allocationMode: "estimated",
      contextWindowMultiplier: 0.5,
      description: "Reviewer and forensic validation lane.",
      id: "reviewer",
      label: "Reviewer",
      pipelineKey: "reviewer",
      providerWeights: {
        claude: 0.4,
        codex: 0.45,
        cursor: 0.15
      },
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName
    }
  ];
}

function resolveWorkloadScope(
  options: BuildLocalModelReportOptions | undefined
): {
  availableWorkloadScopes: LocalModelWorkloadScope[];
  selectedWorkloadScope: LocalModelWorkloadScope;
  tenant: LocalModelTenant;
} {
  const tenant = {
    tenantId: options?.tenantId ?? "kdtix",
    tenantName: options?.tenantName ?? "KDTIX"
  };
  const availableWorkloadScopes =
    options?.workloadScopes && options.workloadScopes.length > 0
      ? options.workloadScopes
      : defaultLocalModelWorkloadScopes(tenant);
  const selectedWorkloadScope =
    availableWorkloadScopes.find((scope) => scope.id === options?.workloadScopeId) ??
    availableWorkloadScopes[0]!;

  return { availableWorkloadScopes, selectedWorkloadScope, tenant };
}

function scopeProviderWeight(scope: LocalModelWorkloadScope, providerId: string): number {
  if (scope.id === "all_provider_traffic") return 1;
  return scope.providerWeights[providerId] ?? 0;
}

function scaleCount(value: number, weight: number): number {
  return Math.round(value * weight);
}

function scopedTokenProviders(
  providers: TokenObservedProvider[],
  scope: LocalModelWorkloadScope
): TokenObservedProvider[] {
  return providers.flatMap((provider) => {
    const weight = scopeProviderWeight(scope, provider.providerId);
    if (weight <= 0) return [];
    const scopedProvider = {
      ...provider,
      allocationWeight: weight,
      cacheCreationTokens: scaleCount(provider.cacheCreationTokens, weight),
      cacheReadTokens: scaleCount(provider.cacheReadTokens, weight),
      inputTokens: scaleCount(provider.inputTokens, weight),
      outputTokens: scaleCount(provider.outputTokens, weight),
      requestCount:
        provider.requestCount === null ? null : Math.max(1, scaleCount(provider.requestCount, weight))
    };
    const hasUsage =
      scopedProvider.inputTokens +
        scopedProvider.outputTokens +
        scopedProvider.cacheCreationTokens +
        scopedProvider.cacheReadTokens >
        0 || scopedProvider.requestCount !== null;
    return hasUsage ? [scopedProvider] : [];
  });
}

function scopedRequestOnlyProviders(
  providers: RequestOnlyProvider[],
  scope: LocalModelWorkloadScope
): RequestOnlyProvider[] {
  return providers.flatMap((provider) => {
    const weight = scopeProviderWeight(scope, provider.providerId);
    if (weight <= 0) return [];
    const requestCount = scaleCount(provider.requestCount, weight);
    return requestCount > 0
      ? [
          {
            ...provider,
            allocationWeight: weight,
            note:
              weight === 1
                ? provider.note
                : `${provider.note}; ${Math.round(weight * 100)}% allocated to ${scope.label}`,
            requestCount
          }
        ]
      : [];
  });
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildLocalModelReport(
  summaries: ProviderReportSummary[],
  localDistribution: LocalSessionDistribution | null = null,
  huggingFaceCandidateSet: HuggingFaceCandidateSet | null = null,
  forensicRun: LocalModelForensicRunInput | null = null,
  options?: BuildLocalModelReportOptions
): LocalModelMigrationReport {
  const rawTokenObservedProviders: TokenObservedProvider[] = [];
  const rawRequestOnlyProviders: RequestOnlyProvider[] = [];
  const { availableWorkloadScopes, selectedWorkloadScope, tenant } = resolveWorkloadScope(options);
  const appliedForensicGuidance = buildAppliedForensicGuidance(forensicRun);

  for (const s of summaries) {
    if (hasTokenFields(s)) {
      // Prefer `uncachedInputTokens` when the provider exposes it (Codex enriched
      // schema). Otherwise `inputTokens` is already the uncached value (Claude convention).
      const uncached = (s as unknown as Record<string, unknown>)["uncachedInputTokens"];
      const inputForCompute =
        typeof uncached === "number" ? uncached : getNum(s, "inputTokens");
      rawTokenObservedProviders.push({
        providerId: s.providerId,
        inputTokens: inputForCompute,
        outputTokens: getNum(s, "outputTokens"),
        requestCount: "requestCount" in s ? getNum(s, "requestCount") : null,
        cacheReadTokens: getNum(s, "cacheReadTokens"),
        cacheCreationTokens: getNum(s, "cacheCreationTokens"),
        windowDays: reportWindowDays(s)
      });
    } else if (s.providerId === "cursor") {
      const totalReqs =
        getNum(s, "totalCmdkUsages") +
        getNum(s, "totalComposerRequests") +
        getNum(s, "totalChatRequests") +
        getNum(s, "totalAgentRequests");
      if (totalReqs > 0) {
        rawRequestOnlyProviders.push({
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
        rawTokenObservedProviders.push({
          providerId: s.providerId,
          inputTokens: cliInput,
          outputTokens: cliOutput,
          requestCount: cliReqs > 0 ? cliReqs : null,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          windowDays: reportWindowDays(s)
        });
      } else if (interactions > 0) {
        rawRequestOnlyProviders.push({
          providerId: s.providerId,
          requestCount: interactions,
          note: "Interaction counts only — CLI token telemetry not available in this snapshot"
        });
      }
    }
  }

  const tokenObservedProviders = scopedTokenProviders(
    rawTokenObservedProviders,
    selectedWorkloadScope
  );
  const requestOnlyProviders = scopedRequestOnlyProviders(
    rawRequestOnlyProviders,
    selectedWorkloadScope
  );

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
  let contextEvidenceSource: ContextEvidenceSource = "none";

  // Prefer empirical p99 from local session telemetry when present.
  if (localDistribution && localDistribution.combined.sampleCount > 0) {
    estimatedContextWindowNeeded = ceilToStandardContext(
      Math.ceil(localDistribution.combined.p99 * selectedWorkloadScope.contextWindowMultiplier)
    );
    contextConfidence =
      selectedWorkloadScope.id === "all_provider_traffic" ? "high" : "low";
    contextEvidenceSource =
      selectedWorkloadScope.id === "all_provider_traffic"
        ? "global_local_session_distribution"
        : "global_local_session_distribution_scaled_to_scope";
    if (
      tokenObservedRequests !== null &&
      tokenObservedRequests > 0 &&
      totalPureComputeTokens > 0
    ) {
      avgTokensPerObservedRequest = totalPureComputeTokens / tokenObservedRequests;
    } else {
      avgTokensPerObservedRequest =
        localDistribution.combined.mean * selectedWorkloadScope.contextWindowMultiplier;
    }
  } else if (
    tokenObservedRequests !== null &&
    tokenObservedRequests > 0 &&
    totalPureComputeTokens > 0
  ) {
    avgTokensPerObservedRequest = totalPureComputeTokens / tokenObservedRequests;
    // 2.5× heuristic safety factor — avg×multiplier proxy for p95 (low confidence).
    estimatedContextWindowNeeded = ceilToStandardContext(
      Math.ceil(avgTokensPerObservedRequest * 2.5 * selectedWorkloadScope.contextWindowMultiplier)
    );
    contextConfidence = "low";
    contextEvidenceSource = "scoped_cloud_token_heuristic";
  }

  // ── Throughput ────────────────────────────────────────────────────────────
  const windowDays =
    Math.max(0, ...tokenObservedProviders.map((provider) => provider.windowDays ?? 0)) || 28;
  const dailyAvgComputeTokens = tokenObservedProviders.reduce((total, provider) => {
    const providerWindowDays = provider.windowDays && provider.windowDays > 0 ? provider.windowDays : windowDays;
    return total + (provider.inputTokens + provider.outputTokens + provider.cacheCreationTokens) / providerWindowDays;
  }, 0);
  // Assume 8-hour active development window per day
  const requiredTokensPerSec = dailyAvgComputeTokens / (8 * 3600);

  // ── Model profiles ────────────────────────────────────────────────────────
  const hfCandidates = new Map(
    (huggingFaceCandidateSet?.candidates ?? []).map((candidate) => [candidate.modelId, candidate])
  );
  const profiles: LocalModelProfile[] = CATALOGUE.map((m) => {
    const profile = {
      ...m,
      ...huggingFaceProfileMetadata(m.hfRepoId, hfCandidates, huggingFaceCandidateSet),
      contextFits:
        estimatedContextWindowNeeded === null || m.contextWindow >= estimatedContextWindowNeeded,
      throughputFits: m.tokensPerSecEstimate >= requiredTokensPerSec
    };

    return appliedForensicGuidance
      ? {
          ...profile,
          forensicInterpretation: forensicProfileInterpretation(
            profile,
            appliedForensicGuidance
          )
        }
      : profile;
  });

  // ── Workload recommendation ────────────────────────────────────────────────
  // Only compute a recommendation when we have real context data — when
  // contextConfidence is "insufficient_data" contextFits is trivially true for
  // every profile (no constraint to check), which would produce false positives.
  const hasRealContext = contextConfidence !== "insufficient_data";

  const allFittingProfiles: LocalModelProfile[] = hasRealContext
    ? profiles.filter((p) => p.contextFits && p.throughputFits)
    : [];

  const recommendedProfile: LocalModelProfile | null = allFittingProfiles[0] ?? null;
  const alternativeProfiles: LocalModelProfile[] = allFittingProfiles.slice(1);

  const workloadGap =
    hasRealContext && recommendedProfile === null
      ? {
          context: profiles.every((p) => !p.contextFits),
          throughput: profiles.every((p) => !p.throughputFits)
        }
      : null;

  return {
    tenant,
    selectedWorkloadScope,
    availableWorkloadScopes,
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
    contextEvidenceSource,
    localDistribution,
    windowDays,
    dailyAvgComputeTokens,
    requiredTokensPerSec,
    profiles,
    recommendedProfile,
    alternativeProfiles,
    workloadGap,
    appliedForensicGuidance
  };
}

function buildAppliedForensicGuidance(
  forensicRun: LocalModelForensicRunInput | null
): LocalModelAppliedForensicGuidance | null {
  const recommendation = forensicRun?.parentSynthesis?.recommendation;
  if (!recommendation) return null;

  const lowerRecommendation = recommendation.toLowerCase();
  const hasLocal = lowerRecommendation.includes("local");
  const hasHosted =
    lowerRecommendation.includes("hosted") || lowerRecommendation.includes("cloud");
  const routingStrategy: ForensicRoutingStrategy =
    lowerRecommendation.includes("tiered") || (hasLocal && hasHosted)
      ? "tiered_hybrid"
      : hasLocal
        ? "local_candidate"
        : hasHosted
          ? "hosted_guardrail"
          : "reviewer_consensus";

  return {
    appliedSections: [
      "Local model migration sizing",
      "Server sizing heuristics",
      "On-prem model profiles"
    ],
    blockingFindings: readForensicFindings(
      forensicRun.parentSynthesis?.dissentingFindings ?? []
    ),
    confidence:
      typeof forensicRun.parentSynthesis?.confidence === "number"
        ? forensicRun.parentSynthesis.confidence
        : null,
    hostedWorkloadScope:
      routingStrategy === "tiered_hybrid"
        ? "tail-context Claude/Codex/Cursor agentic workloads"
        : "workloads blocked by reviewer findings",
    impactSummary:
      routingStrategy === "tiered_hybrid"
        ? "Forensics applied as a tiered hybrid policy: partial local migration for short-context work while preserving hosted routing for tail-context and agentic work."
        : "Forensics applied as reviewer guidance for interpreting local migration sizing, server heuristics, and profile fit.",
    localWorkloadScope:
      routingStrategy === "tiered_hybrid"
        ? "short-context Copilot-style completion workloads"
        : "reviewer-approved local workloads",
    recommendation,
    reviewerCount:
      typeof forensicRun.parentSynthesis?.reviewerCount === "number"
        ? forensicRun.parentSynthesis.reviewerCount
        : null,
    routingStrategy,
    runId: forensicRun.runId ?? null,
    status: forensicRun.status ?? null,
    updatedAt: forensicRun.updatedAt ?? null
  };
}

function forensicProfileInterpretation(
  profile: Pick<LocalModelProfile, "contextWindow" | "name">,
  guidance: LocalModelAppliedForensicGuidance
): string {
  if (guidance.routingStrategy !== "tiered_hybrid") {
    return "Forensic role: reviewer-guided candidate; validate against the recorded findings before routing production traffic.";
  }

  if (profile.contextWindow <= 131_072) {
    return `Forensic role: short-context local candidate for ${guidance.localWorkloadScope}; not a full replacement for ${guidance.hostedWorkloadScope}.`;
  }

  if (profile.contextWindow > 131_072) {
    return `Forensic role: long-context candidate screen only; reviewers still recommend hosted routing for ${guidance.hostedWorkloadScope}.`;
  }

  return `Forensic role: not recommended for the applied routing plan because ${profile.name} misses the current workload fit checks.`;
}

function readForensicFindings(
  findings: Array<Record<string, unknown>>
): LocalModelForensicFinding[] {
  return findings
    .map((finding) => ({
      details: readString(finding.details),
      evidenceRefs: Array.isArray(finding.evidenceRefs)
        ? finding.evidenceRefs.filter((value): value is string => typeof value === "string")
        : [],
      severity: readString(finding.severity),
      title: readString(finding.title)
    }))
    .filter((finding) => finding.title !== "unknown" || finding.details !== "unknown");
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "unknown";
}

function reportWindowDays(summary: ProviderReportSummary): number | null {
  if (!summary.reportStartDay || !summary.reportEndDay) return null;
  const start = new Date(`${summary.reportStartDay}T00:00:00Z`).getTime();
  const end = new Date(`${summary.reportEndDay}T00:00:00Z`).getTime();
  const computed = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return computed > 0 ? computed : null;
}

function huggingFaceProfileMetadata(
  hfRepoId: string,
  hfCandidates: Map<string, HuggingFaceCandidateSet["candidates"][number]>,
  huggingFaceCandidateSet: HuggingFaceCandidateSet | null
): Partial<LocalModelProfile> {
  const candidate = hfCandidates.get(hfRepoId);
  if (!candidate) return {};

  const metadata: Partial<LocalModelProfile> = {
    hfCandidateSetId: huggingFaceCandidateSet?.candidateSetId,
    hfDegradedReason: candidate.degradedReason,
    hfDownloads: candidate.downloads ?? undefined,
    hfLastModified: candidate.lastModified ?? undefined,
    hfLikes: candidate.likes ?? undefined
  };
  if (candidate.license) metadata.license = candidate.license;

  return metadata;
}
