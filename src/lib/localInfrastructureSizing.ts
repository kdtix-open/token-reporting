import { HARDWARE_PROFILES, type HardwareProfile } from "./hardwareProfiles";
import type { HuggingFaceCandidateSet } from "./huggingFaceCandidates";
import type { LocalSessionDistribution } from "./localSessionDistribution";
import {
  buildLocalModelReport,
  type LocalModelMigrationReport,
  type LocalModelProfile,
} from "./localModelReport";
import type { ProviderReportSummary, SpendCostSource } from "./types";

export type NormalizedBillingType =
  | "ACTUAL"
  | "ESTIMATED"
  | "SEAT_BASED"
  | "UNKNOWN";
export type RouteLatencySensitivity = "low" | "medium" | "high";
export type RouteQualitySensitivity = "low" | "medium" | "high";
export type WorkloadRouting = "cloud" | "hybrid" | "local" | "shadow_only";
export type RouteClassKind = "additive_workload" | "cross_cutting_overlay";
export type ContextStatsSource =
  | "global_fallback"
  | "provider_specific"
  | "route_specific"
  | "unknown";
export type WorkloadScope =
  | "agentic_worker"
  | "all_provider_traffic"
  | "cloud_only_tail"
  | "copilot_cli"
  | "repo_automation_project"
  | "reviewer";
export type CapacityConfidence =
  | "derived_estimate"
  | "measured"
  | "unknown"
  | "vendor_claim";
export type HardwareBudgetConfidence =
  | "derived_estimate"
  | "measured"
  | "quote_required"
  | "unknown";
export type HardwareReplacementGoal =
  | "shadow_only"
  | "safe_canary"
  | "steady_state_replacement"
  | "peak_safe_replacement"
  | "p99_full_replacement";
export type LocalInfrastructureConfidence = "high" | "low" | "medium";
export type MigrationPhaseId =
  | "cloud_baseline"
  | "cloud_fallback_tail"
  | "local_shadow"
  | "local_worker_cloud_reviewer"
  | "safe_local_worker_and_reviewer"
  | "short_context_canary";
export type FirstServerRecommendationKind =
  | "do_not_buy_yet"
  | "lower_cost_fallback_quote"
  | "preferred_first_quote"
  | "scale_only_candidate";
export type BenchmarkGateStatus = "failed" | "in_progress" | "not_started" | "passed";

export interface NormalizedProviderUsage {
  providerId: string;
  providerName: string;
  coverageStart: string | null;
  coverageEnd: string | null;
  windowDays: number | null;
  billingType: NormalizedBillingType;
  inputTokens: number;
  uncachedInputTokens: number | null;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  requestsCount: number | null;
  sessionsCount: number | null;
  totalCostUsd: number | null;
  modelsUsed: string[];
  notes: string[];
}

export interface WorkloadRouteClass {
  id: string;
  name: string;
  kind: RouteClassKind;
  overlapsWithRouteClassIds: string[];
  contextStatsSource: ContextStatsSource;
  contextStatsWarning?: string;
  description: string;
  providerIds: string[];
  modelFamilies: string[];
  tokenShareEstimate: number;
  requestShareEstimate: number;
  contextRequirementTokens: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
  };
  computeTokensPerDay: number;
  peakTokensPerSecond: number;
  cacheReadTokensPerDay: number;
  latencySensitivity: RouteLatencySensitivity;
  qualitySensitivity: RouteQualitySensitivity;
  recommendedRouting: WorkloadRouting;
  localCandidateModels: string[];
  cloudFallbackModels: string[];
  reason: string;
}

export interface LocalCoverageSummary {
  targetFirstServerCoveragePct: number;
  estimatedFullWorkloadCapacityPct: number;
  safeInitialProductionRoutingPct: number;
  shadowCoveragePct: number;
  canaryCoveragePct: number;
  capacityLimitedBy: string[];
  explanation: string;
}

export interface HardwareCapacityEstimate {
  hardwareProfileId: string;
  modelId: string;
  quantization: string;
  contextTokens: number;
  estimatedTokensPerSecondPerGpu: number | null;
  estimatedAggregateTokensPerSecond: number | null;
  estimatedConcurrentRequests: number | null;
  estimatedProjectLaneCapacity: number | null;
  memoryFit: boolean;
  throughputFit: boolean;
  contextFit: boolean;
  bottlenecks: string[];
  confidence: CapacityConfidence;
}

export interface LocalInfrastructureForensicRun {
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

export interface LocalInfrastructureWorkloadSummary {
  totalInputTokens: number;
  totalUncachedInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalPureComputeTokens: number;
  totalRequests: number | null;
  totalSessions: number | null;
  dailyAvgComputeTokens: number;
  dailyAvgCacheReadTokens: number;
  allProviderComputeTps: number;
  allProviderPeakTps: number;
  selectedScopeComputeTps: number;
  selectedScopePeakTps: number;
  repoAutomationComputeTps: number;
  repoAutomationPeakTps: number;
  currentProjectLaneComputeTps: number;
  currentProjectLanePeakTps: number;
  currentProjectLaneP50Context: number | null;
  currentProjectLaneP95Context: number | null;
  currentProjectLaneP99Context: number | null;
  currentProjectLaneMaxContext: number | null;
  estimatedContextWindowNeeded: number | null;
  contextConfidence: LocalModelMigrationReport["contextConfidence"];
}

export interface WorkloadScopeConfig {
  defaultSizingScope: WorkloadScope;
  compareAgainstAllProviderTraffic: boolean;
}

export interface WorkloadScopeSummary {
  scope: WorkloadScope;
  label: string;
  providerIds: string[];
  routeClassIds: string[];
  computeTokensPerDay: number;
  currentProjectLaneComputeTps: number;
  peakTokensPerSecond: number;
  contextRequirementTokens: {
    p50: number | null;
    p95: number | null;
    p99: number | null;
    max: number | null;
  };
  notes: string[];
}

export interface HardwareBudgetScenario {
  scope: WorkloadScope;
  replacementGoal: HardwareReplacementGoal;
  targetTokensPerSecond: number;
  requiredContextTokens: number;
  hardwareProfileId: string;
  hardwareProfileName: string;
  estimatedNodeThroughputTps: number | null;
  requiredNodes: number | null;
  requiredGpuCount: number | null;
  estimatedCapexLowUsd: number | null;
  estimatedCapexHighUsd: number | null;
  estimatedAnnualOpexUsd: number | null;
  estimatedSystemPowerKw: number | null;
  rackUnitsRequired: number | null;
  fullReplacementAllowed: boolean;
  cloudFallbackRequired: boolean;
  confidence: HardwareBudgetConfidence;
  explanation: string;
}

export interface HardwareBudgetSummary {
  selectedScope: WorkloadScope;
  cfoSummaryLines: string[];
  copilotDominanceWarning: string;
}

export interface MigrationPolicy {
  budgetHighUsd: number;
  budgetLowUsd: number;
  cloudFallbackRequiredFor: string[];
  initialProductionCoveragePct: number;
  requireBenchmarksBeforeProductionRouting: boolean;
  targetFirstServerCoveragePct: number;
}

export interface LocalMigrationPhase {
  phase: MigrationPhaseId;
  name: string;
  targetLocalCoveragePct: number;
  recommendedRouting: string;
  entryCriteria: string[];
  exitCriteria: string[];
}

export interface LocalMigrationPlan {
  candidateServerLocalCoveragePct: number;
  cloudGuardrailWorkloadIds: string[];
  fullLocalReplacementRecommended: boolean;
  migrationPolicy: MigrationPolicy;
  phases: LocalMigrationPhase[];
  safeLocalWorkloadIds: string[];
  summary: string;
}

export interface FirstServerRecommendation {
  hardwareProfileId: string | null;
  profileName: string;
  recommendationKind: FirstServerRecommendationKind;
  budgetFit: "fits_target" | "quote_required" | "scale_only" | "unknown";
  fullLocalReplacementRecommended: boolean;
  candidateServerLocalCoveragePct: number;
  estimatedProjectLaneCapacityByRouteClass: Array<{
    routeClassId: string;
    estimatedProjectLaneCapacity: number | null;
    routing: WorkloadRouting;
  }>;
  facilitiesPrerequisites: string[];
  dataToCollectBeforePurchase: string[];
  routingRecommendation: string;
  rationale: string[];
  capacityEstimates: HardwareCapacityEstimate[];
}

export interface LocalInfrastructureFinancials {
  capexLowUsd: number | null;
  capexHighUsd: number | null;
  annualOpexEstimateUsd: number | null;
  annualSupportEstimateUsd: number | null;
  annualPowerCoolingEstimateUsd: number | null;
  annualSoftwareEstimateUsd: number | null;
  annualCloudSpendDisplacementUsd: number | null;
  annualSubscriptionRevenuePotentialUsd: number | null;
  paybackMonthsCloudSpendOnly: number | null;
  paybackMonthsRevenueCapacity: number | null;
  notes: string[];
}

export interface ReservedCapacityAssumptions {
  pilotMonthlyPerLane: number;
  productionMonthlyPerLane: number;
  dedicatedApplianceMonthly: number;
  targetLanesPerServer: number;
  yearOneHardwareBasis: "capex_high" | "capex_low";
}

export interface ScaleRampPhase {
  phase: "cage" | "multi_server_rack" | "pilot" | "poc" | "production_server" | "rack_scale";
  name: string;
  trigger: string;
  targetLocalCoveragePct: number;
  targetProjectLanes: number;
  recommendedHardwareProfileIds: string[];
  capexRangeUsd: [number | null, number | null];
  facilitiesRequirements: string[];
  successMetrics: string[];
  exitCriteria: string[];
}

export interface BenchmarkCaptureSchema {
  batchSize: string;
  concurrency: string;
  contextTokens: string;
  gpuUtilizationPct: string;
  hardwareProfileId: string;
  modelId: string;
  p50LatencyMs: string;
  p95LatencyMs: string;
  p99LatencyMs: string;
  quantization: string;
  servingStack: string;
  tokensPerSecond: string;
  ttftMs: string;
  vramUsedGb: string;
}

export interface BenchmarkPlan {
  benchmarkDataPath: string;
  comparisons: string[];
  confidenceUpgradeCriteria: string[];
  manualCaptureSchema: BenchmarkCaptureSchema;
  replaySources: string[];
  requiredMeasurements: string[];
  summary: string;
}

export interface BenchmarkGate {
  gateId: string;
  name: string;
  status: BenchmarkGateStatus;
  requiredForPhase: string;
  minimumSampleCount: number;
  requiredMetrics: string[];
  passCriteria: string[];
  failAction: string;
}

export interface ExecutiveHardwareDecisionSummary {
  firstQuoteToRequest: string;
  whatThisServerCanDoNow: string;
  whatThisServerCannotDo: string;
  estimatedSafeInitialRouting: string;
  estimatedFullWorkloadCapacity: string;
  capexRange: string;
  quoteConfidence: string;
  paybackFromCloudDisplacement: string;
  paybackFromReservedCapacityProductRevenue: string;
  nextScaleTrigger: string;
}

export interface LocalInfrastructureSizingReport {
  generatedAt: string;
  sourceWindow: {
    coverageEnd: string | null;
    coverageStart: string | null;
    maxWindowDays: number | null;
    providerWindowDays: Array<{
      providerId: string;
      windowDays: number | null;
    }>;
  };
  providerCoverage: NormalizedProviderUsage[];
  dataQualityWarnings: string[];
  workloadSummary: LocalInfrastructureWorkloadSummary;
  workloadScopeConfig: WorkloadScopeConfig;
  workloadScopeSummaries: WorkloadScopeSummary[];
  routeClasses: WorkloadRouteClass[];
  localMigrationPlan: LocalMigrationPlan;
  localCoverageSummary: LocalCoverageSummary;
  hardwareProfiles: HardwareProfile[];
  hardwareCapacityEstimates: HardwareCapacityEstimate[];
  hardwareBudgetScenarios: HardwareBudgetScenario[];
  hardwareBudgetSummary: HardwareBudgetSummary;
  recommendedFirstServer: FirstServerRecommendation;
  alternativeFirstServers: FirstServerRecommendation[];
  scaleRamp: ScaleRampPhase[];
  procurementChecklist: string[];
  benchmarkPlan: BenchmarkPlan;
  benchmarkGates: BenchmarkGate[];
  productionRoutingBlocked: boolean;
  financials: LocalInfrastructureFinancials;
  executiveSummary: ExecutiveHardwareDecisionSummary;
  assumptions: string[];
  confidence: LocalInfrastructureConfidence;
}

export interface BuildLocalInfrastructureSizingInput {
  budgetHighUsd?: number;
  budgetLowUsd?: number;
  distribution?: LocalSessionDistribution | null;
  forensicRun?: LocalInfrastructureForensicRun | null;
  generatedAt?: string;
  hardwareProfiles?: HardwareProfile[];
  huggingFaceCandidateSet?: HuggingFaceCandidateSet | null;
  localModelReport?: LocalModelMigrationReport;
  migrationPolicy?: Partial<MigrationPolicy>;
  reservedCapacityAssumptions?: Partial<ReservedCapacityAssumptions>;
  summaries: ProviderReportSummary[];
}

export interface RecommendFirstServerInput {
  budgetHighUsd: number;
  budgetLowUsd: number;
  hardwareProfiles: HardwareProfile[];
  migrationPolicy: MigrationPolicy;
  workload: LocalInfrastructureWorkloadSummary;
}

const ACTIVE_SECONDS_PER_DAY = 8 * 60 * 60;
const DEFAULT_BUDGET_LOW_USD = 100_000;
const DEFAULT_BUDGET_HIGH_USD = 150_000;
const DEFAULT_LOCAL_COVERAGE_PCT = 30;
const seatBasedProviderIds = new Set(["github-copilot", "claude-code"]);

export function normalizeProviderUsage(
  summaries: ProviderReportSummary[]
): NormalizedProviderUsage[] {
  return summaries.map((summary) => {
    const inputTokens = providerInputTokens(summary);
    const outputTokens = providerOutputTokens(summary);
    const uncachedInputTokens = providerUncachedInputTokens(summary, inputTokens);
    const cacheCreationTokens = providerCacheCreationTokens(summary);
    const cacheReadTokens = numberField(summary, "cacheReadTokens");
    const requestsCount = providerRequestsCount(summary);
    const sessionsCount = providerSessionsCount(summary);
    const notes = providerNotes(summary, inputTokens, outputTokens);

    return {
      billingType: providerBillingType(summary),
      cacheCreationTokens,
      cacheReadTokens,
      coverageEnd: summary.reportEndDay || null,
      coverageStart: summary.reportStartDay || null,
      inputTokens,
      modelsUsed: providerModelsUsed(summary),
      notes,
      outputTokens,
      providerId: summary.providerId,
      providerName: summary.providerLabel,
      requestsCount,
      sessionsCount,
      totalCostUsd: finiteNumber(summary.spendProjection.totalUsd),
      uncachedInputTokens,
      windowDays: providerWindowDays(summary)
    };
  });
}

export function pureComputeTokens(usage: NormalizedProviderUsage): number {
  return (
    (usage.uncachedInputTokens ?? usage.inputTokens) +
    usage.outputTokens +
    usage.cacheCreationTokens
  );
}

export function buildLocalInfrastructureSizing(
  input: BuildLocalInfrastructureSizingInput
): LocalInfrastructureSizingReport {
  const hardwareProfiles = input.hardwareProfiles ?? HARDWARE_PROFILES;
  const budgetLowUsd = input.budgetLowUsd ?? DEFAULT_BUDGET_LOW_USD;
  const budgetHighUsd = input.budgetHighUsd ?? DEFAULT_BUDGET_HIGH_USD;
  const localModelReport =
    input.localModelReport ??
    buildLocalModelReport(
      input.summaries,
      input.distribution ?? null,
      input.huggingFaceCandidateSet ?? null,
      input.forensicRun ?? null
    );
  const providerCoverage = normalizeProviderUsage(input.summaries);
  const baseWorkloadSummary = buildWorkloadSummary(providerCoverage, input.distribution ?? null, localModelReport);
  const dataQualityWarnings = buildDataQualityWarnings(providerCoverage, input.summaries);
  const routeClasses = buildRouteClasses(
    providerCoverage,
    baseWorkloadSummary,
    localModelReport.profiles ?? []
  );
  const workloadScopeConfig: WorkloadScopeConfig = {
    compareAgainstAllProviderTraffic: true,
    defaultSizingScope: "repo_automation_project"
  };
  const workloadScopeSummaries = buildWorkloadScopeSummaries(
    providerCoverage,
    routeClasses,
    baseWorkloadSummary
  );
  const workloadSummary = applySelectedWorkloadScope(
    baseWorkloadSummary,
    workloadScopeSummaries,
    workloadScopeConfig.defaultSizingScope
  );
  const migrationPolicy = buildMigrationPolicy(input.migrationPolicy, budgetLowUsd, budgetHighUsd);
  const localMigrationPlan = buildLocalMigrationPlan(routeClasses, migrationPolicy);
  const hardwareCapacityEstimates = hardwareProfiles.flatMap((profile) =>
    buildCapacityEstimates(profile, workloadSummary, localModelReport.profiles ?? [])
  );
  const benchmarkGates = buildBenchmarkGates();
  const productionRoutingBlocked = benchmarkGates.some((gate) => gate.status !== "passed");
  const hardwareBudgetScenarios = buildHardwareBudgetScenarios(
    hardwareProfiles,
    workloadSummary,
    workloadScopeSummaries,
    productionRoutingBlocked,
    budgetHighUsd
  );
  const hardwareBudgetSummary = buildHardwareBudgetSummary({
    budgetHighUsd,
    providerCoverage,
    scenarios: hardwareBudgetScenarios,
    selectedScope: workloadScopeConfig.defaultSizingScope
  });
  const recommendedFirstServer = recommendFirstServer({
    budgetHighUsd,
    budgetLowUsd,
    hardwareProfiles,
    migrationPolicy,
    workload: workloadSummary
  });
  const alternativeFirstServers = buildAlternativeFirstServers(
    hardwareProfiles,
    workloadSummary,
    migrationPolicy,
    recommendedFirstServer.hardwareProfileId
  );
  const scaleRamp = buildScaleRamp(hardwareProfiles);
  const recommendedProfile =
    hardwareProfiles.find((profile) => profile.id === recommendedFirstServer.hardwareProfileId) ??
    null;
  const localCoverageSummary = buildLocalCoverageSummary(
    recommendedFirstServer,
    migrationPolicy,
    workloadSummary
  );
  const financials = buildFinancials(
    providerCoverage,
    recommendedProfile,
    localCoverageSummary,
    input.reservedCapacityAssumptions
  );
  const allWarnings = buildReportWarnings(
    dataQualityWarnings,
    providerCoverage,
    localCoverageSummary,
    hardwareProfiles
  );
  const executiveSummary = buildExecutiveSummary(
    localCoverageSummary,
    financials,
    recommendedProfile
  );

  return {
    assumptions: buildAssumptions(input.forensicRun ?? null),
    benchmarkPlan: buildBenchmarkPlan(),
    benchmarkGates,
    confidence: sizingConfidence(input.distribution ?? null, input.forensicRun ?? null, allWarnings),
    dataQualityWarnings: allWarnings,
    executiveSummary,
    financials,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    hardwareBudgetScenarios,
    hardwareBudgetSummary,
    hardwareCapacityEstimates,
    hardwareProfiles,
    localCoverageSummary,
    localMigrationPlan,
    procurementChecklist: buildProcurementChecklist(recommendedProfile),
    providerCoverage,
    productionRoutingBlocked,
    recommendedFirstServer,
    alternativeFirstServers,
    routeClasses,
    scaleRamp,
    sourceWindow: buildSourceWindow(providerCoverage),
    workloadScopeConfig,
    workloadScopeSummaries,
    workloadSummary
  };
}

export function recommendFirstServer(
  input: RecommendFirstServerInput
): FirstServerRecommendation {
  const preferred =
    input.hardwareProfiles.find(
      (profile) =>
        profile.id === "preferred_quad_rtxpro6000_blackwell_server" &&
        isQuoteableFloorOrPilot(profile) &&
        maybeFitsBudget(profile, input.budgetHighUsd)
    ) ??
    input.hardwareProfiles.find(
      (profile) =>
        profile.id === "floor_proto_dual_rtxpro6000_blackwell_server" &&
        isQuoteableFloorOrPilot(profile) &&
        maybeFitsBudget(profile, input.budgetHighUsd)
    ) ??
    input.hardwareProfiles.find(
      (profile) =>
        profile.id === "floor_proto_custom_wrx90_quad_rtxpro6000_maxq" &&
        isQuoteableFloorOrPilot(profile) &&
        maybeFitsBudget(profile, input.budgetHighUsd)
    );

  if (!preferred) {
    return doNotBuyRecommendation(input);
  }

  return recommendationFromProfile({
    candidateServerLocalCoveragePct: input.migrationPolicy.targetFirstServerCoveragePct,
    kind: "preferred_first_quote",
    profile: preferred,
    workload: input.workload
  });
}

export function buildScaleRamp(hardwareProfiles: HardwareProfile[]): ScaleRampPhase[] {
  return [
    {
      phase: "poc",
      name: "POC - cloud baseline plus local shadow",
      trigger: "Start after provider telemetry, local session distribution, and bridge forensics are available.",
      targetLocalCoveragePct: 10,
      targetProjectLanes: 0.25,
      recommendedHardwareProfileIds: profileIdsByPhase(hardwareProfiles, ["floor_proto"]),
      capexRangeUsd: [0, 150_000],
      facilitiesRequirements: ["Floor-safe power circuit", "basic thermal monitoring", "isolated benchmark network"],
      successMetrics: ["No production decisions routed locally", "shadow quality compared to hosted baseline"],
      exitCriteria: ["Benchmark import path populated", "p95 latency and quality deltas reviewed"]
    },
    {
      phase: "pilot",
      name: "Pilot - selected short-context local routing",
      trigger: "Shadow results show stable quality on low-risk coding tasks.",
      targetLocalCoveragePct: 30,
      targetProjectLanes: 1,
      recommendedHardwareProfileIds: profileIdsByPhase(hardwareProfiles, ["floor_proto", "pilot_server"]),
      capexRangeUsd: [100_000, 150_000],
      facilitiesRequirements: ["Dedicated 208-240V power", "vendor-supported drivers", "remote management"],
      successMetrics: ["10-30% safe workload routed locally", "cloud fallback available on every request"],
      exitCriteria: ["Canary error budget met", "cloud reviewer approves local worker outputs"]
    },
    {
      phase: "production_server",
      name: "First production server - local worker pool with cloud reviewer",
      trigger: "One Repo Automation project lane needs sustained local worker capacity.",
      targetLocalCoveragePct: 60,
      targetProjectLanes: 1,
      recommendedHardwareProfileIds: profileIdsByPhase(hardwareProfiles, ["pilot_server", "production_node"]),
      capexRangeUsd: [150_000, null],
      facilitiesRequirements: ["Rack plan", "support contract", "backup and restore plan", "central observability"],
      successMetrics: ["30-60% traffic eligible for local worker routing", "hosted reviewer catches regressions"],
      exitCriteria: ["Measured payback or reserved-capacity value justifies next node"]
    },
    {
      phase: "multi_server_rack",
      name: "Multi-server rack - multiple project lanes",
      trigger: "Two or more active Repo Automation lanes contend for local capacity.",
      targetLocalCoveragePct: 70,
      targetProjectLanes: 3,
      recommendedHardwareProfileIds: profileIdsByPhase(hardwareProfiles, ["pilot_server", "production_node"]),
      capexRangeUsd: [300_000, null],
      facilitiesRequirements: ["Load balancing", "25/100GbE fabric", "spares strategy", "rack power budget"],
      successMetrics: ["Lane-aware routing", "graceful provider fallback under node failure"],
      exitCriteria: ["Queueing stays inside p95 target while one node is unavailable"]
    },
    {
      phase: "rack_scale",
      name: "Rack scale - NVLink rack domain",
      trigger: "High-density workloads justify NVLink rack-domain economics.",
      targetLocalCoveragePct: 85,
      targetProjectLanes: 10,
      recommendedHardwareProfileIds: ["rack_scale_gb200_nvl72"],
      capexRangeUsd: [null, null],
      facilitiesRequirements: ["48U rack", "liquid cooling readiness", "data-center support contract"],
      successMetrics: ["Rack scheduler validated", "tail-context tasks benchmarked with real workloads"],
      exitCriteria: ["Cage-level power, cooling, and network plan approved"]
    },
    {
      phase: "cage",
      name: "Cage - multiple racks with dedicated operations",
      trigger: "Multiple products require reserved AI engineering capacity.",
      targetLocalCoveragePct: 90,
      targetProjectLanes: 25,
      recommendedHardwareProfileIds: [
        "rack_scale_gb200_nvl72",
        "future_rubin_class_unquoted"
      ],
      capexRangeUsd: [null, null],
      facilitiesRequirements: ["Dedicated cage", "redundant power", "cooling operations", "network operations"],
      successMetrics: ["Multi-rack operations runbook", "provider fallback tested regularly"],
      exitCriteria: ["Operate as a capacity product, not a one-off server purchase"]
    }
  ];
}

function buildWorkloadSummary(
  usages: NormalizedProviderUsage[],
  distribution: LocalSessionDistribution | null,
  localModelReport: LocalModelMigrationReport
): LocalInfrastructureWorkloadSummary {
  const totalInputTokens = sum(usages.map((usage) => usage.inputTokens));
  const totalUncachedInputTokens = sum(
    usages.map((usage) => usage.uncachedInputTokens ?? usage.inputTokens)
  );
  const totalOutputTokens = sum(usages.map((usage) => usage.outputTokens));
  const totalCacheReadTokens = sum(usages.map((usage) => usage.cacheReadTokens));
  const totalCacheCreationTokens = sum(usages.map((usage) => usage.cacheCreationTokens));
  const totalPureComputeTokens = sum(usages.map((usage) => pureComputeTokens(usage)));
  const dailyAvgComputeTokens = sum(usages.map((usage) => dailyAverage(pureComputeTokens(usage), usage.windowDays)));
  const dailyAvgCacheReadTokens = sum(usages.map((usage) => dailyAverage(usage.cacheReadTokens, usage.windowDays)));
  const allProviderComputeTps = Math.max(
    dailyAvgComputeTokens / ACTIVE_SECONDS_PER_DAY,
    finiteNumber(localModelReport.requiredTokensPerSec) ?? 0
  );
  const legacyProjectLaneComputeTps =
    finiteNumber(localModelReport.requiredTokensPerSec) ?? allProviderComputeTps;
  const p50 = finiteNumber(distribution?.combined.p50);
  const p95 = finiteNumber(distribution?.combined.p95);
  const p99 = finiteNumber(distribution?.combined.p99);
  const max = finiteNumber(distribution?.combined.max);

  return {
    contextConfidence: localModelReport.contextConfidence ?? "insufficient_data",
    allProviderComputeTps,
    allProviderPeakTps: allProviderComputeTps * 3,
    currentProjectLaneComputeTps: legacyProjectLaneComputeTps,
    currentProjectLaneMaxContext: max,
    currentProjectLaneP50Context: p50,
    currentProjectLaneP95Context: p95,
    currentProjectLaneP99Context:
      finiteNumber(localModelReport.estimatedContextWindowNeeded) ?? p99,
    currentProjectLanePeakTps: legacyProjectLaneComputeTps * 3,
    dailyAvgCacheReadTokens,
    dailyAvgComputeTokens,
    estimatedContextWindowNeeded:
      finiteNumber(localModelReport.estimatedContextWindowNeeded) ?? p99,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalInputTokens,
    totalOutputTokens,
    totalPureComputeTokens,
    totalRequests: nullableSum(usages.map((usage) => usage.requestsCount)),
    repoAutomationComputeTps: allProviderComputeTps,
    repoAutomationPeakTps: allProviderComputeTps * 3,
    selectedScopeComputeTps: allProviderComputeTps,
    selectedScopePeakTps: allProviderComputeTps * 3,
    totalSessions: nullableSum(usages.map((usage) => usage.sessionsCount)),
    totalUncachedInputTokens
  };
}

function buildRouteClasses(
  usages: NormalizedProviderUsage[],
  workload: LocalInfrastructureWorkloadSummary,
  profiles: LocalModelProfile[]
): WorkloadRouteClass[] {
  const totalDailyCompute = Math.max(workload.dailyAvgComputeTokens, 1);
  const totalRequests = Math.max(workload.totalRequests ?? 0, 1);
  const profileIds = profiles.map((profile) => profile.hfRepoId);
  const shortCandidateModels = profileIds.filter((id) =>
    /qwen|llama/i.test(id)
  );
  const localCandidates =
    shortCandidateModels.length > 0
      ? shortCandidateModels
      : ["Qwen/Qwen2.5-Coder-14B-Instruct", "Qwen/Qwen2.5-7B-Instruct-1M"];

  return [
    routeClass({
      cacheReadTokensPerDay: dailyForProviders(usages, ["github-copilot"], "cacheReadTokens"),
      cloudFallbackModels: ["GitHub Copilot hosted", "Claude Sonnet", "GPT/Codex"],
      computeTokensPerDay:
        dailyComputeForProviders(usages, ["github-copilot"]) +
        dailyComputeForProviders(usages, ["cursor"]) * 0.35,
      description: "Autocomplete, issue edits, small file generation, and routine refactors.",
      id: "short_context_coding",
      latencySensitivity: "high",
      localCandidateModels: localCandidates.filter((id) => !id.includes("72B")),
      modelFamilies: familiesForProviders(usages, ["github-copilot", "cursor"]),
      name: "Short-context coding",
      providerIds: providersPresent(usages, ["github-copilot", "cursor"]),
      qualitySensitivity: "medium",
      reason:
        "Short-context candidate; route-specific context pending. Use for small blast-radius canary only after benchmarks.",
      recommendedRouting: "local",
      requestShareEstimate:
        requestsForProviders(usages, ["github-copilot", "cursor"]) / totalRequests,
      tokenShareEstimate: 0
    }, totalDailyCompute, workload),
    routeClass({
      cacheReadTokensPerDay:
        dailyForProviders(usages, ["claude-code"], "cacheReadTokens") +
        dailyForProviders(usages, ["codex", "cursor"], "cacheReadTokens") * 0.45,
      cloudFallbackModels: ["Claude Code", "OpenAI Codex", "Cursor Composer"],
      computeTokensPerDay:
        dailyComputeForProviders(usages, ["claude-code"]) +
        dailyComputeForProviders(usages, ["codex"]) * 0.45 +
        dailyComputeForProviders(usages, ["cursor"]) * 0.45,
      description: "Codex, Claude Code, and Cursor-style multi-step worker tasks.",
      id: "repo_agent_worker",
      latencySensitivity: "medium",
      localCandidateModels: localCandidates,
      modelFamilies: familiesForProviders(usages, ["claude-code", "codex", "cursor"]),
      name: "Repo agent worker",
      providerIds: providersPresent(usages, ["claude-code", "codex", "cursor"]),
      qualitySensitivity: "high",
      reason:
        "Candidate for local worker execution only after shadow benchmarks and with hosted reviewer fallback.",
      recommendedRouting: "hybrid",
      requestShareEstimate:
        requestsForProviders(usages, ["claude-code", "codex", "cursor"]) / totalRequests,
      tokenShareEstimate: 0
    }, totalDailyCompute, workload),
    routeClass({
      cacheReadTokensPerDay:
        dailyForProviders(usages, ["claude"], "cacheReadTokens") +
        dailyForProviders(usages, ["codex"], "cacheReadTokens") * 0.25,
      cloudFallbackModels: ["Claude Opus/Sonnet", "GPT/Codex reviewer"],
      computeTokensPerDay:
        dailyComputeForProviders(usages, ["claude"]) +
        dailyComputeForProviders(usages, ["codex"]) * 0.25,
      description: "Review, QA, security, architecture, and tool-use reviewer calls.",
      id: "repo_agent_reviewer",
      latencySensitivity: "medium",
      localCandidateModels: localCandidates.filter((id) => id.includes("72B") || id.includes("1M")),
      modelFamilies: familiesForProviders(usages, ["claude", "codex"]),
      name: "Repo agent reviewer",
      providerIds: providersPresent(usages, ["claude", "codex"]),
      qualitySensitivity: "high",
      reason:
        "Reviewer tasks carry higher quality and safety risk; keep a hosted reviewer until measured parity is proven.",
      recommendedRouting: "hybrid",
      requestShareEstimate: requestsForProviders(usages, ["claude", "codex"]) / totalRequests,
      tokenShareEstimate: 0
    }, totalDailyCompute, workload),
    routeClass({
      cacheReadTokensPerDay: workload.dailyAvgCacheReadTokens * 0.3,
      cloudFallbackModels: ["Claude long context", "OpenAI long context", "Cursor hosted"],
      computeTokensPerDay: workload.dailyAvgComputeTokens * 0.15,
      description: "p95/p99 sessions near the million-token context tail.",
      id: "long_context_tail",
      kind: "cross_cutting_overlay",
      overlapsWithRouteClassIds: [
        "short_context_coding",
        "repo_agent_worker",
        "repo_agent_reviewer"
      ],
      contextStatsSource: "global_fallback",
      contextStatsWarning:
        "long-context tail uses global p95/p99 distribution until route-specific tail samples are available",
      latencySensitivity: "low",
      localCandidateModels: localCandidates.filter((id) => id.includes("1M")),
      modelFamilies: ["long-context", "agentic", "large-repo"],
      name: "Long-context tail",
      providerIds: providersPresent(usages, ["claude", "claude-code", "codex", "cursor"]),
      qualitySensitivity: "high",
      reason:
        "Do not make tail-context workloads a first-server success criterion; they drive memory, cache residency, and quality risk.",
      recommendedRouting: "cloud",
      requestShareEstimate: 0.1,
      tokenShareEstimate: 0
    }, totalDailyCompute, workload),
    routeClass({
      cacheReadTokensPerDay: 0,
      cloudFallbackModels: ["OpenAI hosted realtime/transcription"],
      computeTokensPerDay: audioComputeDaily(usages),
      description: "Audio, realtime, and transcription tokens when provider telemetry exposes them.",
      id: "realtime_or_transcription",
      latencySensitivity: "high",
      localCandidateModels: [],
      modelFamilies: ["audio", "realtime", "transcription"],
      name: "Realtime or transcription",
      providerIds: providersPresent(usages, ["codex"]),
      qualitySensitivity: "medium",
      reason: "Keep in shadow-only until audio-specific quality, latency, and serving stack support are measured.",
      recommendedRouting: "shadow_only",
      requestShareEstimate: 0,
      tokenShareEstimate: 0
    }, totalDailyCompute, workload),
    routeClass({
      cacheReadTokensPerDay: dailyUnknownCache(usages),
      cloudFallbackModels: ["current hosted provider"],
      computeTokensPerDay: dailyUnknownCompute(usages),
      description: "Traffic with incomplete token, request, model, or source attribution.",
      id: "unknown_or_untrusted",
      latencySensitivity: "low",
      localCandidateModels: [],
      modelFamilies: ["unknown"],
      name: "Unknown or untrusted",
      providerIds: usages
        .filter((usage) => usage.requestsCount === null || usage.modelsUsed.length === 0)
        .map((usage) => usage.providerId),
      qualitySensitivity: "high",
      reason: "Incomplete telemetry should not drive local production routing.",
      recommendedRouting: "shadow_only",
      requestShareEstimate: 0,
      tokenShareEstimate: 0
    }, totalDailyCompute, workload)
  ];
}

function routeClass(
  route: Omit<
    WorkloadRouteClass,
    | "contextRequirementTokens"
    | "contextStatsSource"
    | "contextStatsWarning"
    | "kind"
    | "overlapsWithRouteClassIds"
    | "peakTokensPerSecond"
  > &
    Partial<
      Pick<
        WorkloadRouteClass,
        "contextStatsSource" | "contextStatsWarning" | "kind" | "overlapsWithRouteClassIds"
      >
    >,
  totalDailyCompute: number,
  workload: LocalInfrastructureWorkloadSummary
): WorkloadRouteClass {
  const tokenShareEstimate = clamp01(route.computeTokensPerDay / totalDailyCompute);
  const kind = route.kind ?? "additive_workload";
  const contextStatsSource = route.contextStatsSource ?? "global_fallback";
  const shouldShowGlobalContext = route.id === "long_context_tail";
  return {
    ...route,
    contextRequirementTokens: {
      max: shouldShowGlobalContext ? workload.currentProjectLaneMaxContext : null,
      p50: shouldShowGlobalContext ? workload.currentProjectLaneP50Context : null,
      p95: shouldShowGlobalContext ? workload.currentProjectLaneP95Context : null,
      p99: shouldShowGlobalContext ? workload.currentProjectLaneP99Context : null
    },
    contextStatsSource,
    contextStatsWarning:
      route.contextStatsWarning ??
      (contextStatsSource === "global_fallback"
        ? "short-context candidate; route-specific context pending"
        : undefined),
    kind,
    overlapsWithRouteClassIds: route.overlapsWithRouteClassIds ?? [],
    peakTokensPerSecond:
      Math.max(route.computeTokensPerDay / ACTIVE_SECONDS_PER_DAY, 0) *
      routePeakMultiplier(route.recommendedRouting),
    requestShareEstimate: clamp01(route.requestShareEstimate),
    tokenShareEstimate
  };
}

function buildMigrationPolicy(
  override: Partial<MigrationPolicy> | undefined,
  budgetLowUsd: number,
  budgetHighUsd: number
): MigrationPolicy {
  return {
    budgetHighUsd,
    budgetLowUsd,
    cloudFallbackRequiredFor: ["long_context_tail", "unknown_or_untrusted"],
    initialProductionCoveragePct: 10,
    requireBenchmarksBeforeProductionRouting: true,
    targetFirstServerCoveragePct: DEFAULT_LOCAL_COVERAGE_PCT,
    ...override
  };
}

function buildLocalMigrationPlan(
  routeClasses: WorkloadRouteClass[],
  migrationPolicy: MigrationPolicy
): LocalMigrationPlan {
  const safeLocalWorkloadIds = routeClasses
    .filter((route) => route.recommendedRouting === "local" || route.recommendedRouting === "hybrid")
    .map((route) => route.id);
  const cloudGuardrailWorkloadIds = routeClasses
    .filter((route) => route.recommendedRouting === "cloud" || route.recommendedRouting === "shadow_only")
    .map((route) => route.id);

  return {
    candidateServerLocalCoveragePct: migrationPolicy.targetFirstServerCoveragePct,
    cloudGuardrailWorkloadIds,
    fullLocalReplacementRecommended: false,
    migrationPolicy,
    phases: [
      {
        phase: "cloud_baseline",
        name: "Phase 0 - cloud baseline only",
        targetLocalCoveragePct: 0,
        recommendedRouting: "All production traffic remains on hosted providers.",
        entryCriteria: ["Current provider snapshots loaded", "refresh job emits data quality warnings"],
        exitCriteria: ["Baseline quality, latency, and cost recorded"]
      },
      {
        phase: "local_shadow",
        name: "Phase 1 - local shadow mode",
        targetLocalCoveragePct: 0,
        recommendedRouting: "Replay and shadow only; local output does not make production decisions.",
        entryCriteria: ["First server commissioned", "benchmark capture schema populated"],
        exitCriteria: ["Shadow quality and p95/p99 latency reviewed"]
      },
      {
        phase: "short_context_canary",
        name: "Phase 2 - canary low-risk short-context tasks",
        targetLocalCoveragePct: 10,
        recommendedRouting: "Short-context coding tasks canary locally with hosted fallback.",
        entryCriteria: ["Shadow benchmarks pass low-risk acceptance checks"],
        exitCriteria: ["Canary error budget met across realistic repo tasks"]
      },
      {
        phase: "local_worker_cloud_reviewer",
        name: "Phase 3 - local worker with cloud reviewer",
        targetLocalCoveragePct: 30,
        recommendedRouting: "Local worker drafts; hosted reviewer verifies high-risk outputs.",
        entryCriteria: ["Canary stable", "reviewer agreement threshold met"],
        exitCriteria: ["Local worker quality stable with hosted reviewer guardrail"]
      },
      {
        phase: "safe_local_worker_and_reviewer",
        name: "Phase 4 - local worker plus local reviewer for safe classes",
        targetLocalCoveragePct: 60,
        recommendedRouting: "Local worker and reviewer for safe classes only.",
        entryCriteria: ["Local reviewer parity proven on safe classes"],
        exitCriteria: ["Cloud fallback remains healthy under induced local failures"]
      },
      {
        phase: "cloud_fallback_tail",
        name: "Phase 5 - cloud fallback for tail-context and high-risk tasks",
        targetLocalCoveragePct: 60,
        recommendedRouting: "Long-context, unknown, and high-risk tasks stay hosted unless benchmarks prove otherwise.",
        entryCriteria: ["Route classifier enforced at dispatch boundary"],
        exitCriteria: ["Tail routing exceptions are explicit and audited"]
      }
    ],
    safeLocalWorkloadIds,
    summary:
      "Do not pursue full local replacement on the first server; use a tiered migration with hosted guardrails."
  };
}

function buildCapacityEstimates(
  profile: HardwareProfile,
  workload: LocalInfrastructureWorkloadSummary,
  localProfiles: LocalModelProfile[]
): HardwareCapacityEstimate[] {
  const modelProfiles =
    localProfiles.length > 0
      ? localProfiles
      : [
          {
            contextWindow: workload.estimatedContextWindowNeeded ?? 131_072,
            hfRepoId: "local-route-class-benchmark",
            quantization: "benchmark-required",
            vramGbMin: 96
          }
        ];
  return modelProfiles.slice(0, 3).map((model) => {
    const aggregateTps = aggregateTpsEstimate(profile);
    const contextTokens = workload.estimatedContextWindowNeeded ?? model.contextWindow;
    const contextFit = contextFitEstimate(profile, contextTokens);
    const memoryFit = profile.totalVramGb >= Math.max(model.vramGbMin, 48);
    const throughputFit =
      aggregateTps !== null &&
      aggregateTps >= workload.allProviderComputeTps * 0.3;
    const estimatedProjectLaneCapacity =
      aggregateTps === null || workload.allProviderComputeTps <= 0
        ? null
        : round2(aggregateTps / workload.allProviderComputeTps);

    return {
      bottlenecks: capacityBottlenecks(profile, contextFit, throughputFit, memoryFit),
      confidence: "derived_estimate",
      contextFit,
      contextTokens,
      estimatedAggregateTokensPerSecond: aggregateTps,
      estimatedConcurrentRequests:
        aggregateTps === null ? null : Math.max(1, Math.floor(aggregateTps / 30)),
      estimatedProjectLaneCapacity,
      estimatedTokensPerSecondPerGpu:
        aggregateTps === null || profile.gpuCount <= 0
          ? null
          : round2(aggregateTps / profile.gpuCount),
      hardwareProfileId: profile.id,
      memoryFit,
      modelId: model.hfRepoId,
      quantization: model.quantization,
      throughputFit
    };
  });
}

function recommendationFromProfile(input: {
  candidateServerLocalCoveragePct: number;
  kind: FirstServerRecommendationKind;
  profile: HardwareProfile;
  workload: LocalInfrastructureWorkloadSummary;
}): FirstServerRecommendation {
  const routeCapacity = [
    {
      routeClassId: "short_context_coding",
      estimatedProjectLaneCapacity: routeCapacityEstimate(input.profile, input.workload, 0.35),
      routing: "local" as const
    },
    {
      routeClassId: "repo_agent_worker",
      estimatedProjectLaneCapacity: routeCapacityEstimate(input.profile, input.workload, 0.6),
      routing: "hybrid" as const
    },
    {
      routeClassId: "repo_agent_reviewer",
      estimatedProjectLaneCapacity: routeCapacityEstimate(input.profile, input.workload, 0.25),
      routing: "hybrid" as const
    },
    {
      routeClassId: "full_p99_workload",
      estimatedProjectLaneCapacity: 0,
      routing: "cloud" as const
    },
    {
      routeClassId: "after_context_compaction_and_cloud_fallback",
      estimatedProjectLaneCapacity: routeCapacityEstimate(input.profile, input.workload, 1),
      routing: "hybrid" as const
    }
  ];

  return {
    budgetFit: budgetFit(input.profile),
    candidateServerLocalCoveragePct: input.candidateServerLocalCoveragePct,
    capacityEstimates: buildCapacityEstimates(input.profile, input.workload, []),
    dataToCollectBeforePurchase: dataToCollectBeforePurchase(),
    estimatedProjectLaneCapacityByRouteClass: routeCapacity,
    facilitiesPrerequisites: input.profile.facilitiesNotes,
    fullLocalReplacementRecommended: false,
    hardwareProfileId: input.profile.id,
    profileName:
      input.kind === "preferred_first_quote"
        ? "Preferred first quote: dual RTX PRO 6000 for strict budget; quad RTX PRO 6000 if quote fits budget or financing is approved"
        : input.profile.profileName,
    rationale: [
      "Fits the first-server intent: partial migration, shadow benchmarks, and controlled canary routing.",
      "Keeps hosted reviewer and tail-context fallback in the plan instead of treating the first server as a full replacement.",
      "Requires a vendor quote and facilities validation before purchase."
    ],
    recommendationKind: input.kind,
    routingRecommendation:
      "Use for partial local migration only. Preferred operational path: cloud baseline -> local shadow -> 5%-10% canary -> local worker with cloud reviewer -> expand after measured benchmark evidence."
  };
}

function doNotBuyRecommendation(input: RecommendFirstServerInput): FirstServerRecommendation {
  return {
    budgetFit: "unknown",
    candidateServerLocalCoveragePct: 0,
    capacityEstimates: [],
    dataToCollectBeforePurchase: dataToCollectBeforePurchase(),
    estimatedProjectLaneCapacityByRouteClass: [],
    facilitiesPrerequisites: ["Collect vendor quotes before committing capex."],
    fullLocalReplacementRecommended: false,
    hardwareProfileId: null,
    profileName: "Do not buy yet",
    rationale: [
      `No quoteable floor/pilot profile fit the $${input.budgetLowUsd.toLocaleString()}-$${input.budgetHighUsd.toLocaleString()} target.`,
      "Continue with hosted providers and collect benchmark data."
    ],
    recommendationKind: "do_not_buy_yet",
    routingRecommendation: "Keep all production traffic hosted until a quoteable profile is selected."
  };
}

function buildAlternativeFirstServers(
  hardwareProfiles: HardwareProfile[],
  workload: LocalInfrastructureWorkloadSummary,
  migrationPolicy: MigrationPolicy,
  recommendedId: string | null
): FirstServerRecommendation[] {
  const candidateIds = [
    "floor_proto_dual_rtxpro6000_blackwell_server",
    "floor_proto_custom_wrx90_quad_rtxpro6000_maxq",
    "budget_l40s_or_rtx6000ada_pcie",
    "production_8x_rtxpro6000_blackwell_server",
    "production_node_hgx_h200_b200_8gpu",
    "rack_scale_gb200_nvl72"
  ];
  return candidateIds
    .filter((id) => id !== recommendedId)
    .map((id) => hardwareProfiles.find((profile) => profile.id === id))
    .filter((profile): profile is HardwareProfile => profile !== undefined)
    .map((profile) =>
      recommendationFromProfile({
        candidateServerLocalCoveragePct:
          profile.phase === "production_node" || profile.phase === "rack_scale"
            ? 0
            : migrationPolicy.targetFirstServerCoveragePct,
        kind:
          profile.phase === "production_node" || profile.phase === "rack_scale"
            ? "scale_only_candidate"
            : profile.id === "budget_l40s_or_rtx6000ada_pcie"
              ? "lower_cost_fallback_quote"
              : "preferred_first_quote",
        profile,
        workload
      })
    );
}

function buildProcurementChecklist(profile: HardwareProfile | null): string[] {
  if (!profile) return ["Select a quoteable hardware profile before issuing an RFQ."];

  return [
    `Quote ${profile.gpuCount} x ${profile.gpuType}; verify these are server/datacenter-valid SKUs.`,
    `Confirm form factor ${profile.formFactor} and rack units ${profile.rackUnits ?? "floor/non-rack"}.`,
    `Confirm power feeds and sustained system draw around ${profile.estimatedSystemPowerKw ?? "unknown"} kW.`,
    `Confirm cooling path: ${profile.cooling}.`,
    "Confirm server depth and rack compatibility, including rails if rack-mounted.",
    `Specify at least ${profile.systemRamGb} GB RAM and ${profile.nvmeTb} TB NVMe.`,
    `Specify network: ${profile.network.join(", ") || "quote required"}.`,
    `Confirm Ubuntu support: ${profile.os.join(", ") || "vendor-supported Linux required"}.`,
    "Confirm NVIDIA AI Enterprise, CUDA, driver, vLLM, and TensorRT-LLM support.",
    "Confirm remote management, firmware update path, and telemetry export.",
    "Request next-business-day or 4-hour support options.",
    "Request delivery lead time, return/restocking policy, and financing or leasing options.",
    "Ask for quote validity date and replacement-part availability.",
    "Confirm MIG support where applicable.",
    `Confirm interconnect: ${profile.interconnect}; NVLink/NVSwitch present: ${profile.nvlink ? "yes" : "no"}.`,
    "Ask whether validated vLLM/TensorRT-LLM configs exist for this exact server."
  ];
}

function buildBenchmarkPlan(): BenchmarkPlan {
  return {
    benchmarkDataPath: "public/data/benchmarks/local-hardware/latest.json",
    comparisons: [
      "local worker plus cloud reviewer vs cloud worker plus cloud reviewer",
      "local shadow response vs current Codex/Claude Code response",
      "short-context canary vs hosted baseline for accepted diffs",
      "tail-context hosted fallback vs attempted local long-context run"
    ],
    confidenceUpgradeCriteria: [
      "Measured p95 latency and quality deltas available for each route class",
      "At least one week of shadow traffic captured",
      "Cloud fallback tested under local failure",
      "Reviewer acceptance and PR acceptance rates meet operator thresholds"
    ],
    manualCaptureSchema: {
      batchSize: "number",
      concurrency: "number",
      contextTokens: "number",
      gpuUtilizationPct: "number",
      hardwareProfileId: "string",
      modelId: "string",
      p50LatencyMs: "number",
      p95LatencyMs: "number",
      p99LatencyMs: "number",
      quantization: "string",
      servingStack: "string",
      tokensPerSecond: "number",
      ttftMs: "number",
      vramUsedGb: "number"
    },
    replaySources: [
      "~/.codex archived sessions, anonymized",
      "~/.claude/projects sessions, anonymized",
      "current bridge-backed forensic reviewer prompts",
      "refresh-triggered provider workload samples"
    ],
    requiredMeasurements: [
      "TTFT",
      "tokens/sec",
      "p50/p95/p99 latency",
      "success rate",
      "diff quality",
      "PR acceptance",
      "tool-call correctness",
      "GPU utilization",
      "VRAM used",
      "context tokens",
      "batch size",
      "concurrency"
    ],
    summary:
      "Replay anonymized local prompts and shadow current provider requests before redirecting production traffic."
  };
}

function buildAssumptions(forensicRun: LocalInfrastructureForensicRun | null): string[] {
  return [
    "One current Repo Automation workload is treated as 1.0 project lane.",
    "Cache reads are excluded from pure compute tokens but included as local KV-cache residency and memory pressure.",
    "First-server routing is intentionally partial and reversible.",
    "All hardware pricing remains quote-required until vendor quotes are attached.",
    "Capacity estimates are derived until benchmark files are imported.",
    forensicRun?.runId
      ? `Forensic run ${forensicRun.runId} informs routing confidence but does not override raw token math.`
      : "No forensic run was available; routing confidence is reduced."
  ];
}

function buildDataQualityWarnings(
  normalized: NormalizedProviderUsage[],
  summaries: ProviderReportSummary[]
): string[] {
  const warnings: string[] = [];
  for (const summary of summaries) {
    if (summary.providerId === "github-copilot") {
      const cliOutput = numberField(summary, "cliOutputTokens");
      const genericOutput = numberField(summary, "outputTokens");
      if (cliOutput > 0 && genericOutput === 0) {
        warnings.push(
          "GitHub Copilot output reconciled from cliOutputTokens because generic outputTokens was absent or zero."
        );
      }
    }
  }

  const distinctWindows = Array.from(
    new Set(normalized.map((usage) => usage.windowDays).filter((value) => value !== null))
  );
  if (distinctWindows.length > 1) {
    warnings.push(
      "Provider coverage windows differ; sizing uses each provider's own window instead of labeling every row aggregate-28-day."
    );
  }

  for (const usage of normalized) {
    if (pureComputeTokens(usage) > 0 && usage.requestsCount === null) {
      warnings.push(
        `${usage.providerName} has token telemetry but no request count; context and lane math use available local session distribution.`
      );
    }
    if (usage.modelsUsed.length === 0) {
      warnings.push(
        `${usage.providerName} did not expose model-level telemetry for this refresh.`
      );
    }
  }

  return Array.from(new Set(warnings));
}

function buildReportWarnings(
  baseWarnings: string[],
  providerCoverage: NormalizedProviderUsage[],
  coverage: LocalCoverageSummary,
  hardwareProfiles: HardwareProfile[]
): string[] {
  const warnings = [...baseWarnings];
  warnings.push(
    "Route-specific context distributions are not yet available; global p99 context is used as fallback."
  );
  warnings.push(
    "Token-share classes include cross-cutting overlays; do not sum overlay percentages as total workload."
  );
  if (providerCoverage.some((provider) => provider.providerId === "github-copilot")) {
    warnings.push(
      "GitHub Copilot CLI dominates token volume and may not be economically displaced unless seat count or provider usage changes."
    );
  }
  warnings.push(
    "First-server recommendation is for controlled migration and measurement, not full workload replacement."
  );
  if (hardwareProfiles.some((profile) => profile.gpuType.includes("RTX PRO 6000"))) {
    warnings.push(
      "All RTX PRO 6000 pricing and 4-GPU server configurations require vendor quotes."
    );
  }
  if (coverage.estimatedFullWorkloadCapacityPct < coverage.targetFirstServerCoveragePct) {
    warnings.push(
      "Target coverage exceeds derived server capacity; treat target as migration objective, not current server capability."
    );
  }
  return Array.from(new Set(warnings));
}

function buildLocalCoverageSummary(
  recommendation: FirstServerRecommendation,
  migrationPolicy: MigrationPolicy,
  workload: LocalInfrastructureWorkloadSummary
): LocalCoverageSummary {
  const aggregateTps =
    recommendation.capacityEstimates.find(
      (estimate) => estimate.estimatedAggregateTokensPerSecond !== null
    )?.estimatedAggregateTokensPerSecond ?? null;
  const estimatedFullWorkloadCapacityPct =
    aggregateTps !== null && workload.allProviderComputeTps > 0
      ? round2((aggregateTps / workload.allProviderComputeTps) * 100)
      : 0;
  const safeInitialProductionRoutingPct = Math.min(
    10,
    Math.max(5, recommendation.capacityEstimates[0]?.estimatedProjectLaneCapacity ? 10 : 5)
  );
  const capacityLimitedBy = Array.from(
    new Set(recommendation.capacityEstimates.flatMap((estimate) => estimate.bottlenecks))
  );
  const target = migrationPolicy.targetFirstServerCoveragePct;
  const explanation =
    estimatedFullWorkloadCapacityPct < target
      ? "Target coverage exceeds derived server capacity; treat target as migration objective, not current server capability."
      : "Derived server capacity meets or exceeds the first-server target, but production routing remains benchmark-gated.";

  return {
    canaryCoveragePct: safeInitialProductionRoutingPct,
    capacityLimitedBy,
    estimatedFullWorkloadCapacityPct,
    explanation,
    safeInitialProductionRoutingPct,
    shadowCoveragePct: 100,
    targetFirstServerCoveragePct: target
  };
}

function buildWorkloadScopeSummaries(
  usages: NormalizedProviderUsage[],
  routeClasses: WorkloadRouteClass[],
  workload: LocalInfrastructureWorkloadSummary
): WorkloadScopeSummary[] {
  const routeById = new Map(routeClasses.map((route) => [route.id, route]));
  const allContext = {
    max: workload.currentProjectLaneMaxContext,
    p50: workload.currentProjectLaneP50Context,
    p95: workload.currentProjectLaneP95Context,
    p99: workload.currentProjectLaneP99Context
  };
  const repoRouteClassIds = ["repo_agent_worker", "repo_agent_reviewer", "long_context_tail"];
  const repoContext = contextForRouteClasses(routeClasses, repoRouteClassIds);
  const repoCompute =
    (routeById.get("repo_agent_worker")?.computeTokensPerDay ?? 0) +
    (routeById.get("repo_agent_reviewer")?.computeTokensPerDay ?? 0);

  return [
    scopeSummary({
      computeTokensPerDay: workload.dailyAvgComputeTokens,
      context: allContext,
      label: "All-provider traffic sizing",
      notes: ["Useful for total hardware stress, but not the default project-lane definition."],
      providerIds: usages.map((usage) => usage.providerId),
      routeClassIds: routeClasses.map((route) => route.id),
      scope: "all_provider_traffic"
    }),
    scopeSummary({
      computeTokensPerDay: repoCompute,
      context: repoContext,
      label: "Repo Automation project-lane sizing",
      notes: [
        "Default sizing scope. Copilot CLI volume is reported separately so it does not define one project lane by itself.",
        "Context requirement is derived from repo route classes and includes the global long-context tail fallback until route-specific tail samples exist."
      ],
      providerIds: ["claude-code", "codex", "claude", "cursor"],
      routeClassIds: repoRouteClassIds,
      scope: "repo_automation_project"
    }),
    scopeSummary({
      computeTokensPerDay: dailyComputeForProviders(usages, ["github-copilot"]),
      context: { max: null, p50: null, p95: null, p99: null },
      label: "Copilot CLI-specific sizing",
      notes: ["CLI token telemetry is valuable stress data but may not be economically displaced without seat changes."],
      providerIds: ["github-copilot"],
      routeClassIds: ["short_context_coding"],
      scope: "copilot_cli"
    }),
    scopeSummary({
      computeTokensPerDay: routeById.get("repo_agent_worker")?.computeTokensPerDay ?? 0,
      context: { max: null, p50: null, p95: null, p99: null },
      label: "Agentic worker sizing",
      notes: ["Local worker routing requires cloud reviewer fallback until benchmarks pass."],
      providerIds: ["claude-code", "codex", "cursor"],
      routeClassIds: ["repo_agent_worker"],
      scope: "agentic_worker"
    }),
    scopeSummary({
      computeTokensPerDay: routeById.get("repo_agent_reviewer")?.computeTokensPerDay ?? 0,
      context: { max: null, p50: null, p95: null, p99: null },
      label: "Reviewer sizing",
      notes: ["Reviewer quality and security sensitivity keep hosted fallback mandatory initially."],
      providerIds: ["claude", "codex"],
      routeClassIds: ["repo_agent_reviewer"],
      scope: "reviewer"
    })
  ];
}

function contextForRouteClasses(
  routeClasses: WorkloadRouteClass[],
  routeClassIds: string[]
): WorkloadScopeSummary["contextRequirementTokens"] {
  const selectedRoutes = routeClasses.filter((route) => routeClassIds.includes(route.id));
  return {
    max: maxNullable(selectedRoutes.map((route) => route.contextRequirementTokens.max)),
    p50: maxNullable(selectedRoutes.map((route) => route.contextRequirementTokens.p50)),
    p95: maxNullable(selectedRoutes.map((route) => route.contextRequirementTokens.p95)),
    p99: maxNullable(selectedRoutes.map((route) => route.contextRequirementTokens.p99))
  };
}

function scopeSummary(input: {
  computeTokensPerDay: number;
  context: WorkloadScopeSummary["contextRequirementTokens"];
  label: string;
  notes: string[];
  providerIds: string[];
  routeClassIds: string[];
  scope: WorkloadScope;
}): WorkloadScopeSummary {
  const currentProjectLaneComputeTps = input.computeTokensPerDay / ACTIVE_SECONDS_PER_DAY;
  return {
    computeTokensPerDay: input.computeTokensPerDay,
    contextRequirementTokens: input.context,
    currentProjectLaneComputeTps,
    label: input.label,
    notes: input.notes,
    peakTokensPerSecond: currentProjectLaneComputeTps * 3,
    providerIds: input.providerIds,
    routeClassIds: input.routeClassIds,
    scope: input.scope
  };
}

function applySelectedWorkloadScope(
  workload: LocalInfrastructureWorkloadSummary,
  scopes: WorkloadScopeSummary[],
  selectedScope: WorkloadScope
): LocalInfrastructureWorkloadSummary {
  const scopeById = new Map(scopes.map((scope) => [scope.scope, scope]));
  const selected = scopeById.get(selectedScope);
  const repoAutomation = scopeById.get("repo_automation_project");

  return {
    ...workload,
    repoAutomationComputeTps:
      repoAutomation?.currentProjectLaneComputeTps ?? workload.allProviderComputeTps,
    repoAutomationPeakTps:
      repoAutomation?.peakTokensPerSecond ?? workload.allProviderPeakTps,
    selectedScopeComputeTps:
      selected?.currentProjectLaneComputeTps ?? workload.allProviderComputeTps,
    selectedScopePeakTps:
      selected?.peakTokensPerSecond ?? workload.allProviderPeakTps
  };
}

function buildHardwareBudgetSummary(input: {
  budgetHighUsd: number;
  providerCoverage: NormalizedProviderUsage[];
  scenarios: HardwareBudgetScenario[];
  selectedScope: WorkloadScope;
}): HardwareBudgetSummary {
  const budgetLabel = formatBudgetUsd(input.budgetHighUsd);
  return {
    cfoSummaryLines: [
      firstServerBudgetLine(input.scenarios, input.budgetHighUsd),
      allProviderSteadyBudgetLine(input.scenarios, input.budgetHighUsd),
      `For Repo Automation project-lane only, the ${budgetLabel} server may be sufficient for initial local worker testing, but full p99 replacement remains blocked by context, quality, and benchmark gates.`,
      planningEnvelopeLine(
        input.scenarios,
        "steady_state_replacement",
        "production-pod planning"
      ),
      planningEnvelopeLine(
        input.scenarios,
        "peak_safe_replacement",
        "expansion"
      ),
      "NVL72-class rack scale should be tied to sold reserved-capacity product demand, not internal provider displacement alone."
    ],
    copilotDominanceWarning: copilotBudgetWarning(input.providerCoverage),
    selectedScope: input.selectedScope
  };
}

function buildHardwareBudgetScenarios(
  profiles: HardwareProfile[],
  workload: LocalInfrastructureWorkloadSummary,
  scopes: WorkloadScopeSummary[],
  productionRoutingBlocked: boolean,
  budgetHighUsd: number
): HardwareBudgetScenario[] {
  const preferredProfile = selectPreferredBudgetProfile(profiles);
  const rackProfile = selectRackScaleBudgetProfile(profiles, preferredProfile);
  const budgetLabel = formatBudgetUsd(budgetHighUsd);

  return [
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      explanation: `${capexRange(
        preferredProfile
      )} is enough for first-server shadow/canary and benchmark collection.`,
      fullReplacementAllowed: false,
      goal: "safe_canary",
      profile: preferredProfile,
      scope: "repo_automation_project",
      scopes,
      targetTokensPerSecond: workload.repoAutomationComputeTps
    }),
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      explanation: `For Repo Automation project-lane only, the ${budgetLabel} server may be sufficient for initial local worker testing, but full p99 replacement remains blocked by context, quality, and benchmark gates.`,
      fullReplacementAllowed:
        !productionRoutingBlocked && preferredProfile.fullProjectLaneClaimAllowed,
      goal: "steady_state_replacement",
      profile: preferredProfile,
      scope: "repo_automation_project",
      scopes,
      targetTokensPerSecond: workload.repoAutomationComputeTps
    }),
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      explanation:
        "Repo Automation peak-safe replacement requires at least two first-server-class nodes before benchmark gates and cloud fallback can be relaxed.",
      fullReplacementAllowed: false,
      goal: "peak_safe_replacement",
      profile: preferredProfile,
      scope: "repo_automation_project",
      scopes,
      targetTokensPerSecond: workload.repoAutomationPeakTps
    }),
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      explanation: `Treat ${budgetLabel} as first-server budget only, not all-provider replacement authority. Use the computed all-provider steady-state scenario for the production-pod planning envelope.`,
      fullReplacementAllowed: false,
      goal: "steady_state_replacement",
      profile: preferredProfile,
      scope: "all_provider_traffic",
      scopes,
      targetTokensPerSecond: workload.allProviderComputeTps
    }),
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      explanation:
        "Use the computed all-provider peak-safe scenario for the expansion envelope.",
      fullReplacementAllowed: false,
      goal: "peak_safe_replacement",
      profile: preferredProfile,
      scope: "all_provider_traffic",
      scopes,
      targetTokensPerSecond: workload.allProviderPeakTps
    }),
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      explanation:
        "Copilot CLI-specific replacement is a separate economic decision because seat-based Copilot volume dominates all-provider traffic.",
      fullReplacementAllowed: false,
      goal: "steady_state_replacement",
      profile: preferredProfile,
      scope: "copilot_cli",
      scopes,
      targetTokensPerSecond: scopeTps(scopes, "copilot_cli", workload.allProviderComputeTps)
    }),
    hardwareBudgetScenario({
      cloudFallbackRequired: true,
      confidence: "quote_required",
      explanation:
        "NVL72-class rack scale should be tied to sold reserved-capacity product demand, not internal provider displacement alone. p99 full replacement remains blocked by context, quality, and benchmark gates.",
      fullReplacementAllowed: false,
      goal: "p99_full_replacement",
      profile: rackProfile,
      scope: "all_provider_traffic",
      scopes,
      targetTokensPerSecond: workload.allProviderPeakTps
    })
  ];
}

function firstServerBudgetLine(
  scenarios: HardwareBudgetScenario[],
  budgetHighUsd: number
): string {
  const budgetLabel = formatBudgetUsd(budgetHighUsd);
  const safeCanary = scenarios.find(
    (scenario) =>
      scenario.scope === "repo_automation_project" &&
      scenario.replacementGoal === "safe_canary"
  );
  if (!safeCanary) {
    return "First-server shadow/canary budget fit is unknown until hardware profiles are selected.";
  }
  if (safeCanary.estimatedCapexHighUsd === null) {
    return `${budgetLabel} first-server shadow/canary fit requires a vendor quote before approval.`;
  }
  if (safeCanary.estimatedCapexHighUsd <= budgetHighUsd) {
    return `${budgetLabel} is enough for first-server shadow/canary and benchmark collection.`;
  }
  return `${budgetLabel} is not enough for first-server shadow/canary with the selected hardware profile.`;
}

function allProviderSteadyBudgetLine(
  scenarios: HardwareBudgetScenario[],
  budgetHighUsd: number
): string {
  const budgetLabel = formatBudgetUsd(budgetHighUsd);
  const steadyState = scenarios.find(
    (scenario) =>
      scenario.scope === "all_provider_traffic" &&
      scenario.replacementGoal === "steady_state_replacement"
  );
  if (!steadyState) return "All-provider replacement budget fit is unknown.";
  if (steadyState.estimatedCapexHighUsd === null) {
    return `${budgetLabel} all-provider replacement fit requires a vendor quote before approval.`;
  }
  if (steadyState.estimatedCapexHighUsd <= budgetHighUsd) {
    return `${budgetLabel} appears enough for all-provider steady-state replacement under the selected workload.`;
  }
  return `${budgetLabel} is not enough for all-provider replacement.`;
}

function planningEnvelopeLine(
  scenarios: HardwareBudgetScenario[],
  goal: HardwareReplacementGoal,
  envelopeKind: string
): string {
  const scenario = scenarios.find(
    (candidate) =>
      candidate.scope === "all_provider_traffic" &&
      candidate.replacementGoal === goal
  );
  const goalLabel =
    goal === "steady_state_replacement" ? "steady-state replacement" : "peak-safe replacement";
  if (!scenario || scenario.estimatedCapexLowUsd === null || scenario.estimatedCapexHighUsd === null) {
    return `For all-provider ${goalLabel}, request a vendor quote before setting the ${envelopeKind} envelope.`;
  }
  return `For all-provider ${goalLabel}, create a ${formatBudgetRange(
    scenario.estimatedCapexLowUsd,
    scenario.estimatedCapexHighUsd
  )} ${envelopeKind} envelope.`;
}

function copilotBudgetWarning(providerCoverage: NormalizedProviderUsage[]): string {
  const totalComputeTokens = sum(providerCoverage.map((provider) => pureComputeTokens(provider)));
  const copilotComputeTokens = sum(
    providerCoverage
      .filter((provider) => provider.providerId === "github-copilot")
      .map((provider) => pureComputeTokens(provider))
  );
  if (totalComputeTokens <= 0 || copilotComputeTokens <= 0) {
    return "GitHub Copilot CLI token telemetry is not present in this sizing window; budget guidance is based on observed providers only.";
  }

  const copilotShare = copilotComputeTokens / totalComputeTokens;
  if (copilotShare >= 0.5) {
    return "GitHub Copilot CLI dominates all-provider token volume. Do not let Copilot CLI define the Repo Automation project-lane budget unless the user explicitly selects all-provider or Copilot CLI replacement.";
  }

  return `GitHub Copilot CLI represents ${Math.round(
    copilotShare * 100
  )}% of observed compute tokens; budget guidance should follow the selected workload scope.`;
}

function selectPreferredBudgetProfile(profiles: HardwareProfile[]): HardwareProfile {
  return (
    profiles.find((profile) => profile.id === "preferred_quad_rtxpro6000_blackwell_server") ??
    profiles.find(
      (profile) => profile.quotePriority === "quote_now" && profile.firstServerRole === "worker_pool"
    ) ??
    profiles.find(
      (profile) => profile.quotePriority === "quote_now" && isQuoteableFloorOrPilot(profile)
    ) ??
    profiles.find((profile) => isQuoteableFloorOrPilot(profile)) ??
    profiles.find((profile) => profile.estimatedCapexHighUsd !== null) ??
    profiles[0] ??
    fallbackPreferredBudgetProfile()
  );
}

function selectRackScaleBudgetProfile(
  profiles: HardwareProfile[],
  preferredProfile: HardwareProfile
): HardwareProfile {
  return (
    profiles.find((profile) => profile.id === "rack_scale_gb200_nvl72") ??
    profiles.find(
      (profile) => profile.phase === "rack_scale" || profile.firstServerRole === "rack_scale"
    ) ??
    preferredProfile
  );
}

function fallbackPreferredBudgetProfile(): HardwareProfile {
  const fallback =
    HARDWARE_PROFILES.find(
      (profile) => profile.id === "preferred_quad_rtxpro6000_blackwell_server"
    ) ?? HARDWARE_PROFILES[0];
  if (!fallback) throw new Error("No hardware profiles are available for budget planning.");
  return fallback;
}

function hardwareBudgetScenario(input: {
  cloudFallbackRequired: boolean;
  confidence?: HardwareBudgetConfidence;
  explanation: string;
  fullReplacementAllowed: boolean;
  goal: HardwareReplacementGoal;
  profile: HardwareProfile;
  scope: WorkloadScope;
  scopes: WorkloadScopeSummary[];
  targetTokensPerSecond: number;
}): HardwareBudgetScenario {
  const estimatedNodeThroughputTps = aggregateTpsEstimate(input.profile);
  const requiredNodes =
    input.targetTokensPerSecond <= 0
      ? 0
      : estimatedNodeThroughputTps === null || estimatedNodeThroughputTps <= 0
      ? null
      : Math.max(1, Math.ceil(input.targetTokensPerSecond / estimatedNodeThroughputTps));
  const requiredGpuCount =
    requiredNodes === null ? null : requiredNodes * input.profile.gpuCount;
  const capexLow = multiplyNullable(input.profile.estimatedCapexLowUsd, requiredNodes);
  const capexHigh = multiplyNullable(input.profile.estimatedCapexHighUsd, requiredNodes);
  const requiredContextTokens = requiredContextForScope(input.scopes, input.scope);

  return {
    cloudFallbackRequired: input.cloudFallbackRequired,
    confidence: input.confidence ?? "derived_estimate",
    estimatedAnnualOpexUsd: estimateAnnualOpex(input.profile, requiredNodes, capexHigh),
    estimatedCapexHighUsd: capexHigh,
    estimatedCapexLowUsd: capexLow,
    estimatedNodeThroughputTps,
    estimatedSystemPowerKw: multiplyNullable(input.profile.estimatedSystemPowerKw, requiredNodes),
    explanation: input.explanation,
    fullReplacementAllowed: input.fullReplacementAllowed,
    hardwareProfileId: input.profile.id,
    hardwareProfileName: input.profile.profileName,
    rackUnitsRequired: multiplyNullable(input.profile.rackUnits, requiredNodes),
    replacementGoal: input.goal,
    requiredContextTokens,
    requiredGpuCount,
    requiredNodes,
    scope: input.scope,
    targetTokensPerSecond: round2(input.targetTokensPerSecond)
  };
}

function scopeTps(
  scopes: WorkloadScopeSummary[],
  scope: WorkloadScope,
  fallback: number
): number {
  return scopes.find((candidate) => candidate.scope === scope)?.currentProjectLaneComputeTps ?? fallback;
}

function requiredContextForScope(
  scopes: WorkloadScopeSummary[],
  scope: WorkloadScope
): number {
  const summary = scopes.find((candidate) => candidate.scope === scope);
  return (
    summary?.contextRequirementTokens.p99 ??
    summary?.contextRequirementTokens.p95 ??
    131_072
  );
}

function estimateAnnualOpex(
  profile: HardwareProfile,
  requiredNodes: number | null,
  capexHigh: number | null
): number | null {
  if (requiredNodes === null || capexHigh === null || profile.estimatedSystemPowerKw === null) {
    return null;
  }
  const support = capexHigh * 0.12;
  const powerCooling = profile.estimatedSystemPowerKw * requiredNodes * 24 * 365 * 0.18;
  const software = 10_000 * requiredNodes;
  return roundMoney(support + powerCooling + software);
}

function multiplyNullable(value: number | null, multiplier: number | null): number | null {
  if (value === null || multiplier === null) return null;
  return round2(value * multiplier);
}

function buildFinancials(
  providers: NormalizedProviderUsage[],
  profile: HardwareProfile | null,
  coverage: LocalCoverageSummary,
  overrides: Partial<ReservedCapacityAssumptions> | undefined
): LocalInfrastructureFinancials {
  const assumptions: ReservedCapacityAssumptions = {
    dedicatedApplianceMonthly: 50_000,
    pilotMonthlyPerLane: 8_000,
    productionMonthlyPerLane: 20_000,
    targetLanesPerServer: 1,
    yearOneHardwareBasis: "capex_high",
    ...overrides
  };
  const capexLowUsd = profile?.estimatedCapexLowUsd ?? null;
  const capexHighUsd = profile?.estimatedCapexHighUsd ?? null;
  const annualUsageBasedSpend = providers
    .filter((provider) => provider.billingType !== "SEAT_BASED")
    .reduce((total, provider) => total + annualizedProviderSpend(provider), 0);
  const annualCloudSpendDisplacementUsd = roundMoney(
    annualUsageBasedSpend * (coverage.safeInitialProductionRoutingPct / 100)
  );
  const annualSupportEstimateUsd =
    capexHighUsd === null ? null : roundMoney(capexHighUsd * 0.12);
  const annualPowerCoolingEstimateUsd =
    profile?.estimatedSystemPowerKw === null || profile?.estimatedSystemPowerKw === undefined
      ? null
      : roundMoney(profile.estimatedSystemPowerKw * 24 * 365 * 0.18);
  const annualSoftwareEstimateUsd = 10_000;
  const annualOpexEstimateUsd =
    annualSupportEstimateUsd === null || annualPowerCoolingEstimateUsd === null
      ? null
      : roundMoney(annualSupportEstimateUsd + annualPowerCoolingEstimateUsd + annualSoftwareEstimateUsd);
  const cloudNet =
    annualOpexEstimateUsd === null
      ? annualCloudSpendDisplacementUsd
      : annualCloudSpendDisplacementUsd - annualOpexEstimateUsd;
  const hardwareBasis =
    assumptions.yearOneHardwareBasis === "capex_low"
      ? capexLowUsd
      : capexHighUsd;
  const annualSubscriptionRevenuePotentialUsd =
    Math.max(
      assumptions.productionMonthlyPerLane * assumptions.targetLanesPerServer,
      assumptions.dedicatedApplianceMonthly
    ) * 12;
  const paybackMonthsCloudSpendOnly =
    hardwareBasis !== null && cloudNet > 0
      ? round2((hardwareBasis / cloudNet) * 12)
      : null;
  const paybackMonthsRevenueCapacity =
    hardwareBasis !== null && annualSubscriptionRevenuePotentialUsd > 0
      ? round2((hardwareBasis / annualSubscriptionRevenuePotentialUsd) * 12)
      : null;

  return {
    annualCloudSpendDisplacementUsd,
    annualOpexEstimateUsd,
    annualPowerCoolingEstimateUsd,
    annualSoftwareEstimateUsd,
    annualSubscriptionRevenuePotentialUsd,
    annualSupportEstimateUsd,
    capexHighUsd,
    capexLowUsd,
    notes: [
      "Cloud spend displacement uses avoidable usage-based spend only.",
      "Seat-based provider costs are not directly displaced unless seats are reduced.",
      "cloud spend alone likely does not justify the capex at the safe initial routing percentage.",
      "Productized reserved AI engineering capacity is the strategic payback path."
    ],
    paybackMonthsCloudSpendOnly,
    paybackMonthsRevenueCapacity
  };
}

function buildBenchmarkGates(): BenchmarkGate[] {
  return [
    {
      failAction: "Keep production traffic hosted and expand the replay set.",
      gateId: "shadow_replay_gate",
      minimumSampleCount: 100,
      name: "Shadow replay gate",
      passCriteria: ["p95 latency recorded", "quality deltas reviewed", "no production decisions routed locally"],
      requiredForPhase: "local_shadow",
      requiredMetrics: ["ttftMs", "tokensPerSecond", "p95LatencyMs", "successRate"],
      status: "not_started"
    },
    {
      failAction: "Stop canary and return the class to hosted routing.",
      gateId: "short_context_canary_gate",
      minimumSampleCount: 250,
      name: "Short-context canary gate",
      passCriteria: ["diff quality accepted", "fallback succeeds", "error budget met"],
      requiredForPhase: "short_context_canary",
      requiredMetrics: ["p50LatencyMs", "p95LatencyMs", "diffQuality", "fallbackRate"],
      status: "not_started"
    },
    {
      failAction: "Keep local worker in shadow mode and require hosted worker execution.",
      gateId: "local_worker_cloud_reviewer_gate",
      minimumSampleCount: 100,
      name: "Local worker with cloud reviewer gate",
      passCriteria: ["cloud reviewer agreement meets threshold", "tool-call correctness passes"],
      requiredForPhase: "local_worker_cloud_reviewer",
      requiredMetrics: ["reviewerAgreement", "toolCallCorrectness", "prAcceptance"],
      status: "not_started"
    },
    {
      failAction: "Block production routing until fallback is remediated.",
      gateId: "fallback_failure_gate",
      minimumSampleCount: 25,
      name: "Fallback failure gate",
      passCriteria: ["hosted fallback works under local timeout", "no request is stranded"],
      requiredForPhase: "all_production_routing",
      requiredMetrics: ["fallbackSuccessRate", "timeoutRate"],
      status: "not_started"
    },
    {
      failAction: "Keep p95/p99 sessions hosted and add retrieval or context compaction.",
      gateId: "p95_p99_context_pressure_gate",
      minimumSampleCount: 50,
      name: "p95/p99 context pressure gate",
      passCriteria: ["VRAM pressure recorded", "p99 context remains inside latency target"],
      requiredForPhase: "tail_context_experiments",
      requiredMetrics: ["contextTokens", "vramUsedGb", "p99LatencyMs", "gpuUtilizationPct"],
      status: "not_started"
    },
    {
      failAction: "Do not route production traffic; resolve power/cooling or vendor support.",
      gateId: "power_thermal_burn_in_gate",
      minimumSampleCount: 1,
      name: "Power and thermal burn-in gate",
      passCriteria: ["24-hour burn-in stable", "thermal throttling absent", "power draw documented"],
      requiredForPhase: "server_acceptance",
      requiredMetrics: ["systemPowerKw", "gpuTemperature", "thermalThrottleEvents"],
      status: "not_started"
    }
  ];
}

function buildExecutiveSummary(
  coverage: LocalCoverageSummary,
  financials: LocalInfrastructureFinancials,
  profile: HardwareProfile | null
): ExecutiveHardwareDecisionSummary {
  return {
    capexRange: capexRange(profile),
    estimatedFullWorkloadCapacity: `${coverage.estimatedFullWorkloadCapacityPct.toFixed(1)}% of the current all-provider workload by derived tokens/sec.`,
    estimatedSafeInitialRouting: "5%-10% production canary after shadow benchmarks; 100% shadow replay is allowed.",
    firstQuoteToRequest:
      "Preferred first quote: 2U dual RTX PRO 6000 if budget discipline is strict; 4U/5U quad RTX PRO 6000 if vendor can quote within budget or financing is approved.",
    nextScaleTrigger:
      "Request the 8x RTX PRO 6000 or HGX/DGX production-node quote only after 4-GPU measured capacity misses lane targets.",
    paybackFromCloudDisplacement:
      financials.paybackMonthsCloudSpendOnly === null
        ? "Cloud spend alone likely does not justify capex at safe initial routing."
        : `Cloud displacement payback is approximately ${financials.paybackMonthsCloudSpendOnly} months and still excludes seat reductions.`,
    paybackFromReservedCapacityProductRevenue:
      financials.paybackMonthsRevenueCapacity === null
        ? "Reserved AI Engineering Capacity product payback needs pricing assumptions."
        : `Reserved AI Engineering Capacity is the strategic payback path at approximately ${financials.paybackMonthsRevenueCapacity} months under current assumptions.`,
    quoteConfidence: profile?.pricingConfidence.replaceAll("_", " ") ?? "quote required",
    whatThisServerCanDoNow:
      "Run cloud baseline, local shadow, benchmark replay, and 5%-10% short-context canary with hosted fallback.",
    whatThisServerCannotDo:
      "It cannot replace the full current workload, full p99 long-context sessions, or high-risk reviewer paths without benchmark evidence."
  };
}

function buildSourceWindow(providerCoverage: NormalizedProviderUsage[]): LocalInfrastructureSizingReport["sourceWindow"] {
  const starts = providerCoverage
    .map((usage) => usage.coverageStart)
    .filter((value): value is string => value !== null)
    .sort();
  const ends = providerCoverage
    .map((usage) => usage.coverageEnd)
    .filter((value): value is string => value !== null)
    .sort();
  const windowDays = providerCoverage
    .map((usage) => usage.windowDays)
    .filter((value): value is number => value !== null);

  return {
    coverageEnd: ends[ends.length - 1] ?? null,
    coverageStart: starts[0] ?? null,
    maxWindowDays: windowDays.length > 0 ? Math.max(...windowDays) : null,
    providerWindowDays: providerCoverage.map((usage) => ({
      providerId: usage.providerId,
      windowDays: usage.windowDays
    }))
  };
}

function sizingConfidence(
  distribution: LocalSessionDistribution | null,
  forensicRun: LocalInfrastructureForensicRun | null,
  warnings: string[]
): LocalInfrastructureConfidence {
  if (distribution && forensicRun?.parentSynthesis && warnings.length <= 3) return "high";
  if (distribution || forensicRun?.parentSynthesis) return "medium";
  return "low";
}

function providerBillingType(summary: ProviderReportSummary): NormalizedBillingType {
  if (seatBasedProviderIds.has(summary.providerId)) return "SEAT_BASED";
  const source: SpendCostSource | undefined = summary.spendProjection.costSource;
  if (source === "actual") return "ACTUAL";
  if (source === "estimated") return "ESTIMATED";
  if (source === "seat_based") return "SEAT_BASED";
  return "UNKNOWN";
}

function providerWindowDays(summary: ProviderReportSummary): number | null {
  const computed = inclusiveDays(summary.reportStartDay, summary.reportEndDay);
  if (computed !== null) return computed;
  return finiteNumber(summary.spendProjection.windowDays);
}

function providerInputTokens(summary: ProviderReportSummary): number {
  if (summary.providerId === "github-copilot") {
    return numberField(summary, "cliInputTokens") || numberField(summary, "inputTokens");
  }
  return numberField(summary, "inputTokens");
}

function providerOutputTokens(summary: ProviderReportSummary): number {
  if (summary.providerId === "github-copilot") {
    return numberField(summary, "cliOutputTokens") || numberField(summary, "outputTokens");
  }
  return numberField(summary, "outputTokens");
}

function providerUncachedInputTokens(
  summary: ProviderReportSummary,
  inputTokens: number
): number | null {
  const explicit = finiteNumber(recordOf(summary).uncachedInputTokens);
  if (explicit !== null) return explicit;
  if (summary.providerId === "codex") return null;
  return inputTokens;
}

function providerCacheCreationTokens(summary: ProviderReportSummary): number {
  if (summary.providerId === "cursor") {
    return numberField(summary, "cacheWriteTokens");
  }
  return numberField(summary, "cacheCreationTokens");
}

function providerRequestsCount(summary: ProviderReportSummary): number | null {
  const preferredKeys = [
    "requestCount",
    "cliRequestCount",
    "usageEventCount",
    "totalInteractions"
  ];

  for (const key of preferredKeys) {
    const value = numberField(summary, key);
    if (value > 0) return value;
  }

  if (
    summary.comparisonMetric.unit === "requests" &&
    typeof summary.comparisonMetric.value === "number" &&
    summary.comparisonMetric.value > 0
  ) {
    return summary.comparisonMetric.value;
  }

  return null;
}

function providerSessionsCount(summary: ProviderReportSummary): number | null {
  for (const key of ["cliSessionCount", "sessionCount"]) {
    const value = numberField(summary, key);
    if (value > 0) return value;
  }
  return null;
}

function providerModelsUsed(summary: ProviderReportSummary): string[] {
  const record = recordOf(summary);
  const names = new Set<string>();
  for (const key of ["modelsUsed", "cliModelsUsed"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === "string" && item) names.add(item);
      });
    }
  }

  const breakdown = record.perModelBreakdown;
  if (Array.isArray(breakdown)) {
    breakdown.forEach((item) => {
      if (isRecord(item) && typeof item.model === "string" && item.model) {
        names.add(item.model);
      }
    });
  }

  return Array.from(names).sort();
}

function providerNotes(
  summary: ProviderReportSummary,
  inputTokens: number,
  outputTokens: number
): string[] {
  const notes: string[] = [];
  if (summary.providerId === "github-copilot" && (inputTokens > 0 || outputTokens > 0)) {
    notes.push(
      "GitHub Copilot token telemetry is CLI-only; IDE chat, agent, and code-review interactions may be request-only."
    );
  }
  if (summary.providerId === "codex" && finiteNumber(recordOf(summary).uncachedInputTokens) === null) {
    notes.push("Codex uncached input was unavailable; pure compute falls back to total input tokens.");
  }
  if (summary.spendProjection.note) notes.push(summary.spendProjection.note);
  return notes;
}

function dailyAverage(value: number, windowDays: number | null): number {
  return windowDays && windowDays > 0 ? value / windowDays : 0;
}

function annualizedProviderSpend(provider: NormalizedProviderUsage): number {
  if (provider.totalCostUsd === null || provider.windowDays === null || provider.windowDays <= 0) {
    return 0;
  }
  return provider.totalCostUsd * (365 / provider.windowDays);
}

function dailyComputeForProviders(usages: NormalizedProviderUsage[], providerIds: string[]): number {
  return usages
    .filter((usage) => providerIds.includes(usage.providerId))
    .reduce((total, usage) => total + dailyAverage(pureComputeTokens(usage), usage.windowDays), 0);
}

function dailyForProviders(
  usages: NormalizedProviderUsage[],
  providerIds: string[],
  field: "cacheReadTokens"
): number {
  return usages
    .filter((usage) => providerIds.includes(usage.providerId))
    .reduce((total, usage) => total + dailyAverage(usage[field], usage.windowDays), 0);
}

function requestsForProviders(usages: NormalizedProviderUsage[], providerIds: string[]): number {
  return usages
    .filter((usage) => providerIds.includes(usage.providerId))
    .reduce((total, usage) => total + (usage.requestsCount ?? 0), 0);
}

function providersPresent(usages: NormalizedProviderUsage[], providerIds: string[]): string[] {
  return usages
    .filter((usage) => providerIds.includes(usage.providerId))
    .map((usage) => usage.providerId);
}

function familiesForProviders(usages: NormalizedProviderUsage[], providerIds: string[]): string[] {
  const families = new Set<string>();
  usages
    .filter((usage) => providerIds.includes(usage.providerId))
    .flatMap((usage) => usage.modelsUsed)
    .forEach((model) => families.add(modelFamily(model)));
  return Array.from(families).sort();
}

function modelFamily(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes("claude")) return "claude";
  if (lower.includes("gpt") || lower.includes("codex")) return "gpt/codex";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("llama")) return "llama";
  if (lower.includes("composer")) return "composer";
  return model;
}

function audioComputeDaily(usages: NormalizedProviderUsage[]): number {
  return usages.reduce((total, usage) => {
    const record = recordOf(usage);
    const audioInput = finiteNumber(record.audioInputTokens) ?? 0;
    const audioOutput = finiteNumber(record.audioOutputTokens) ?? 0;
    return total + dailyAverage(audioInput + audioOutput, usage.windowDays);
  }, 0);
}

function dailyUnknownCompute(usages: NormalizedProviderUsage[]): number {
  return usages
    .filter((usage) => usage.requestsCount === null || usage.modelsUsed.length === 0)
    .reduce((total, usage) => total + dailyAverage(pureComputeTokens(usage), usage.windowDays) * 0.05, 0);
}

function dailyUnknownCache(usages: NormalizedProviderUsage[]): number {
  return usages
    .filter((usage) => usage.requestsCount === null || usage.modelsUsed.length === 0)
    .reduce((total, usage) => total + dailyAverage(usage.cacheReadTokens, usage.windowDays) * 0.05, 0);
}

function routePeakMultiplier(routing: WorkloadRouting): number {
  if (routing === "local") return 4;
  if (routing === "hybrid") return 3;
  if (routing === "cloud") return 2;
  return 1;
}

function aggregateTpsEstimate(profile: HardwareProfile): number | null {
  if (profile.id === "floor_proto_dual_rtxpro6000_blackwell_server") return 360;
  if (profile.id === "preferred_quad_rtxpro6000_blackwell_server") return 720;
  if (profile.id === "floor_proto_custom_wrx90_quad_rtxpro6000_maxq") return 520;
  if (profile.id === "budget_l40s_or_rtx6000ada_pcie") return 260;
  if (profile.id === "production_8x_rtxpro6000_blackwell_server") return 1440;
  if (profile.id === "production_node_hgx_h200_b200_8gpu") return 2200;
  if (profile.id === "rack_scale_gb200_nvl72") return 18_000;
  if (profile.gpuType.includes("RTX PRO 6000")) {
    return profile.gpuCount * 180;
  }
  if (profile.gpuType.includes("H200") || profile.gpuType.includes("B200")) {
    return profile.gpuCount * 275;
  }
  return null;
}

function contextFitEstimate(profile: HardwareProfile, contextTokens: number): boolean {
  if (contextTokens <= 131_072) return profile.totalVramGb >= 96;
  if (contextTokens <= 1_000_000) {
    return (
      profile.totalVramGb >= 384 ||
      profile.id === "production_node_hgx_h200_b200_8gpu" ||
      profile.id === "rack_scale_gb200_nvl72"
    );
  }
  return profile.id === "rack_scale_gb200_nvl72";
}

function capacityBottlenecks(
  profile: HardwareProfile,
  contextFit: boolean,
  throughputFit: boolean,
  memoryFit: boolean
): string[] {
  const bottlenecks: string[] = [];
  if (!memoryFit) bottlenecks.push("model or KV-cache memory");
  if (!contextFit) bottlenecks.push("p95/p99 context window");
  if (!throughputFit) bottlenecks.push("aggregate tokens/sec for target local coverage");
  if (!profile.nvlink && profile.gpuCount > 1) {
    bottlenecks.push("PCIe-only multi-GPU scaling");
  }
  if (profile.cooling !== "air") bottlenecks.push(`${profile.cooling} cooling readiness`);
  return bottlenecks.length > 0 ? bottlenecks : ["benchmark validation required"];
}

function routeCapacityEstimate(
  profile: HardwareProfile,
  workload: LocalInfrastructureWorkloadSummary,
  routeCoverageFactor: number
): number | null {
  const aggregateTps = aggregateTpsEstimate(profile);
  if (aggregateTps === null || workload.allProviderComputeTps <= 0) return null;
  return round2((aggregateTps / workload.allProviderComputeTps) / routeCoverageFactor);
}

function isQuoteableFloorOrPilot(profile: HardwareProfile): boolean {
  return (
    (profile.phase === "floor_proto" || profile.phase === "pilot_server") &&
    profile.pricingConfidence === "quote_required"
  );
}

function maybeFitsBudget(profile: HardwareProfile, budgetHighUsd: number): boolean {
  return profile.estimatedCapexLowUsd === null || profile.estimatedCapexLowUsd <= budgetHighUsd;
}

function budgetFit(profile: HardwareProfile): FirstServerRecommendation["budgetFit"] {
  if (profile.phase === "production_node" || profile.phase === "rack_scale") return "scale_only";
  if (profile.pricingConfidence === "quote_required") return "quote_required";
  return "unknown";
}

function dataToCollectBeforePurchase(): string[] {
  return [
    "Anonymized prompt replay set from local Codex and Claude sessions",
    "Shadow results for current bridge-backed forensic prompts",
    "TTFT, tokens/sec, p95/p99 latency, and GPU utilization",
    "Local worker plus cloud reviewer acceptance rate",
    "KV-cache memory pressure at p95 and p99 context",
    "Provider fallback success under local service failure"
  ];
}

function profileIdsByPhase(
  profiles: HardwareProfile[],
  phases: HardwareProfile["phase"][]
): string[] {
  return profiles
    .filter((profile) => phases.includes(profile.phase))
    .map((profile) => profile.id);
}

function inclusiveDays(start: string | undefined, end: string | undefined): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return Math.round((endMs - startMs) / 86_400_000) + 1;
}

function numberField(summary: ProviderReportSummary, key: string): number {
  const value = recordOf(summary)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableSum(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? sum(present) : null;
}

function maxNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatBudgetUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toLocaleString()}M`;
  if (value >= 1_000 && value % 1_000 === 0) return `$${(value / 1_000).toLocaleString()}K`;
  return `$${value.toLocaleString()}`;
}

function formatBudgetRange(lowUsd: number, highUsd: number): string {
  return `${formatBudgetUsd(lowUsd)}-${formatBudgetUsd(highUsd)}`;
}

function capexRange(profile: HardwareProfile | null): string {
  if (!profile) return "quote required";
  if (profile.estimatedCapexLowUsd === null && profile.estimatedCapexHighUsd === null) {
    return "quote required";
  }
  if (profile.estimatedCapexLowUsd !== null && profile.estimatedCapexHighUsd !== null) {
    return `$${profile.estimatedCapexLowUsd.toLocaleString()}-$${profile.estimatedCapexHighUsd.toLocaleString()}`;
  }
  if (profile.estimatedCapexLowUsd !== null) {
    return `$${profile.estimatedCapexLowUsd.toLocaleString()}+`;
  }
  return `up to $${profile.estimatedCapexHighUsd?.toLocaleString() ?? "quote required"}`;
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
