import type { ProviderReportSummary } from "./types";

// ── Types ───────────────────────────────────────────────────────────────────

export type ProviderId = "github-copilot" | "cursor" | "claude" | "codex";

export interface PerProviderContribution {
  providerId: string;
  providerLabel: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number | null;
  /** Original cloud model identifier as reported by the provider. */
  rawModel: string;
}

export type LocalProfileTier = "min" | "recommended" | "enterprise" | "gap";

export interface ModelFamilyRow {
  /** Stable id for keying. */
  familyKey: string;
  /** Human label, e.g. "Claude Sonnet 4.x". */
  displayName: string;
  /** Inferred parameter scale class for routing to local profile. */
  sizeClass: "small" | "medium" | "large" | "frontier" | "unknown";
  contributions: PerProviderContribution[];

  // ── Aggregates across contributions ────────────────────────────────────
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  /** Compute tokens = input + output + cacheCreation (cache reads excluded). */
  totalPureComputeTokens: number;
  totalCostUsd: number | null;

  // ── Local complement mapping ───────────────────────────────────────────
  /** Best-fit local model profile tier, or "gap" if no profile suffices. */
  recommendedTier: LocalProfileTier;
  /** HF repo id of the recommended profile, or null when "gap". */
  recommendedHfRepoId: string | null;
  /** Display name of recommended profile. */
  recommendedProfileName: string | null;
  /** Free-form note on routing decision (gap explanation, quality concerns). */
  routingNote: string;
}

export interface FleetGrowthProjection {
  /** Window size of the source data (e.g. 28 days). */
  windowDays: number;
  /** Daily-average cost in USD across all providers within the window. */
  baselineDailyUsd: number;
  /** Daily-average compute-token rate across all providers within the window. */
  baselineDailyComputeTokens: number;
  /** Linear-trend USD/day growth slope (positive = ramping). */
  slopeUsdPerDay: number;
  /** Aggregated trend label across providers (ramp/decline/flat/insufficient). */
  trendLabel: "ramp" | "flat" | "decline" | "insufficient_data";

  monthlyUsd: number;
  quarterlyUsd: number;
  annualUsd: number;
  twoYearUsd: number;

  monthlyComputeTokens: number;
  quarterlyComputeTokens: number;
  annualComputeTokens: number;
  twoYearComputeTokens: number;

  /** Required tokens/sec to serve projected month-24 daily compute load in 8h window. */
  twoYearRequiredTokensPerSec: number;
  /** Recommended profile tier for the 2-year projected steady-state load. */
  twoYearRecommendedTier: LocalProfileTier;
  twoYearRecommendedProfileName: string | null;
  twoYearRecommendedHfRepoId: string | null;
  twoYearNote: string;
}

export interface CrossProviderModelFleetReport {
  rows: ModelFamilyRow[];
  growth: FleetGrowthProjection;
  /** Models we observed but couldn't classify into a known family — surfaced for transparency. */
  unclassifiedModels: string[];
}

// ── Family classifier ──────────────────────────────────────────────────────
//
// Maps observed cloud-model identifiers to canonical families and a size class
// used by the local-profile router. Pattern-based — easy to extend.

interface FamilyDef {
  pattern: RegExp;
  familyKey: string;
  displayName: string;
  sizeClass: ModelFamilyRow["sizeClass"];
}

const FAMILY_DEFS: FamilyDef[] = [
  // Anthropic Claude
  { pattern: /claude.*opus.*4/i, familyKey: "claude-opus-4", displayName: "Claude Opus 4.x", sizeClass: "frontier" },
  { pattern: /claude.*sonnet.*4/i, familyKey: "claude-sonnet-4", displayName: "Claude Sonnet 4.x", sizeClass: "large" },
  { pattern: /claude.*haiku.*4/i, familyKey: "claude-haiku-4", displayName: "Claude Haiku 4.x", sizeClass: "medium" },
  { pattern: /claude.*opus/i, familyKey: "claude-opus-3", displayName: "Claude Opus (legacy)", sizeClass: "frontier" },
  { pattern: /claude.*sonnet/i, familyKey: "claude-sonnet-3", displayName: "Claude Sonnet 3.x", sizeClass: "large" },
  { pattern: /claude.*haiku/i, familyKey: "claude-haiku-3", displayName: "Claude Haiku 3.x", sizeClass: "medium" },
  // OpenAI / Codex
  { pattern: /gpt-5.*codex/i, familyKey: "gpt-5-codex", displayName: "Codex GPT-5", sizeClass: "frontier" },
  { pattern: /gpt-5/i, familyKey: "gpt-5", displayName: "GPT-5", sizeClass: "frontier" },
  { pattern: /gpt-4o/i, familyKey: "gpt-4o", displayName: "GPT-4o", sizeClass: "large" },
  { pattern: /gpt-4\.1/i, familyKey: "gpt-4.1", displayName: "GPT-4.1", sizeClass: "large" },
  { pattern: /gpt-4/i, familyKey: "gpt-4", displayName: "GPT-4", sizeClass: "large" },
  { pattern: /o[1-9]/i, familyKey: "openai-o-reasoning", displayName: "OpenAI o-series", sizeClass: "frontier" },
  // Cursor proprietary
  { pattern: /composer-2/i, familyKey: "cursor-composer-2", displayName: "Cursor Composer 2", sizeClass: "small" },
  { pattern: /composer/i, familyKey: "cursor-composer", displayName: "Cursor Composer", sizeClass: "small" }
];

function classifyModel(rawModel: string): {
  familyKey: string;
  displayName: string;
  sizeClass: ModelFamilyRow["sizeClass"];
} {
  for (const def of FAMILY_DEFS) {
    if (def.pattern.test(rawModel)) {
      return {
        familyKey: def.familyKey,
        displayName: def.displayName,
        sizeClass: def.sizeClass
      };
    }
  }
  return {
    familyKey: `other:${rawModel}`,
    displayName: rawModel || "(unknown model)",
    sizeClass: "unknown"
  };
}

// ── Local-profile router ───────────────────────────────────────────────────

interface LocalProfileRef {
  tier: LocalProfileTier;
  name: string;
  hfRepoId: string;
}

const PROFILE_MIN: LocalProfileRef = {
  tier: "min",
  name: "Llama 3.1 8B Instruct",
  hfRepoId: "meta-llama/Llama-3.1-8B-Instruct"
};
const PROFILE_RECOMMENDED: LocalProfileRef = {
  tier: "recommended",
  name: "Qwen2.5-Coder 14B Instruct",
  hfRepoId: "Qwen/Qwen2.5-Coder-14B-Instruct"
};
const PROFILE_ENTERPRISE: LocalProfileRef = {
  tier: "enterprise",
  name: "Qwen2.5 72B Instruct",
  hfRepoId: "Qwen/Qwen2.5-72B-Instruct"
};

function pickProfile(sizeClass: ModelFamilyRow["sizeClass"]): {
  ref: LocalProfileRef | null;
  note: string;
  tier: LocalProfileTier;
} {
  switch (sizeClass) {
    case "small":
      return {
        ref: PROFILE_MIN,
        tier: "min",
        note: "Cursor Composer-class workloads fit comfortably on the minimum profile."
      };
    case "medium":
      return {
        ref: PROFILE_MIN,
        tier: "min",
        note: "Haiku-class models can be approximated with the min profile for most coding tasks."
      };
    case "large":
      return {
        ref: PROFILE_RECOMMENDED,
        tier: "recommended",
        note: "Sonnet/GPT-4-class workloads should target the recommended 14B coder profile for best parity."
      };
    case "frontier":
      return {
        ref: PROFILE_ENTERPRISE,
        tier: "enterprise",
        note: "Opus / GPT-5 / o-series workloads need the 72B enterprise profile to approach quality parity; complex reasoning may still fall short."
      };
    case "unknown":
    default:
      return {
        ref: null,
        tier: "gap",
        note: "Unknown model family — manual review required to map to a local profile."
      };
  }
}

// ── Provider per-model extraction ──────────────────────────────────────────

interface RawPerModel {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number | null;
}

function extractPerModel(s: ProviderReportSummary): RawPerModel[] {
  const breakdown = (s as unknown as Record<string, unknown>)["perModelBreakdown"];
  if (!Array.isArray(breakdown)) return [];

  return breakdown.map((row) => {
    const r = row as Record<string, unknown>;
    const num = (k: string): number => (typeof r[k] === "number" ? (r[k] as number) : 0);
    const numOrNull = (k: string): number | null =>
      typeof r[k] === "number" ? (r[k] as number) : null;

    // Provider-shape normalization:
    // - Codex: inputTokens (total), uncachedInputTokens, costUsd
    // - Claude: uncachedInputTokens, cacheReadTokens, cacheCreationTokens, outputTokens, costUsd
    // - Cursor: inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, chargedCostUsd
    const inputUncached =
      typeof r["uncachedInputTokens"] === "number"
        ? (r["uncachedInputTokens"] as number)
        : num("inputTokens");

    const cacheCreation =
      typeof r["cacheCreationTokens"] === "number"
        ? (r["cacheCreationTokens"] as number)
        : typeof r["cacheWriteTokens"] === "number"
          ? (r["cacheWriteTokens"] as number)
          : 0;

    const cost =
      typeof r["costUsd"] === "number" || r["costUsd"] === null
        ? (r["costUsd"] as number | null)
        : numOrNull("chargedCostUsd");

    return {
      model: typeof r["model"] === "string" ? (r["model"] as string) : "(unknown)",
      inputTokens: inputUncached,
      outputTokens: num("outputTokens"),
      cacheReadTokens: num("cacheReadTokens"),
      cacheCreationTokens: cacheCreation,
      costUsd: cost
    };
  });
}

// ── Builder ────────────────────────────────────────────────────────────────

export function buildCrossProviderModelFleet(
  summaries: ProviderReportSummary[]
): CrossProviderModelFleetReport {
  const familyMap = new Map<string, ModelFamilyRow>();
  const unclassified = new Set<string>();

  for (const s of summaries) {
    const rows = extractPerModel(s);
    for (const row of rows) {
      const cls = classifyModel(row.model);
      if (cls.sizeClass === "unknown") unclassified.add(row.model);

      const computeTokens =
        row.inputTokens + row.outputTokens + row.cacheCreationTokens;

      let entry = familyMap.get(cls.familyKey);
      if (!entry) {
        const profile = pickProfile(cls.sizeClass);
        entry = {
          familyKey: cls.familyKey,
          displayName: cls.displayName,
          sizeClass: cls.sizeClass,
          contributions: [],
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheReadTokens: 0,
          totalCacheCreationTokens: 0,
          totalPureComputeTokens: 0,
          totalCostUsd: null,
          recommendedTier: profile.tier,
          recommendedHfRepoId: profile.ref?.hfRepoId ?? null,
          recommendedProfileName: profile.ref?.name ?? null,
          routingNote: profile.note
        };
        familyMap.set(cls.familyKey, entry);
      }

      entry.contributions.push({
        providerId: s.providerId,
        providerLabel: s.providerLabel,
        rawModel: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        costUsd: row.costUsd
      });
      entry.totalInputTokens += row.inputTokens;
      entry.totalOutputTokens += row.outputTokens;
      entry.totalCacheReadTokens += row.cacheReadTokens;
      entry.totalCacheCreationTokens += row.cacheCreationTokens;
      entry.totalPureComputeTokens += computeTokens;
      if (row.costUsd !== null) {
        entry.totalCostUsd = (entry.totalCostUsd ?? 0) + row.costUsd;
      }
    }
  }

  const rows = [...familyMap.values()].sort(
    (a, b) => b.totalPureComputeTokens - a.totalPureComputeTokens
  );

  const growth = buildGrowthProjection(summaries, rows);

  return {
    rows,
    growth,
    unclassifiedModels: [...unclassified].sort()
  };
}

// ── Growth projection across all providers ─────────────────────────────────

function buildGrowthProjection(
  summaries: ProviderReportSummary[],
  rows: ModelFamilyRow[]
): FleetGrowthProjection {
  // Window from first summary with both bounds.
  let windowDays = 28;
  for (const s of summaries) {
    if (s.reportStartDay && s.reportEndDay) {
      const start = new Date(s.reportStartDay + "T00:00:00Z").getTime();
      const end = new Date(s.reportEndDay + "T00:00:00Z").getTime();
      const computed = Math.round((end - start) / 86400000) + 1;
      if (computed > 0) {
        windowDays = computed;
        break;
      }
    }
  }

  const totalCostUsd = summaries.reduce(
    (a, s) => a + (s.spendProjection?.totalUsd ?? 0),
    0
  );
  const baselineDailyUsd = windowDays > 0 ? totalCostUsd / windowDays : 0;

  const totalComputeTokens = rows.reduce((a, r) => a + r.totalPureComputeTokens, 0);
  const baselineDailyComputeTokens =
    windowDays > 0 ? totalComputeTokens / windowDays : 0;

  // Aggregate per-day across providers, then run linear regression.
  const dailyMap = new Map<string, number>();
  for (const s of summaries) {
    for (const d of s.spendProjection?.dailyBreakdown ?? []) {
      dailyMap.set(d.date, (dailyMap.get(d.date) ?? 0) + d.costUsd);
    }
  }
  const dailySorted = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  let slopeUsdPerDay = 0;
  if (dailySorted.length >= 2) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    const n = dailySorted.length;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += dailySorted[i];
      sumXY += i * dailySorted[i];
      sumX2 += i * i;
    }
    const denom = n * sumX2 - sumX * sumX;
    if (denom !== 0) slopeUsdPerDay = (n * sumXY - sumX * sumY) / denom;
  }

  // Trend label: ramp if slope > 5% of baseline/day; decline if < -5%; else flat.
  const trendThreshold = baselineDailyUsd * 0.05;
  let trendLabel: FleetGrowthProjection["trendLabel"] = "flat";
  if (dailySorted.length < 7) trendLabel = "insufficient_data";
  else if (slopeUsdPerDay > trendThreshold) trendLabel = "ramp";
  else if (slopeUsdPerDay < -trendThreshold) trendLabel = "decline";

  // Linear-trended cumulative cost over `days` future days, starting from
  // last observed daily cost. Floor at 0 to avoid negative spend.
  const lastCost = dailySorted.length > 0 ? dailySorted[dailySorted.length - 1] : baselineDailyUsd;
  function trendedTotal(days: number): number {
    if (slopeUsdPerDay === 0 || trendLabel === "insufficient_data" || trendLabel === "flat") {
      return baselineDailyUsd * days;
    }
    let total = 0;
    for (let i = 1; i <= days; i++) {
      total += Math.max(0, lastCost + slopeUsdPerDay * i);
    }
    return total;
  }

  // Token rate scales with cost (assume blended unit cost is constant) — apply
  // the same growth multiplier to compute-tokens per day.
  function trendedTokens(days: number): number {
    if (slopeUsdPerDay === 0 || trendLabel === "insufficient_data" || trendLabel === "flat") {
      return baselineDailyComputeTokens * days;
    }
    const flatTotal = baselineDailyUsd * days;
    if (flatTotal === 0) return baselineDailyComputeTokens * days;
    const multiplier = trendedTotal(days) / flatTotal;
    return baselineDailyComputeTokens * days * multiplier;
  }

  const monthlyUsd = trendedTotal(30);
  const quarterlyUsd = trendedTotal(90);
  const annualUsd = trendedTotal(365);
  const twoYearUsd = trendedTotal(730);

  const monthlyComputeTokens = trendedTokens(30);
  const quarterlyComputeTokens = trendedTokens(90);
  const annualComputeTokens = trendedTokens(365);
  const twoYearComputeTokens = trendedTokens(730);

  // Day-730 daily compute load = trendedTokens(730) / 730  (avg over the window;
  // for steady-state at end of window we'd use last-day rate, but avg avoids
  // overstating sustained capacity needs).
  const dayAtMonth24Tokens =
    slopeUsdPerDay === 0 || trendLabel === "insufficient_data" || trendLabel === "flat"
      ? baselineDailyComputeTokens
      : Math.max(
          0,
          baselineDailyComputeTokens *
            (1 + (slopeUsdPerDay * 730) / Math.max(lastCost, 0.0001))
        );

  const twoYearRequiredTokensPerSec = dayAtMonth24Tokens / (8 * 3600);

  // Pick local profile that can sustain 2-year load. Throughput/sec estimates
  // are sourced from the catalogue in localModelReport.ts to stay consistent.
  const PROFILE_THROUGHPUT: Array<{ ref: LocalProfileRef; tps: number }> = [
    { ref: PROFILE_MIN, tps: 80 },
    { ref: PROFILE_RECOMMENDED, tps: 55 },
    { ref: PROFILE_ENTERPRISE, tps: 15 }
  ];
  let twoYearTier: LocalProfileTier = "gap";
  let twoYearProfile: LocalProfileRef | null = null;
  let twoYearNote =
    "Projected 2-year load exceeds the throughput of every catalogued profile — plan for horizontal scaling (multiple replicas) or a higher-throughput tier.";

  // If we have any frontier-class workloads in the fleet, the enterprise tier
  // becomes the *minimum* required for quality parity even if the min tier
  // could meet throughput. Otherwise pick by throughput.
  const hasFrontier = rows.some((r) => r.sizeClass === "frontier");
  const hasLarge = rows.some((r) => r.sizeClass === "large");

  if (hasFrontier) {
    const enterprise = PROFILE_THROUGHPUT[2];
    twoYearTier = "enterprise";
    twoYearProfile = enterprise.ref;
    twoYearNote =
      enterprise.tps >= twoYearRequiredTokensPerSec
        ? "Enterprise profile required for frontier-class quality parity and meets projected 2-year throughput."
        : "Enterprise profile required for quality parity but throughput is short of projected 2-year load — plan for replicas / batching.";
  } else if (hasLarge) {
    const recommended = PROFILE_THROUGHPUT[1];
    twoYearTier = "recommended";
    twoYearProfile = recommended.ref;
    twoYearNote =
      recommended.tps >= twoYearRequiredTokensPerSec
        ? "Recommended profile sized correctly for projected 2-year load and quality."
        : "Recommended profile required for quality, but throughput is short of projected 2-year load — plan for replicas.";
  } else {
    // Pick the smallest profile that meets throughput.
    const fit = PROFILE_THROUGHPUT.slice()
      .sort((a, b) => a.tps - b.tps)
      .find((p) => p.tps >= twoYearRequiredTokensPerSec);
    if (fit) {
      twoYearTier = fit.ref.tier;
      twoYearProfile = fit.ref;
      twoYearNote = "Sized to meet projected 2-year throughput at the lowest viable tier.";
    }
  }

  return {
    windowDays,
    baselineDailyUsd,
    baselineDailyComputeTokens,
    slopeUsdPerDay,
    trendLabel,
    monthlyUsd,
    quarterlyUsd,
    annualUsd,
    twoYearUsd,
    monthlyComputeTokens,
    quarterlyComputeTokens,
    annualComputeTokens,
    twoYearComputeTokens,
    twoYearRequiredTokensPerSec,
    twoYearRecommendedTier: twoYearTier,
    twoYearRecommendedProfileName: twoYearProfile?.name ?? null,
    twoYearRecommendedHfRepoId: twoYearProfile?.hfRepoId ?? null,
    twoYearNote
  };
}
