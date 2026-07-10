import { useState, type ReactNode } from "react";

import type { HuggingFaceCandidateSet } from "../lib/huggingFaceCandidates";
import {
  buildLocalInfrastructureSizing,
  type HardwareReplacementGoal,
  type WorkloadScope,
} from "../lib/localInfrastructureSizing";
import type { LocalSessionDistribution } from "../lib/localSessionDistribution";
import type { ReportForensicRun } from "../lib/reportExports";
import type { ProviderReportSummary } from "../lib/types";

interface LocalInfrastructureSizingPanelProps {
  distribution: LocalSessionDistribution | null;
  forensicRun: ReportForensicRun | null;
  huggingFaceCandidateSet: HuggingFaceCandidateSet | null;
  summaries: ProviderReportSummary[];
}

export function LocalInfrastructureSizingPanel({
  distribution,
  forensicRun,
  huggingFaceCandidateSet,
  summaries
}: LocalInfrastructureSizingPanelProps) {
  const report = buildLocalInfrastructureSizing({
    distribution,
    forensicRun,
    huggingFaceCandidateSet,
    summaries
  });
  const [selectedBudgetScope, setSelectedBudgetScope] = useState<WorkloadScope>(
    report.hardwareBudgetSummary.selectedScope
  );

  if (report.providerCoverage.length === 0) return null;

  const safeRoutes = report.routeClasses.filter(
    (route) => route.recommendedRouting === "local" || route.recommendedRouting === "hybrid"
  );
  const cloudRoutes = report.routeClasses.filter(
    (route) => route.recommendedRouting === "cloud" || route.recommendedRouting === "shadow_only"
  );
  const coverage = report.localCoverageSummary;
  const financials = report.financials;
  const selectedScopeSummary =
    report.workloadScopeSummaries.find((scope) => scope.scope === selectedBudgetScope) ??
    report.workloadScopeSummaries[0];
  const hardwareBudgetScopes = report.workloadScopeSummaries.filter((scope) =>
    report.hardwareBudgetScenarios.some((scenario) => scenario.scope === scope.scope)
  );
  const executiveCards = [
    {
      label: "First quote to request",
      note: "Procurement starts with vendor quotes, not a replacement claim",
      value: report.executiveSummary.firstQuoteToRequest
    },
    {
      label: "What this server can do now",
      note: "Allowed before production routing",
      value: report.executiveSummary.whatThisServerCanDoNow
    },
    {
      label: "What this server cannot do",
      note: "Kept explicit for CFO/COO review",
      value: report.executiveSummary.whatThisServerCannotDo
    },
    {
      label: "Estimated safe initial routing",
      note: "Benchmark-gated production canary",
      value: report.executiveSummary.estimatedSafeInitialRouting
    },
    {
      label: "Estimated full-workload capacity",
      note: "Derived from aggregate tokens/sec vs current workload",
      value: report.executiveSummary.estimatedFullWorkloadCapacity
    },
    {
      label: "Capex range",
      note: "Requires vendor quote confirmation",
      value: report.executiveSummary.capexRange
    },
    {
      label: "Quote confidence",
      note: "Do not upgrade until quote is stored and reviewed",
      value: report.executiveSummary.quoteConfidence
    },
    {
      label: "Payback from cloud displacement",
      note: "Usage-based provider spend only",
      value: report.executiveSummary.paybackFromCloudDisplacement
    },
    {
      label: "Payback from reserved-capacity product revenue",
      note: "Strategic product economics",
      value: report.executiveSummary.paybackFromReservedCapacityProductRevenue
    },
    {
      label: "Next scale trigger",
      note: "Expansion requires measured benchmark evidence",
      value: report.executiveSummary.nextScaleTrigger
    }
  ];

  return (
    <section className="infra-panel" aria-labelledby="infra-panel-title">
      <div className="infra-panel__header">
        <div>
          <p className="infra-panel__eyebrow">Hardware-aware migration</p>
          <h2 className="infra-panel__title" id="infra-panel-title">
            Local AI Infrastructure Sizing
          </h2>
          <p className="infra-panel__subtitle">
            {report.sourceWindow.coverageStart ?? "unknown"} to{" "}
            {report.sourceWindow.coverageEnd ?? "unknown"} · confidence{" "}
            {report.confidence}
          </p>
        </div>
        <div className="infra-panel__status">
          {report.recommendedFirstServer.recommendationKind.replaceAll("_", " ")}
        </div>
      </div>

      <div className="infra-section">
        <h3>Executive Hardware Decision Summary</h3>
        <div className="infra-card-grid">
          {executiveCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </div>
      </div>

      <div className="infra-section infra-section--budget">
        <div className="infra-section__heading-row">
          <h3>Hardware Budget Required by Scope</h3>
          <label className="infra-select-field">
            <span>Budget math scope</span>
            <select
              value={selectedBudgetScope}
              onChange={(event) => setSelectedBudgetScope(event.target.value as WorkloadScope)}
            >
              {hardwareBudgetScopes.map((scope) => (
                <option key={scope.scope} value={scope.scope}>
                  {scope.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="infra-callout">
          {report.hardwareBudgetSummary.cfoSummaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p>{report.hardwareBudgetSummary.copilotDominanceWarning}</p>
        </div>
        {selectedScopeSummary && (
          <div className="infra-card-grid">
            <MetricCard
              label="Selected scope steady demand"
              value={`${selectedScopeSummary.currentProjectLaneComputeTps.toFixed(1)} tok/s`}
              note={`${selectedScopeSummary.label}; peak plan ${selectedScopeSummary.peakTokensPerSecond.toFixed(1)} tok/s`}
            />
            <MetricCard
              label="All-provider steady demand"
              value={`${report.workloadSummary.allProviderComputeTps.toFixed(1)} tok/s`}
              note={`Peak-safe plan ${report.workloadSummary.allProviderPeakTps.toFixed(1)} tok/s`}
            />
            <MetricCard
              label="Repo Automation lane demand"
              value={`${report.workloadSummary.repoAutomationComputeTps.toFixed(1)} tok/s`}
              note={`Peak-safe plan ${report.workloadSummary.repoAutomationPeakTps.toFixed(1)} tok/s`}
            />
          </div>
        )}
        <div className="infra-table-wrap infra-table-wrap--wide">
          <table className="infra-table infra-table--budget">
            <thead>
              <tr>
                <th>Scope</th>
                <th>Goal</th>
                <th>Target tok/s</th>
                <th>Context</th>
                <th>Hardware</th>
                <th>Nodes</th>
                <th>GPUs</th>
                <th>Capex</th>
                <th>Opex/yr</th>
                <th>Power</th>
                <th>RU</th>
                <th>Full replacement</th>
                <th>Fallback</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {report.hardwareBudgetScenarios.map((scenario) => (
                <tr
                  key={`${scenario.scope}-${scenario.replacementGoal}-${scenario.hardwareProfileId}`}
                  className={
                    scenario.scope === selectedBudgetScope ? "infra-table__selected-row" : undefined
                  }
                >
                  <td>{scopeLabel(scenario.scope)}</td>
                  <td>
                    {goalLabel(scenario.replacementGoal)}
                    <span>{scenario.explanation}</span>
                  </td>
                  <td>{scenario.targetTokensPerSecond.toFixed(1)}</td>
                  <td>{fmt(scenario.requiredContextTokens)}</td>
                  <td>{scenario.hardwareProfileName}</td>
                  <td>{nullableNumber(scenario.requiredNodes)}</td>
                  <td>{nullableNumber(scenario.requiredGpuCount)}</td>
                  <td>{capex(scenario.estimatedCapexLowUsd, scenario.estimatedCapexHighUsd)}</td>
                  <td>{money(scenario.estimatedAnnualOpexUsd)}</td>
                  <td>
                    {scenario.estimatedSystemPowerKw === null
                      ? "quote"
                      : `${scenario.estimatedSystemPowerKw.toFixed(1)} kW`}
                  </td>
                  <td>{nullableNumber(scenario.rackUnitsRequired)}</td>
                  <td>{yesNo(scenario.fullReplacementAllowed)}</td>
                  <td>{scenario.cloudFallbackRequired ? "required" : "optional"}</td>
                  <td>{scenario.confidence.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="infra-card-grid">
        <MetricCard
          label="Selected scope baseline"
          value={`${report.workloadSummary.selectedScopeComputeTps.toFixed(1)} tok/s`}
          note={`Peak plan ${report.workloadSummary.selectedScopePeakTps.toFixed(1)} tok/s`}
        />
        <MetricCard
          label="Target first-server migration objective"
          value={`${coverage.targetFirstServerCoveragePct}%`}
          note="Objective only; not measured server capacity"
        />
        <MetricCard
          label="Estimated full-workload capacity"
          value={pctNumber(coverage.estimatedFullWorkloadCapacityPct)}
          note={coverage.explanation}
        />
        <MetricCard
          label="Safe initial production routing"
          value={`${coverage.safeInitialProductionRoutingPct}%`}
          note={`Shadow ${coverage.shadowCoveragePct}%; canary ${coverage.canaryCoveragePct}% until gates pass`}
        />
        <MetricCard
          label="First-server recommendation"
          value={report.recommendedFirstServer.profileName}
          note={report.recommendedFirstServer.routingRecommendation}
        />
        <MetricCard
          label="Workloads safe for local"
          value={safeRoutes.map((route) => route.name).join(", ") || "None"}
          note="Uses hosted fallback where routing is hybrid"
        />
        <MetricCard
          label="Workloads that must stay cloud"
          value={cloudRoutes.map((route) => route.name).join(", ") || "None"}
          note="Tail context, realtime, and incomplete telemetry stay guarded"
        />
        <MetricCard
          label="Facilities readiness"
          value={
            report.recommendedFirstServer.facilitiesPrerequisites[0] ??
            "Vendor quote required"
          }
          note={`${report.recommendedFirstServer.facilitiesPrerequisites.length} prerequisites tracked`}
        />
        <MetricCard
          label="Benchmark plan"
          value={report.benchmarkPlan.benchmarkDataPath}
          note={
            report.productionRoutingBlocked
              ? "Production routing blocked until benchmark gates pass"
              : `${report.benchmarkPlan.requiredMeasurements.length} measurements before routing`
          }
        />
        <MetricCard
          label="Cloud spend payback"
          value={
            financials.paybackMonthsCloudSpendOnly === null
              ? "not justified"
              : `${financials.paybackMonthsCloudSpendOnly} months`
          }
          note={`Avoidable spend ${money(financials.annualCloudSpendDisplacementUsd)}/year`}
        />
        <MetricCard
          label="Reserved capacity payback"
          value={
            financials.paybackMonthsRevenueCapacity === null
              ? "needs assumptions"
              : `${financials.paybackMonthsRevenueCapacity} months`
          }
          note={`Potential ${money(financials.annualSubscriptionRevenuePotentialUsd)}/year`}
        />
        <MetricCard
          label="Scale ramp"
          value={report.scaleRamp.map((phase) => phase.phase).join(" -> ")}
          note="floor proto -> pilot -> production node -> rack -> cage"
        />
      </div>

      <InfrastructureTable title="Coverage, capacity, and routing guardrails">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Target first-server migration objective</td>
            <td>{coverage.targetFirstServerCoveragePct}%</td>
            <td>Treat as the migration goal for the first server, not measured capability.</td>
          </tr>
          <tr>
            <td>Estimated full-workload capacity</td>
            <td>{pctNumber(coverage.estimatedFullWorkloadCapacityPct)}</td>
            <td>Derived from aggregate tokens/sec divided by current project-lane demand.</td>
          </tr>
          <tr>
            <td>Safe initial production routing</td>
            <td>{coverage.safeInitialProductionRoutingPct}%</td>
            <td>Initial canary range after shadow benchmarks and fallback tests.</td>
          </tr>
          <tr>
            <td>Capacity limits</td>
            <td>{coverage.capacityLimitedBy.join(", ") || "benchmark validation required"}</td>
            <td>{coverage.explanation}</td>
          </tr>
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Provider traffic normalized">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Window</th>
            <th>Input</th>
            <th>Uncached</th>
            <th>Output</th>
            <th>Cache read</th>
            <th>Cache create</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          {report.providerCoverage.map((provider) => (
            <tr key={provider.providerId}>
              <td>{provider.providerName}</td>
              <td>
                {provider.windowDays ?? "unknown"} days
                <span>
                  {provider.coverageStart ?? "unknown"} {"->"} {provider.coverageEnd ?? "unknown"}
                </span>
              </td>
              <td>{fmt(provider.inputTokens)}</td>
              <td>
                {provider.uncachedInputTokens === null
                  ? "unknown"
                  : fmt(provider.uncachedInputTokens)}
              </td>
              <td>{fmt(provider.outputTokens)}</td>
              <td>{fmt(provider.cacheReadTokens)}</td>
              <td>{fmt(provider.cacheCreationTokens)}</td>
              <td>{provider.requestsCount === null ? "unknown" : fmt(provider.requestsCount)}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Workload scope sizing">
        <thead>
          <tr>
            <th>Scope</th>
            <th>Default?</th>
            <th>Providers</th>
            <th>Compute/day</th>
            <th>Steady tok/s</th>
            <th>Peak tok/s</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {report.workloadScopeSummaries.map((scope) => (
            <tr key={scope.scope}>
              <td>{scope.label}</td>
              <td>{scope.scope === report.workloadScopeConfig.defaultSizingScope ? "yes" : "no"}</td>
              <td>{scope.providerIds.join(", ") || "none"}</td>
              <td>{fmt(Math.round(scope.computeTokensPerDay))}</td>
              <td>{scope.currentProjectLaneComputeTps.toFixed(1)}</td>
              <td>{scope.peakTokensPerSecond.toFixed(1)}</td>
              <td>{scope.notes.join(" ")}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Route class migration plan">
        <thead>
          <tr>
            <th>Class</th>
            <th>Kind</th>
            <th>Routing</th>
            <th>Token share</th>
            <th>Context source</th>
            <th>Compute/day</th>
            <th>Peak tok/s</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {report.routeClasses.map((route) => (
            <tr key={route.id}>
              <td>{route.name}</td>
              <td>
                {route.kind.replaceAll("_", " ")}
                {route.overlapsWithRouteClassIds.length > 0 && (
                  <span>overlaps {route.overlapsWithRouteClassIds.join(", ")}</span>
                )}
              </td>
              <td>
                <span className={`infra-route infra-route--${route.recommendedRouting}`}>
                  {route.recommendedRouting.replaceAll("_", " ")}
                </span>
              </td>
              <td>{pct(route.tokenShareEstimate)}</td>
              <td>
                {route.contextStatsSource.replaceAll("_", " ")}
                {route.contextStatsWarning && <span>{route.contextStatsWarning}</span>}
              </td>
              <td>{fmt(Math.round(route.computeTokensPerDay))}</td>
              <td>{route.peakTokensPerSecond.toFixed(1)}</td>
              <td>{route.reason}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Hardware profile comparison">
        <thead>
          <tr>
            <th>Profile</th>
            <th>Phase</th>
            <th>GPU</th>
            <th>VRAM</th>
            <th>Power</th>
            <th>Cooling</th>
            <th>Capex</th>
            <th>Quote priority</th>
            <th>First role</th>
            <th>Safe routing</th>
            <th>Full lane?</th>
          </tr>
        </thead>
        <tbody>
          {report.hardwareProfiles.map((profile) => (
            <tr key={profile.id}>
              <td>{profile.profileName}</td>
              <td>{profile.phase.replaceAll("_", " ")}</td>
              <td>{profile.gpuCount} x {profile.gpuType}</td>
              <td>{profile.totalVramGb} GB</td>
              <td>
                {profile.estimatedSystemPowerKw === null
                  ? "quote"
                  : `${profile.estimatedSystemPowerKw} kW`}
              </td>
              <td>{profile.cooling.replaceAll("_", " ")}</td>
              <td>
                {capex(profile.estimatedCapexLowUsd, profile.estimatedCapexHighUsd)}
                <span>{profile.pricingConfidence.replaceAll("_", " ")}</span>
              </td>
              <td>{profile.quotePriority.replaceAll("_", " ")}</td>
              <td>{profile.firstServerRole.replaceAll("_", " ")}</td>
              <td>{profile.maxSafeInitialRoutingPct}%</td>
              <td>
                {profile.fullProjectLaneClaimAllowed ? "yes" : "no"}
                <span>{profile.analystNarrative}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Financial payback model">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Capex range</td>
            <td>{capex(financials.capexLowUsd, financials.capexHighUsd)}</td>
            <td>Preferred first-server quote profile; vendor quote required.</td>
          </tr>
          <tr>
            <td>Annual opex estimate</td>
            <td>{money(financials.annualOpexEstimateUsd)}</td>
            <td>
              Support {money(financials.annualSupportEstimateUsd)}, power/cooling{" "}
              {money(financials.annualPowerCoolingEstimateUsd)}, software{" "}
              {money(financials.annualSoftwareEstimateUsd)}
            </td>
          </tr>
          <tr>
            <td>Annual cloud spend displacement</td>
            <td>{money(financials.annualCloudSpendDisplacementUsd)}</td>
            <td>Usage-based spend only at safe initial routing percentage.</td>
          </tr>
          <tr>
            <td>Payback from cloud displacement</td>
            <td>
              {financials.paybackMonthsCloudSpendOnly === null
                ? "not justified"
                : `${financials.paybackMonthsCloudSpendOnly} months`}
            </td>
            <td>Seat-based costs are not displaced unless seats are reduced.</td>
          </tr>
          <tr>
            <td>Reserved-capacity revenue potential</td>
            <td>{money(financials.annualSubscriptionRevenuePotentialUsd)}</td>
            <td>Productized AI Engineering Capacity assumption.</td>
          </tr>
          <tr>
            <td>Payback from reserved-capacity product revenue</td>
            <td>
              {financials.paybackMonthsRevenueCapacity === null
                ? "needs assumptions"
                : `${financials.paybackMonthsRevenueCapacity} months`}
            </td>
            <td>{financials.notes.join(" ")}</td>
          </tr>
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Benchmark gates">
        <thead>
          <tr>
            <th>Gate</th>
            <th>Status</th>
            <th>Required for</th>
            <th>Samples</th>
            <th>Metrics</th>
            <th>Pass criteria</th>
            <th>Fail action</th>
          </tr>
        </thead>
        <tbody>
          {report.benchmarkGates.map((gate) => (
            <tr key={gate.gateId}>
              <td>{gate.name}</td>
              <td>
                <span className={`infra-gate infra-gate--${gate.status}`}>
                  {gate.status.replaceAll("_", " ")}
                </span>
              </td>
              <td>{gate.requiredForPhase.replaceAll("_", " ")}</td>
              <td>{fmt(gate.minimumSampleCount)}</td>
              <td>{gate.requiredMetrics.join(", ")}</td>
              <td>{gate.passCriteria.join("; ")}</td>
              <td>{gate.failAction}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="First-server quote checklist">
        <tbody>
          {report.procurementChecklist.map((item) => (
            <tr key={item}>
              <td>{item}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Scale ramp: floor proto -> pilot -> production node -> rack -> cage">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Trigger</th>
            <th>Coverage</th>
            <th>Lanes</th>
            <th>Hardware</th>
          </tr>
        </thead>
        <tbody>
          {report.scaleRamp.map((phase) => (
            <tr key={phase.phase}>
              <td>{phase.name}</td>
              <td>{phase.trigger}</td>
              <td>{phase.targetLocalCoveragePct}%</td>
              <td>{phase.targetProjectLanes}</td>
              <td>{phase.recommendedHardwareProfileIds.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>

      <InfrastructureTable title="Data quality warnings">
        <tbody>
          {(report.dataQualityWarnings.length > 0
            ? report.dataQualityWarnings
            : ["No local infrastructure data-quality warnings emitted."]
          ).map((warning) => (
            <tr key={warning}>
              <td>{warning}</td>
            </tr>
          ))}
        </tbody>
      </InfrastructureTable>
    </section>
  );
}

function MetricCard({ label, note, value }: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="infra-card">
      <span className="infra-card__label">{label}</span>
      <strong className="infra-card__value">{value}</strong>
      <span className="infra-card__note">{note}</span>
    </div>
  );
}

function InfrastructureTable({ children, title }: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="infra-section">
      <h3>{title}</h3>
      <div className="infra-table-wrap">
        <table className="infra-table">{children}</table>
      </div>
    </div>
  );
}

function fmt(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString();
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function pctNumber(value: number): string {
  return `${value.toFixed(1)}%`;
}

function money(value: number | null): string {
  if (value === null) return "unknown";
  return `$${fmt(Math.round(value))}`;
}

function capex(low: number | null, high: number | null): string {
  if (low === null && high === null) return "quote";
  if (low !== null && high !== null) return `$${fmt(low)}-$${fmt(high)}`;
  if (low !== null) return `$${fmt(low)}+`;
  return `up to $${fmt(high ?? 0)}`;
}

function nullableNumber(value: number | null): string {
  return value === null ? "quote" : fmt(value);
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function scopeLabel(scope: WorkloadScope): string {
  return scope.replaceAll("_", " ");
}

function goalLabel(goal: HardwareReplacementGoal): string {
  return goal.replaceAll("_", " ");
}
