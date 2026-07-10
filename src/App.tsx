import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ClaudeCodeReportCard } from "./components/ClaudeCodeReportCard";
import { ClaudeReportCard } from "./components/ClaudeReportCard";
import { CodexReportCard } from "./components/CodexReportCard";
import { CursorReportCard } from "./components/CursorReportCard";
import { GitHubCopilotReportCard } from "./components/GitHubCopilotReportCard";
import { LocalInfrastructureSizingPanel } from "./components/LocalInfrastructureSizingPanel";
import { ProviderComparisonSection } from "./components/ProviderComparisonSection";
import { LocalModelMigrationPanel } from "./components/LocalModelMigrationPanel";
import { SpendProjectionPanel } from "./components/SpendProjectionPanel";
import { AzureQuotaPanel } from "./components/AzureQuotaPanel";
import type { ClaudeCodeReportSummary } from "./providers/claudeCode/types";
import type { ClaudeReportSummary } from "./providers/claude/types";
import type { CodexReportSummary } from "./providers/codex/types";
import type { CursorReportSummary } from "./providers/cursor/types";
import type { GitHubCopilotReportSummary } from "./providers/githubCopilot/types";
import type { ProviderReportSummary } from "./lib/types";
import {
  loadLocalSessionDistribution,
  type LocalSessionDistribution,
} from "./lib/localSessionDistribution";
import {
  loadHuggingFaceCandidateSet,
  type HuggingFaceCandidateSet,
} from "./lib/huggingFaceCandidates";
import {
  downloadReportExport,
  REPORT_EXPORT_OPTIONS,
  SQL_DIALECT_OPTIONS,
  type ReportExportFormat,
  type ReportForensicRun,
  type SqlDialect,
} from "./lib/reportExports";
import type { WorkloadScope } from "./lib/localInfrastructureSizing";
import type { LocalModelWorkloadScopeId } from "./lib/localModelReport";
import { pollReportRefreshJob, requestReportRefresh } from "./lib/integrationApiClient";
import { resolveRuntimeApiBaseUrl, resolveRuntimeAssetPath } from "./lib/runtimePaths";
import { providerRegistry } from "./providers/registry";
import "./App.css";

type RefreshStepId = "forensics" | "huggingface" | "providers" | "snapshots";
type RefreshStepStatus = "completed" | "degraded" | "failed" | "queued" | "running";

interface RefreshProgressStep {
  detail: string;
  id: RefreshStepId;
  status: RefreshStepStatus;
  title: string;
}

function renderProviderCard(summary: ProviderReportSummary) {
  switch (summary.providerId) {
    case "github-copilot":
      return (
        <GitHubCopilotReportCard
          key={summary.providerId}
          summary={summary as GitHubCopilotReportSummary}
        />
      );
    case "cursor":
      return (
        <CursorReportCard
          key={summary.providerId}
          summary={summary as CursorReportSummary}
        />
      );
    case "claude":
      return (
        <ClaudeReportCard
          key={summary.providerId}
          summary={summary as ClaudeReportSummary}
        />
      );
    case "claude-code":
      return (
        <ClaudeCodeReportCard
          key={summary.providerId}
          summary={summary as ClaudeCodeReportSummary}
        />
      );
    case "codex":
      return (
        <CodexReportCard
          key={summary.providerId}
          summary={summary as CodexReportSummary}
        />
      );
    default:
      return null;
  }
}

function snapshotPaths(dataPath: string): string[] {
  const slash = dataPath.lastIndexOf("/");
  if (slash === -1) return [dataPath];
  return [
    `${dataPath.slice(0, slash + 1)}accumulated-metadata.json`,
    dataPath
  ];
}

async function loadLatestForensicRun(
  basePath = "",
  queryString = ""
): Promise<ReportForensicRun | null> {
  try {
    const response = await fetch(
      resolveRuntimeAssetPath(`data/integration/forensic-runs.json${queryString}`, basePath)
    );
    if (!response.ok) return null;

    const raw = (await response.json()) as unknown;
    if (!isRecord(raw) || !isRecord(raw.runs) || typeof raw.latestRunId !== "string") {
      return null;
    }

    const latest = raw.runs[raw.latestRunId];
    return isRecord(latest) ? (latest as ReportForensicRun) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const appBasePath = import.meta.env.BASE_URL;
  const apiBaseUrl = useMemo(
    () =>
      resolveRuntimeApiBaseUrl({
        basePath: appBasePath,
        configuredApiBaseUrl: import.meta.env.VITE_TOKEN_REPORTING_API_BASE_URL,
        origin: typeof window === "undefined" ? undefined : window.location.origin
      }),
    [appBasePath]
  );
  const [summaries, setSummaries] = useState<ProviderReportSummary[]>(
    providerRegistry.map((adapter) => adapter.seedSummary)
  );
  const [loading, setLoading] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshSteps, setRefreshSteps] = useState<RefreshProgressStep[]>([]);
  const [distribution, setDistribution] = useState<LocalSessionDistribution | null>(null);
  const [huggingFaceCandidateSet, setHuggingFaceCandidateSet] =
    useState<HuggingFaceCandidateSet | null>(null);
  const [forensicRun, setForensicRun] = useState<ReportForensicRun | null>(null);
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>("pdf");
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>("sqlite");
  const [localModelWorkloadScopeId, setLocalModelWorkloadScopeId] =
    useState<LocalModelWorkloadScopeId>("all_provider_traffic");
  const [infrastructureBudgetScope, setInfrastructureBudgetScope] =
    useState<WorkloadScope>("repo_automation_project");
  // Counter guards against stale responses from concurrent or Strict Mode loads
  const loadCounterRef = useRef(0);

  const loadSnapshots = useCallback(async (cacheBust = false) => {
    setLoading(true);
    const myCount = ++loadCounterRef.current;

    try {
      const qs = cacheBust ? `?t=${Date.now()}` : "";
      const [results, dist, hfCandidates, latestForensicRun] = await Promise.all([
        Promise.all(
          providerRegistry.map(async (adapter) => {
            try {
              for (const dataPath of snapshotPaths(adapter.dataPath)) {
                const url = resolveRuntimeAssetPath(`data/${dataPath}${qs}`, appBasePath);
                const response = await fetch(url);
                if (!response.ok) continue;
                const raw = await response.json();
                return adapter.transformSnapshot(raw);
              }
              return adapter.seedSummary;
            } catch {
              return adapter.seedSummary;
            }
          })
        ),
        loadLocalSessionDistribution(appBasePath),
        loadHuggingFaceCandidateSet(fetch, appBasePath),
        loadLatestForensicRun(appBasePath, qs),
      ]);

      if (myCount === loadCounterRef.current) {
        setSummaries(results);
        setDistribution(dist);
        setHuggingFaceCandidateSet(hfCandidates);
        setForensicRun(latestForensicRun);
      }
    } finally {
      if (myCount === loadCounterRef.current) {
        setLoading(false);
      }
    }
  }, [appBasePath]);

  useEffect(() => {
    void loadSnapshots(false);
  }, [loadSnapshots]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    setRefreshSteps(initialRefreshSteps());
    setRefreshMessage(
      "Starting refresh: provider data, Hugging Face candidates, and forensic reviewers are running."
    );
    const refreshTimers = [
      window.setTimeout(() => {
        setRefreshSteps((steps) =>
          updateRefreshStep(steps, "forensics", {
            detail: "Bridge-backed reviewer reports are still executing.",
            status: "running"
          })
        );
      }, 5_000),
      window.setTimeout(() => {
        setRefreshMessage(
          "Refresh still running: provider APIs and bridge reviewers can take several minutes."
        );
        setRefreshSteps((steps) =>
          steps.map((step) =>
            step.status === "running"
              ? {
                  ...step,
                  detail: `${step.detail} Still running after 15 seconds.`
                }
              : step
          )
        );
      }, 15_000),
      window.setTimeout(() => {
        setRefreshMessage(
          "Still working: waiting for provider APIs and forensic reviewers; this request is bounded."
        );
        setRefreshSteps((steps) =>
          steps.map((step) =>
            step.status === "running"
              ? {
                  ...step,
                  detail: `${step.detail} Still running after 2 minutes.`
                }
              : step
          )
        );
      }, 120_000)
    ];

    try {
      const result = await requestReportRefresh({ defaultApiBaseUrl: apiBaseUrl });
      if (result.outcome === "accepted") {
        let job = result.job;
        setRefreshMessage(`Refresh job ${job.jobId} ${job.status}`);
        setRefreshSteps(refreshStepsFromJob(job));

        if (!isTerminalRefreshStatus(job.status)) {
          const pollResult = await pollReportRefreshJob(job.jobId, {
            defaultApiBaseUrl: apiBaseUrl,
            onUpdate: (updatedJob) => {
              setRefreshMessage(`Refresh job ${updatedJob.jobId} ${updatedJob.status}`);
              setRefreshSteps(refreshStepsFromJob(updatedJob));
            }
          });

          if (pollResult.outcome === "accepted") {
            job = pollResult.job;
            setRefreshMessage(`Refresh job ${job.jobId} ${job.status}`);
            setRefreshSteps(refreshStepsFromJob(job));
          } else {
            setRefreshMessage(pollResult.message);
            setRefreshSteps(failedRefreshSteps(pollResult.message));
          }
        }
      } else {
        setRefreshMessage(result.message);
        setRefreshSteps(failedRefreshSteps(result.message));
      }
    } catch {
      setRefreshMessage("Refresh API unavailable; loaded local snapshots");
      setRefreshSteps(failedRefreshSteps("Refresh API unavailable."));
    } finally {
      refreshTimers.forEach((timer) => window.clearTimeout(timer));
    }

    await loadSnapshots(true);
    setRefreshSteps((steps) =>
      updateRefreshStep(steps, "snapshots", {
        detail: "Snapshots reloaded after refresh response.",
        status: "completed"
      })
    );
  }, [apiBaseUrl, loadSnapshots]);

  const handleDownload = useCallback(() => {
    downloadReportExport(
      {
        distribution,
        forensicRun,
        huggingFaceCandidateSet,
        localInfrastructureWorkloadScope: infrastructureBudgetScope,
        localModelWorkloadScopeId,
        summaries
      },
      exportFormat,
      sqlDialect
    );
  }, [
    distribution,
    exportFormat,
    forensicRun,
    huggingFaceCandidateSet,
    infrastructureBudgetScope,
    localModelWorkloadScopeId,
    sqlDialect,
    summaries
  ]);
  const reportFreshness = reportFreshnessLabel(summaries);

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="hero__eyebrow">Token reporting workspace</p>
        <h1>Multi-provider token consumption dashboard</h1>
        <p className="hero__body">
          Aggregated usage across GitHub Copilot, Cursor, Claude, Claude Code,
          and OpenAI Codex from their respective reporting APIs and local
          session telemetry.
        </p>
        <div className="hero__actions">
          <button
            className="hero__refresh-btn"
            onClick={() => void handleRefresh()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "↻ Refresh Report"}
          </button>
          {(refreshMessage || reportFreshness) && (
            <span className="hero__refresh-meta" aria-live="polite">
              {refreshMessage && <span>{refreshMessage}</span>}
              {reportFreshness && <span>{reportFreshness}</span>}
            </span>
          )}
          <div className="hero__export-controls">
            <label className="hero__export-field">
              <span>Format</span>
              <select
                value={exportFormat}
                onChange={(event) =>
                  setExportFormat(event.target.value as ReportExportFormat)
                }
              >
                {REPORT_EXPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {exportFormat === "database" && (
              <label className="hero__export-field">
                <span>Dialect</span>
                <select
                  value={sqlDialect}
                  onChange={(event) =>
                    setSqlDialect(event.target.value as SqlDialect)
                  }
                >
                  {SQL_DIALECT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="hero__download-btn" onClick={handleDownload}>
              Download data
            </button>
          </div>
          {refreshSteps.length > 0 && (
            <RefreshActivityPanel steps={refreshSteps} />
          )}
        </div>
      </section>
      <ProviderComparisonSection summaries={summaries} />
      <SpendProjectionPanel summaries={summaries} />
      <LocalModelMigrationPanel
        summaries={summaries}
        distribution={distribution}
        forensicRun={forensicRun}
        huggingFaceCandidateSet={huggingFaceCandidateSet}
        workloadScopeId={localModelWorkloadScopeId}
        onWorkloadScopeChange={setLocalModelWorkloadScopeId}
      />
      <LocalInfrastructureSizingPanel
        summaries={summaries}
        distribution={distribution}
        forensicRun={forensicRun}
        huggingFaceCandidateSet={huggingFaceCandidateSet}
        selectedBudgetScope={infrastructureBudgetScope}
        onBudgetScopeChange={setInfrastructureBudgetScope}
      />
      <AzureQuotaPanel summaries={summaries} />
      <div className="report-cards">
        {summaries.map(renderProviderCard)}
      </div>
    </main>
  );
}

function RefreshActivityPanel({ steps }: { steps: RefreshProgressStep[] }) {
  return (
    <div className="refresh-progress" role="status" aria-label="Refresh activity">
      <div className="refresh-progress__bar" aria-hidden="true">
        <span style={{ width: `${refreshProgressPercent(steps)}%` }} />
      </div>
      <ol className="refresh-progress__list">
        {steps.map((step) => (
          <li
            className={`refresh-progress__step refresh-progress__step--${step.status}`}
            key={step.id}
          >
            <span
              className={`refresh-progress__indicator${
                step.status === "running" ? " refresh-progress__indicator--active" : ""
              }`}
              aria-hidden="true"
            />
            <span className="refresh-progress__copy">
              <span className="refresh-progress__line">
                <span className="refresh-progress__title">{step.title}</span>
                <span className="refresh-progress__status">
                  {statusLabel(step.status)}
                </span>
              </span>
              <span className="refresh-progress__detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function reportFreshnessLabel(summaries: ProviderReportSummary[]): string | null {
  const latestReportEndDay = maxIsoString(summaries.map((summary) => summary.reportEndDay));
  if (!latestReportEndDay) return null;

  const latestGeneratedAt = maxIsoString(
    summaries
      .map((summary) => summary.snapshotGeneratedAt)
      .filter(
        (value): value is string =>
          typeof value === "string" && Number.isFinite(Date.parse(value))
      )
  );

  if (latestGeneratedAt) {
    return `Report generated ${formatUtcMinute(latestGeneratedAt)} | data through ${latestReportEndDay}`;
  }

  return `Report data through ${latestReportEndDay}`;
}

function maxIsoString(values: string[]): string | null {
  const clean = values.filter(Boolean).sort();
  return clean.length > 0 ? clean[clean.length - 1] : null;
}

function formatUtcMinute(value: string): string {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function initialRefreshSteps(): RefreshProgressStep[] {
  return [
    {
      detail: "Fetching provider Admin/API usage and cost snapshots.",
      id: "providers",
      status: "running",
      title: "Provider Admin APIs"
    },
    {
      detail: "Refreshing current Hugging Face model candidates.",
      id: "huggingface",
      status: "running",
      title: "Hugging Face candidates"
    },
    {
      detail: "Dispatching bridge-backed reviewer forensic reports.",
      id: "forensics",
      status: "running",
      title: "Forensic reviewers"
    },
    {
      detail: "Waiting for refresh response before reloading dashboard snapshots.",
      id: "snapshots",
      status: "queued",
      title: "Report snapshot reload"
    }
  ];
}

function failedRefreshSteps(message: string): RefreshProgressStep[] {
  return [
    {
      detail: message,
      id: "providers",
      status: "failed",
      title: "Provider Admin APIs"
    },
    {
      detail: "Not confirmed because the refresh request did not complete.",
      id: "huggingface",
      status: "queued",
      title: "Hugging Face candidates"
    },
    {
      detail: "Not confirmed because the refresh request did not complete.",
      id: "forensics",
      status: "queued",
      title: "Forensic reviewers"
    },
    {
      detail: "Reloading local snapshots after refresh request failure.",
      id: "snapshots",
      status: "running",
      title: "Report snapshot reload"
    }
  ];
}

function refreshStepsFromJob(job: Record<string, unknown>): RefreshProgressStep[] {
  const providerResults = readRecordArray(job.providerResults);
  const forensicRun = isRecord(job.forensicRun) ? job.forensicRun : null;
  const reviewerArtifacts = forensicRun ? readRecordArray(forensicRun.reviewerArtifacts) : [];
  const jobStatus = readStatus(job.status);
  const includeHuggingFaceRefresh = job.includeHuggingFaceRefresh !== false;
  const huggingFaceCandidateSetId =
    forensicRun && typeof forensicRun.huggingFaceCandidateSetId === "string"
      ? forensicRun.huggingFaceCandidateSetId
      : readStringField(job, "huggingFaceCandidateSetId");
  const huggingFaceUnavailable = huggingFaceCandidateSetId?.includes("unavailable") ?? false;
  const huggingFaceStatus: RefreshStepStatus =
    !includeHuggingFaceRefresh
      ? "completed"
      : huggingFaceCandidateSetId === null
      ? jobStatus && isTerminalRefreshStatus(jobStatus)
        ? jobStatus === "failed"
          ? "failed"
          : "degraded"
        : "queued"
      : huggingFaceUnavailable
      ? "degraded"
      : "completed";

  return [
    {
      detail:
        summarizeRecords(providerResults, "providerId") ||
        "Provider refresh completed without itemized provider results.",
      id: "providers",
      status: statusFromRecords(providerResults, readStatus(job.status)),
      title: "Provider Admin APIs"
    },
    {
      detail:
        !includeHuggingFaceRefresh
          ? "Candidate refresh was not requested."
          : huggingFaceCandidateSetId === null
          ? "Candidate refresh has not reported a candidate set yet."
          : huggingFaceUnavailable
          ? "Candidate set unavailable for this refresh."
          : "Candidate refresh request completed.",
      id: "huggingface",
      status: huggingFaceStatus,
      title: "Hugging Face candidates"
    },
    {
      detail: forensicStepDetail(forensicRun, reviewerArtifacts),
      id: "forensics",
      status: statusFromRecords(
        reviewerArtifacts,
        forensicRun ? readStatus(forensicRun.status) : readStatus(job.status)
      ),
      title: "Forensic reviewers"
    },
    {
      detail: "Reloading dashboard snapshots from refreshed report files.",
      id: "snapshots",
      status: "running",
      title: "Report snapshot reload"
    }
  ];
}

function forensicStepDetail(
  forensicRun: Record<string, unknown> | null,
  reviewerArtifacts: Record<string, unknown>[]
): string {
  if (forensicRun && bridgeExecutorWasNotConfigured(forensicRun)) {
    const reviewerNames = reviewerArtifacts
      .map((artifact) => readStringField(artifact, "reviewerModel"))
      .filter((value): value is string => value !== null);
    const reviewerList = reviewerNames.length > 0 ? `${humanList(reviewerNames)} ` : "";
    return `Bridge forensic executor was not configured; ${reviewerList}were not dispatched.`;
  }

  return (
    summarizeRecords(reviewerArtifacts, "reviewerModel") ||
    (forensicRun
      ? `Forensic run ${readStatus(forensicRun.status) ?? "completed"}.`
      : "No forensic run was returned for this refresh.")
  );
}

function bridgeExecutorWasNotConfigured(forensicRun: Record<string, unknown>): boolean {
  if (readStringField(forensicRun, "degradedReason") === "bridge_forensic_executor_not_configured") {
    return true;
  }

  const bridgeDispatch = forensicRun.bridgeDispatch;
  return isRecord(bridgeDispatch) && bridgeDispatch.status === "not_configured";
}

function humanList(values: string[]): string {
  if (values.length <= 2) return values.join(", ");
  return `${values.slice(0, -1).join(", ")}, ${values[values.length - 1]}`;
}

function updateRefreshStep(
  steps: RefreshProgressStep[],
  id: RefreshStepId,
  patch: Partial<Pick<RefreshProgressStep, "detail" | "status">>
): RefreshProgressStep[] {
  return steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStatus(value: unknown): RefreshStepStatus | null {
  if (value === "completed" || value === "degraded" || value === "failed") {
    return value;
  }
  if (value === "running" || value === "queued") return value;
  return null;
}

function isTerminalRefreshStatus(status: string): boolean {
  return status === "completed" || status === "degraded" || status === "failed";
}

function readStringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" ? value : null;
}

function statusFromRecords(
  records: Record<string, unknown>[],
  fallback: RefreshStepStatus | null
): RefreshStepStatus {
  const statuses = records.map((record) => readStatus(record.status)).filter(Boolean);
  if (statuses.includes("running")) return "running";
  if (statuses.includes("queued")) return fallback && fallback !== "completed" ? fallback : "queued";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) {
    return "completed";
  }
  return fallback ?? "completed";
}

function summarizeRecords(records: Record<string, unknown>[], labelField: string): string {
  return records
    .map((record) => {
      const label = record[labelField];
      const status = readStatus(record.status);
      const reason =
        status === "failed" || status === "degraded"
          ? refreshStatusReasonLabel(readStringField(record, "degradedReason"))
          : null;
      return typeof label === "string" && status
        ? `${label} ${status}${reason ? ` (${reason})` : ""}`
        : null;
    })
    .filter((value): value is string => value !== null)
    .join("; ");
}

function refreshStatusReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  const reasonLabels: Record<string, string> = {
    bridge_forensic_executor_not_configured: "bridge not configured",
    bridge_forensic_provider_unavailable: "provider unavailable",
    sdlca_bridge_forensic_execute_failed_500: "bridge execute failed",
    sdlca_bridge_forensic_execute_timeout: "bridge execute timed out",
    sdlca_bridge_forensic_output_parse_failed: "bridge output parse failed",
    sdlca_bridge_forensic_result_invalid: "invalid reviewer result"
  };
  return reasonLabels[reason] ?? reason.replaceAll("_", " ");
}

function statusLabel(status: RefreshStepStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function refreshProgressPercent(steps: RefreshProgressStep[]): number {
  if (steps.length === 0) return 0;
  const score = steps.reduce((total, step) => {
    if (step.status === "completed") return total + 1;
    if (step.status === "degraded") return total + 0.85;
    if (step.status === "failed") return total + 0.7;
    if (step.status === "running") return total + 0.45;
    return total;
  }, 0);
  return Math.round((score / steps.length) * 100);
}
