import type { HuggingFaceCandidateSet } from "./huggingFaceCandidates";
import type { LocalSessionDistribution } from "./localSessionDistribution";
import { buildLocalModelReport, type LocalModelMigrationReport } from "./localModelReport";
import type { ProviderReportSummary } from "./types";

export type ReportExportFormat =
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "json"
  | "yaml"
  | "database";

export type SqlDialect = "sqlite" | "postgresql" | "mysql" | "mssql" | "oracle";

export interface ReportExportOption {
  value: ReportExportFormat;
  label: string;
}

export interface SqlDialectOption {
  value: SqlDialect;
  label: string;
}

export interface ReportExportRow {
  providerId: string;
  providerName: string;
  billingType: "SEAT-BASED" | "ACTUAL";
  modelId: string;
  modelName: string;
  contextWindow: number | null;
  snapshotId: string;
  snapshotDate: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  requestsCount: number;
  totalCost: number;
}

export interface ReportExportFile {
  filename: string;
  mimeType: string;
  payload: string | Uint8Array;
}

export interface ReportForensicRun {
  bridgeDispatch?: Record<string, unknown>;
  parentSynthesis?: {
    confidence?: number;
    dissentingFindings?: Array<Record<string, unknown>>;
    recommendation?: string;
    reviewerCount?: number;
  };
  reviewerArtifacts?: Array<Record<string, unknown>>;
  runId?: string;
  status?: string;
  updatedAt?: string;
}

export interface ReportExportContext {
  distribution?: LocalSessionDistribution | null;
  forensicRun?: ReportForensicRun | null;
  huggingFaceCandidateSet?: HuggingFaceCandidateSet | null;
  summaries: ProviderReportSummary[];
}

export const REPORT_EXPORT_OPTIONS: ReportExportOption[] = [
  { value: "pdf", label: "PDF of reports" },
  { value: "docx", label: "DOCX" },
  { value: "xlsx", label: "XLSX" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "database", label: "Database SQL" }
];

export const SQL_DIALECT_OPTIONS: SqlDialectOption[] = [
  { value: "sqlite", label: "SQLite" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "mysql", label: "MySQL" },
  { value: "mssql", label: "MSSQL" },
  { value: "oracle", label: "Oracle" }
];

const EXPORT_COLUMNS = [
  "provider_id",
  "provider_name",
  "billing_type",
  "model_id",
  "model_name",
  "context_window",
  "snapshot_id",
  "snapshot_date",
  "input_tokens",
  "output_tokens",
  "cache_read_tokens",
  "cache_creation_tokens",
  "requests_count",
  "total_cost"
] as const;

type RowValue = string | number | null;

const textEncoder = new TextEncoder();

export function buildReportExportRows(
  summaries: ProviderReportSummary[]
): ReportExportRow[] {
  return summaries.map((summary) => {
    const snapshotDate = summary.reportEndDay;
    const modelName = "aggregate-28-day";
    const modelId = `${summary.providerId}:${modelName}`;

    return {
      providerId: summary.providerId,
      providerName: summary.providerLabel,
      billingType: seatBasedProviderIds.has(summary.providerId) ? "SEAT-BASED" : "ACTUAL",
      modelId,
      modelName,
      contextWindow: null,
      snapshotId: `${summary.providerId}:${snapshotDate}`,
      snapshotDate,
      inputTokens: getInputTokens(summary),
      outputTokens: numberField(summary, "outputTokens"),
      cacheReadTokens: numberField(summary, "cacheReadTokens"),
      cacheCreationTokens: getCacheCreationTokens(summary),
      requestsCount: getRequestCount(summary),
      totalCost: roundMoney(summary.spendProjection.totalUsd)
    };
  });
}

export function createReportExport(
  reportInput: ProviderReportSummary[] | ReportExportContext,
  format: ReportExportFormat,
  dialect: SqlDialect = "sqlite"
): ReportExportFile {
  const context = normalizeReportContext(reportInput);
  const rows = buildReportExportRows(context.summaries);
  const report = buildReportExportBreakdowns(context, rows);
  const textReportLines = buildTextReportLines(report);
  const dateStamp = new Date().toISOString().slice(0, 10);

  switch (format) {
    case "pdf":
      return {
        filename: `token-report-${dateStamp}.pdf`,
        mimeType: "application/pdf",
        payload: createPdf(textReportLines)
      };
    case "docx":
      return {
        filename: `token-report-${dateStamp}.docx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        payload: createDocx(textReportLines)
      };
    case "xlsx":
      return {
        filename: `token-report-${dateStamp}.xlsx`,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        payload: createXlsx(rows, report)
      };
    case "csv":
      return {
        filename: `token-report-${dateStamp}.csv`,
        mimeType: "text/csv",
        payload: createCsv(rows, report)
      };
    case "json":
      return {
        filename: `token-report-${dateStamp}.json`,
        mimeType: "application/json",
        payload: JSON.stringify({ generatedAt: new Date().toISOString(), report, rows }, null, 2)
      };
    case "yaml":
      return {
        filename: `token-report-${dateStamp}.yaml`,
        mimeType: "application/yaml",
        payload: createYaml(rows, report)
      };
    case "database":
      return {
        filename: `token-report-database-${dateStamp}.sql`,
        mimeType: "application/sql",
        payload: generateDatabaseSql(rows, dialect)
      };
  }
}

export function downloadReportExport(
  reportInput: ProviderReportSummary[] | ReportExportContext,
  format: ReportExportFormat,
  dialect: SqlDialect = "sqlite"
): void {
  const exportFile = createReportExport(reportInput, format, dialect);
  const blobPart =
    typeof exportFile.payload === "string"
      ? exportFile.payload
      : bytesToArrayBuffer(exportFile.payload);
  const blob = new Blob([blobPart], { type: exportFile.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = exportFile.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function generateDatabaseSql(
  rows: ReportExportRow[],
  dialect: SqlDialect
): string {
  return [
    databaseInjectionComment(dialect),
    createSchemaSql(dialect),
    ...rows.flatMap((row) => [
      upsertProviderSql(row, dialect),
      upsertModelSql(row, dialect),
      upsertSnapshotSql(row, dialect)
    ])
  ].join("\n\n");
}

const seatBasedProviderIds = new Set(["github-copilot", "claude-code"]);

function normalizeReportContext(
  reportInput: ProviderReportSummary[] | ReportExportContext
): ReportExportContext {
  return Array.isArray(reportInput) ? { summaries: reportInput } : reportInput;
}

interface ReportExportBreakdowns {
  forensic: {
    bridgeDispatch?: Record<string, unknown>;
    parentSynthesis?: ReportForensicRun["parentSynthesis"];
    reviewerArtifacts: Array<Record<string, unknown>>;
    runId: string | null;
    status: string | null;
    updatedAt: string | null;
  };
  localModelMigration: {
    appliedForensicGuidance: LocalModelMigrationReport["appliedForensicGuidance"];
    contextConfidence: LocalModelMigrationReport["contextConfidence"];
    dailyAvgComputeTokens: number;
    estimatedContextWindowNeeded: number | null;
    huggingFaceCandidateSetId: string | null;
    huggingFaceGeneratedAt: string | null;
    localDistribution: LocalSessionDistribution | null;
    profiles: Array<{
      commercialSafe: boolean;
      contextFits: boolean;
      contextWindow: number;
      hfDownloads?: number;
      hfLastModified?: string;
      hfLikes?: number;
      hfRepoId: string;
      forensicInterpretation?: string;
      license: string;
      name: string;
      note: string;
      parameterCount: string;
      throughputFits: boolean;
      tier: string;
      tokensPerSecEstimate: number;
      vramGbMin: number;
    }>;
    recommendedProfile: string | null;
    requiredTokensPerSec: number;
    totalCacheCreationTokens: number;
    totalCacheReadTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalPureComputeTokens: number;
    windowDays: number;
    workloadGap: LocalModelMigrationReport["workloadGap"];
  };
  providerSnapshots: ReportExportRow[];
  spendProjections: Array<{
    annualFlatUsd: number;
    costSource: string;
    dailyAvgUsd: number;
    monthlyFlatUsd: number;
    providerId: string;
    providerName: string;
    totalUsd: number;
    trend: string;
    trendedAnnualUsd: number | null;
    trendedMonthlyUsd: number | null;
  }>;
}

function buildReportExportBreakdowns(
  context: ReportExportContext,
  rows: ReportExportRow[]
): ReportExportBreakdowns {
  const localModelReport = buildLocalModelReport(
    context.summaries,
    context.distribution ?? null,
    context.huggingFaceCandidateSet ?? null,
    context.forensicRun ?? null
  );

  return {
    forensic: summarizeForensicRun(context.forensicRun ?? null),
    localModelMigration: {
      appliedForensicGuidance: localModelReport.appliedForensicGuidance,
      contextConfidence: localModelReport.contextConfidence,
      dailyAvgComputeTokens: localModelReport.dailyAvgComputeTokens,
      estimatedContextWindowNeeded: localModelReport.estimatedContextWindowNeeded,
      huggingFaceCandidateSetId: context.huggingFaceCandidateSet?.candidateSetId ?? null,
      huggingFaceGeneratedAt: context.huggingFaceCandidateSet?.generatedAt ?? null,
      localDistribution: context.distribution ?? null,
      profiles: localModelReport.profiles.map((profile) => ({
        commercialSafe: profile.commercialSafe,
        contextFits: profile.contextFits,
        contextWindow: profile.contextWindow,
        hfDownloads: profile.hfDownloads,
        hfLastModified: profile.hfLastModified,
        hfLikes: profile.hfLikes,
        hfRepoId: profile.hfRepoId,
        forensicInterpretation: profile.forensicInterpretation,
        license: profile.license,
        name: profile.name,
        note: profile.note,
        parameterCount: profile.parameterCount,
        throughputFits: profile.throughputFits,
        tier: profile.tier,
        tokensPerSecEstimate: profile.tokensPerSecEstimate,
        vramGbMin: profile.vramGbMin
      })),
      recommendedProfile: localModelReport.recommendedProfile?.name ?? null,
      requiredTokensPerSec: localModelReport.requiredTokensPerSec,
      totalCacheCreationTokens: localModelReport.totalCacheCreationTokens,
      totalCacheReadTokens: localModelReport.totalCacheReadTokens,
      totalInputTokens: localModelReport.totalInputTokens,
      totalOutputTokens: localModelReport.totalOutputTokens,
      totalPureComputeTokens: localModelReport.totalPureComputeTokens,
      windowDays: localModelReport.windowDays,
      workloadGap: localModelReport.workloadGap
    },
    providerSnapshots: rows,
    spendProjections: context.summaries.map((summary) => ({
      annualFlatUsd: roundMoney(summary.spendProjection.projectedAnnualUsd),
      costSource: summary.spendProjection.costSource,
      dailyAvgUsd: roundMoney(summary.spendProjection.dailyAvgUsd),
      monthlyFlatUsd: roundMoney(summary.spendProjection.projectedMonthlyUsd),
      providerId: summary.providerId,
      providerName: summary.providerLabel,
      totalUsd: roundMoney(summary.spendProjection.totalUsd),
      trend: summary.spendProjection.trend,
      trendedAnnualUsd:
        summary.spendProjection.trendedAnnualUsd === null
          ? null
          : roundMoney(summary.spendProjection.trendedAnnualUsd),
      trendedMonthlyUsd:
        summary.spendProjection.trendedMonthlyUsd === null
          ? null
          : roundMoney(summary.spendProjection.trendedMonthlyUsd)
    }))
  };
}

function summarizeForensicRun(
  forensicRun: ReportForensicRun | null
): ReportExportBreakdowns["forensic"] {
  if (!forensicRun) {
    return {
      reviewerArtifacts: [],
      runId: null,
      status: null,
      updatedAt: null
    };
  }

  return {
    bridgeDispatch: forensicRun.bridgeDispatch,
    parentSynthesis: forensicRun.parentSynthesis,
    reviewerArtifacts: (forensicRun.reviewerArtifacts ?? []).map((artifact) => ({
      artifactUri: readStringField(artifact, "artifactUri"),
      bridgeProviderKind: readStringField(artifact, "bridgeProviderKind"),
      degradedReason: readStringField(artifact, "degradedReason"),
      reviewerModel: readStringField(artifact, "reviewerModel"),
      status: readStringField(artifact, "status")
    })),
    runId: forensicRun.runId ?? null,
    status: forensicRun.status ?? null,
    updatedAt: forensicRun.updatedAt ?? null
  };
}

function numberField(summary: ProviderReportSummary, key: string): number {
  const value = (summary as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getInputTokens(summary: ProviderReportSummary): number {
  if (summary.providerId === "github-copilot") {
    return numberField(summary, "cliInputTokens");
  }
  return numberField(summary, "inputTokens");
}

function getCacheCreationTokens(summary: ProviderReportSummary): number {
  if (summary.providerId === "cursor") {
    return numberField(summary, "cacheWriteTokens");
  }
  return numberField(summary, "cacheCreationTokens");
}

function getRequestCount(summary: ProviderReportSummary): number {
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

  return summary.comparisonMetric.unit === "requests" &&
    typeof summary.comparisonMetric.value === "number"
    ? summary.comparisonMetric.value
    : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function rowValues(row: ReportExportRow): RowValue[] {
  return [
    row.providerId,
    row.providerName,
    row.billingType,
    row.modelId,
    row.modelName,
    row.contextWindow,
    row.snapshotId,
    row.snapshotDate,
    row.inputTokens,
    row.outputTokens,
    row.cacheReadTokens,
    row.cacheCreationTokens,
    row.requestsCount,
    row.totalCost
  ];
}

function createCsv(rows: ReportExportRow[], report?: ReportExportBreakdowns): string {
  const lines = [
    EXPORT_COLUMNS.join(","),
    ...rows.map((row) => rowValues(row).map(csvCell).join(","))
  ];

  if (report) {
    lines.push("");
    lines.push(["section", "record_type", "field", "value"].join(","));
    for (const projection of report.spendProjections) {
      lines.push(
        ["spend_projections", projection.providerId, "monthly_flat_usd", projection.monthlyFlatUsd]
          .map(csvCell)
          .join(",")
      );
      lines.push(
        ["spend_projections", projection.providerId, "annual_flat_usd", projection.annualFlatUsd]
          .map(csvCell)
          .join(",")
      );
    }
    lines.push(
      ["local_model_migration", "sizing", "required_tokens_per_sec", report.localModelMigration.requiredTokensPerSec]
        .map(csvCell)
        .join(",")
    );
    lines.push(
      ["local_model_migration", "sizing", "estimated_context_window_needed", report.localModelMigration.estimatedContextWindowNeeded]
        .map(csvCell)
        .join(",")
    );
    if (report.localModelMigration.appliedForensicGuidance) {
      lines.push(
        [
          "local_model_migration",
          "applied_forensic_guidance",
          "routing_strategy",
          report.localModelMigration.appliedForensicGuidance.routingStrategy
        ]
          .map(csvCell)
          .join(",")
      );
      lines.push(
        [
          "local_model_migration",
          "applied_forensic_guidance",
          "impact_summary",
          report.localModelMigration.appliedForensicGuidance.impactSummary
        ]
          .map(csvCell)
          .join(",")
      );
    }
    for (const profile of report.localModelMigration.profiles) {
      lines.push(
        ["on_prem_model_profiles", profile.hfRepoId, "context_fits", String(profile.contextFits)]
          .map(csvCell)
          .join(",")
      );
      lines.push(
        ["on_prem_model_profiles", profile.hfRepoId, "throughput_fits", String(profile.throughputFits)]
          .map(csvCell)
          .join(",")
      );
      if (profile.forensicInterpretation) {
        lines.push(
          ["on_prem_model_profiles", profile.hfRepoId, "forensic_interpretation", profile.forensicInterpretation]
            .map(csvCell)
            .join(",")
        );
      }
    }
    if (report.forensic.runId) {
      lines.push(
        ["forensic_reviewer_consensus", report.forensic.runId, "status", report.forensic.status]
          .map(csvCell)
          .join(",")
      );
      lines.push(
        [
          "forensic_reviewer_consensus",
          report.forensic.runId,
          "recommendation",
          report.forensic.parentSynthesis?.recommendation ?? ""
        ]
          .map(csvCell)
          .join(",")
      );
    }
  }

  return lines.join("\n");
}

function csvCell(value: RowValue): string {
  if (value === null) return "";
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll("\"", "\"\"")}"` : raw;
}

function createYaml(rows: ReportExportRow[], report?: ReportExportBreakdowns): string {
  const lines = [`generatedAt: ${new Date().toISOString()}`, "rows:"];
  for (const row of rows) {
    lines.push(`  - providerId: ${yamlValue(row.providerId)}`);
    lines.push(`    providerName: ${yamlValue(row.providerName)}`);
    lines.push(`    billingType: ${yamlValue(row.billingType)}`);
    lines.push(`    modelId: ${yamlValue(row.modelId)}`);
    lines.push(`    modelName: ${yamlValue(row.modelName)}`);
    lines.push(`    contextWindow: ${yamlValue(row.contextWindow)}`);
    lines.push(`    snapshotId: ${yamlValue(row.snapshotId)}`);
    lines.push(`    snapshotDate: ${yamlValue(row.snapshotDate)}`);
    lines.push(`    inputTokens: ${row.inputTokens}`);
    lines.push(`    outputTokens: ${row.outputTokens}`);
    lines.push(`    cacheReadTokens: ${row.cacheReadTokens}`);
    lines.push(`    cacheCreationTokens: ${row.cacheCreationTokens}`);
    lines.push(`    requestsCount: ${row.requestsCount}`);
    lines.push(`    totalCost: ${row.totalCost}`);
  }
  if (report) {
    lines.push("report:");
    lines.push("  spendProjections:");
    for (const projection of report.spendProjections) {
      lines.push(`    - providerId: ${yamlValue(projection.providerId)}`);
      lines.push(`      providerName: ${yamlValue(projection.providerName)}`);
      lines.push(`      totalUsd: ${projection.totalUsd}`);
      lines.push(`      monthlyFlatUsd: ${projection.monthlyFlatUsd}`);
      lines.push(`      annualFlatUsd: ${projection.annualFlatUsd}`);
    }
    lines.push("  localModelMigration:");
    if (report.localModelMigration.appliedForensicGuidance) {
      lines.push("    appliedForensicGuidance:");
      lines.push(
        `      runId: ${yamlValue(report.localModelMigration.appliedForensicGuidance.runId)}`
      );
      lines.push(
        `      routingStrategy: ${yamlValue(report.localModelMigration.appliedForensicGuidance.routingStrategy)}`
      );
      lines.push(
        `      impactSummary: ${yamlValue(report.localModelMigration.appliedForensicGuidance.impactSummary)}`
      );
    }
    lines.push(
      `    huggingFaceCandidateSetId: ${yamlValue(report.localModelMigration.huggingFaceCandidateSetId)}`
    );
    lines.push(`    contextConfidence: ${yamlValue(report.localModelMigration.contextConfidence)}`);
    lines.push(
      `    estimatedContextWindowNeeded: ${yamlValue(report.localModelMigration.estimatedContextWindowNeeded)}`
    );
    lines.push(`    requiredTokensPerSec: ${report.localModelMigration.requiredTokensPerSec}`);
    lines.push("    profiles:");
    for (const profile of report.localModelMigration.profiles) {
      lines.push(`      - name: ${yamlValue(profile.name)}`);
      lines.push(`        hfRepoId: ${yamlValue(profile.hfRepoId)}`);
      lines.push(`        contextFits: ${profile.contextFits}`);
      lines.push(`        throughputFits: ${profile.throughputFits}`);
      lines.push(`        tokensPerSecEstimate: ${profile.tokensPerSecEstimate}`);
      if (profile.forensicInterpretation) {
        lines.push(
          `        forensicInterpretation: ${yamlValue(profile.forensicInterpretation)}`
        );
      }
    }
    lines.push("  forensic:");
    lines.push(`    runId: ${yamlValue(report.forensic.runId)}`);
    lines.push(`    status: ${yamlValue(report.forensic.status)}`);
    lines.push(
      `    recommendation: ${yamlValue(report.forensic.parentSynthesis?.recommendation ?? null)}`
    );
    lines.push(
      `    reviewerCount: ${yamlValue(report.forensic.parentSynthesis?.reviewerCount ?? null)}`
    );
  }
  return `${lines.join("\n")}\n`;
}

function yamlValue(value: RowValue): string {
  if (value === null) return "null";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function buildTextReportLines(report: ReportExportBreakdowns): string[] {
  const lines = [
    "Token Consumption Report",
    `Generated ${new Date().toISOString()}`,
    "",
    "Activity breakdown",
    ...report.providerSnapshots.map(
      (row) =>
        `${row.providerName}: input ${formatNumber(row.inputTokens)}, cache read ${formatNumber(
          row.cacheReadTokens
        )}, cache creation ${formatNumber(row.cacheCreationTokens)}, output ${formatNumber(
          row.outputTokens
        )}, requests ${formatNumber(row.requestsCount)}, cost ${formatCurrency(row.totalCost)}`
    ),
    "",
    "Spend projections",
    ...report.spendProjections.map(
      (projection) =>
        `${projection.providerName}: ${formatCurrency(projection.totalUsd)} total, ${formatCurrency(
          projection.dailyAvgUsd
        )}/day, ${formatCurrency(projection.monthlyFlatUsd)}/month flat, ${formatCurrency(
          projection.annualFlatUsd
        )}/year flat, trend ${projection.trend} (${projection.costSource})`
    ),
    "",
    "Local model migration sizing",
    `Aggregated token load across providers - ${report.localModelMigration.windowDays}-day window`,
    `Input tokens: ${formatNumber(report.localModelMigration.totalInputTokens)}`,
    `Output tokens: ${formatNumber(report.localModelMigration.totalOutputTokens)}`,
    `Cache creation tokens: ${formatNumber(report.localModelMigration.totalCacheCreationTokens)}`,
    `Cache read tokens: ${formatNumber(report.localModelMigration.totalCacheReadTokens)}`,
    `Pure compute tokens: ${formatNumber(report.localModelMigration.totalPureComputeTokens)}`,
    `Daily average compute: ${formatNumber(Math.round(report.localModelMigration.dailyAvgComputeTokens))}`,
    `Hugging Face candidate set: ${report.localModelMigration.huggingFaceCandidateSetId ?? "not available"}`,
    ...appliedForensicGuidanceLines(report.localModelMigration.appliedForensicGuidance),
    "",
    "Server sizing heuristics",
    `Required throughput: ${report.localModelMigration.requiredTokensPerSec.toFixed(1)} tok/s`,
    `Context window needed: ${
      report.localModelMigration.estimatedContextWindowNeeded === null
        ? "unknown"
        : `${formatNumber(report.localModelMigration.estimatedContextWindowNeeded)} tokens`
    }`,
    `Context confidence: ${report.localModelMigration.contextConfidence}`,
    ...localDistributionLines(report.localModelMigration.localDistribution),
    ...appliedForensicSizingLines(report.localModelMigration.appliedForensicGuidance),
    "",
    "On-prem model profiles",
    ...report.localModelMigration.profiles.flatMap((profile) => [
      `${profile.name} (${profile.parameterCount}) - ${profile.hfRepoId}`,
      `  Tier ${profile.tier}; context ${formatNumber(profile.contextWindow)}; VRAM ${profile.vramGbMin} GB; throughput ~${profile.tokensPerSecEstimate} tok/s`,
      `  Fit: context ${profile.contextFits ? "yes" : "no"}; throughput ${
        profile.throughputFits ? "yes" : "no"
      }; license ${profile.license}; commercial ${profile.commercialSafe ? "yes" : "no"}`,
      `  HF: downloads ${formatOptionalNumber(profile.hfDownloads)}, likes ${formatOptionalNumber(
        profile.hfLikes
      )}, updated ${profile.hfLastModified ?? "unknown"}`,
      ...(profile.forensicInterpretation
        ? [`  Forensic interpretation: ${profile.forensicInterpretation}`]
        : []),
      `  ${profile.note}`
    ]),
    "",
    "Forensic reviewer consensus",
    `Run: ${report.forensic.runId ?? "not available"}; status: ${report.forensic.status ?? "not available"}; updated: ${
      report.forensic.updatedAt ?? "not available"
    }`,
    `Recommendation: ${report.forensic.parentSynthesis?.recommendation ?? "not available"}`,
    `Confidence: ${formatOptionalNumber(report.forensic.parentSynthesis?.confidence)}; reviewers: ${formatOptionalNumber(
      report.forensic.parentSynthesis?.reviewerCount
    )}`,
    ...report.forensic.reviewerArtifacts.map(
      (artifact) =>
        `Reviewer ${readStringField(artifact, "reviewerModel") ?? "unknown"} via ${
          readStringField(artifact, "bridgeProviderKind") ?? "unknown"
        }: ${readStringField(artifact, "status") ?? "unknown"}${
          readStringField(artifact, "degradedReason")
            ? ` (${readStringField(artifact, "degradedReason")})`
            : ""
        }`
    ),
    ...forensicFindingLines(report.forensic.parentSynthesis?.dissentingFindings ?? [])
  ];

  return lines.map(asciiText);
}

function appliedForensicGuidanceLines(
  guidance: LocalModelMigrationReport["appliedForensicGuidance"]
): string[] {
  if (!guidance) return [];

  return [
    "Forensic impact: partial local migration",
    `Applied forensic guidance: ${guidance.impactSummary}`,
    `Applied sections: ${guidance.appliedSections.join(", ")}`,
    `Forensic run: ${guidance.runId ?? "not available"}; confidence: ${formatOptionalNumber(guidance.confidence ?? undefined)}; reviewers: ${formatOptionalNumber(
      guidance.reviewerCount ?? undefined
    )}`
  ];
}

function appliedForensicSizingLines(
  guidance: LocalModelMigrationReport["appliedForensicGuidance"]
): string[] {
  if (!guidance) return [];

  return [
    `Forensic routing strategy: ${guidance.routingStrategy}`,
    `Local scope: ${guidance.localWorkloadScope}`,
    `Hosted guardrail: ${guidance.hostedWorkloadScope}`
  ];
}

function localDistributionLines(distribution: LocalSessionDistribution | null): string[] {
  if (!distribution) return ["Local session distribution: not available"];

  return [
    `Local session distribution: ${formatNumber(distribution.combined.sampleCount)} samples; p95 ${formatNumber(
      Math.round(distribution.combined.p95)
    )}; p99 ${formatNumber(Math.round(distribution.combined.p99))}; max ${formatNumber(
      Math.round(distribution.combined.max)
    )}`,
    `Distribution generated: ${distribution.generatedAt}`
  ];
}

function forensicFindingLines(findings: Array<Record<string, unknown>>): string[] {
  if (findings.length === 0) return [];

  return [
    "Forensic dissenting findings",
    ...findings.map((finding) => {
      const title = readStringField(finding, "title") ?? "Untitled finding";
      const severity = readStringField(finding, "severity") ?? "unknown";
      const details = readStringField(finding, "details") ?? "";
      return `${severity.toUpperCase()}: ${title} - ${details}`;
    })
  ];
}

function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatOptionalNumber(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? formatNumber(value) : "unknown";
}

function wrapTextLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length > maxChars) {
      lines.push(current);
      current = word;
      continue;
    }
    current = `${current} ${word}`;
  }
  if (current) lines.push(current);
  return lines;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function readStringField(value: Record<string, unknown>, field: string): string | null {
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

function asciiText(value: string): string {
  const normalized = value
    .replaceAll("≥", ">=")
    .replaceAll("≤", "<=")
    .replaceAll("×", "x")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("✓", "yes")
    .replaceAll("✗", "no")
    .replaceAll("○", "o")
    .replaceAll("★", "*");

  return Array.from(normalized)
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === 9 || codePoint === 10 || codePoint === 13 || (codePoint !== undefined && codePoint >= 32 && codePoint <= 126);
    })
    .join("");
}

function createPdf(lines: string[]): Uint8Array {
  const wrappedLines = lines.flatMap((line) => wrapTextLine(line, 92));
  const pages = chunk(wrappedLines, 54);
  const pageObjectStart = 4;
  const contentObjectStart = pageObjectStart + pages.length;
  const pageObjectIds = pages.map((_, index) => pageObjectStart + index);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pages.map((_, index) => {
      const contentId = contentObjectStart + index;
      return `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    }),
    ...pages.map((pageLines) => {
      const textCommands = pageLines
        .map((line, index) => `1 0 0 1 44 ${760 - index * 13} Tm (${pdfText(line)}) Tj`)
        .join("\n");
      const stream = `BT /F1 9 Tf 11 TL ${textCommands} ET`;
      return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    })
  ];
  return textEncoder.encode(buildPdfDocument(objects));
}

function buildPdfDocument(objects: string[]): string {
  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

function pdfText(value: string): string {
  return value.replace(/[\\()]/g, "\\$&");
}

function createDocx(paragraphs: string[]): Uint8Array {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((text) => `<w:p><w:r><w:t>${xmlText(text)}</w:t></w:r></w:p>`).join("\n    ")}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  return createZip([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
    },
    { path: "word/document.xml", content: documentXml }
  ]);
}

function createXlsx(rows: ReportExportRow[], report?: ReportExportBreakdowns): Uint8Array {
  const sheetRows = [EXPORT_COLUMNS, ...rows.map(rowValues)];

  if (report) {
    sheetRows.push([], ["Report breakdowns"], ...buildTextReportLines(report).map((line) => [line]));
  }

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows.map((row, rowIndex) => createSheetRow(row, rowIndex + 1)).join("\n    ")}
  </sheetData>
</worksheet>`;

  return createZip([
    {
      path: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`
    },
    {
      path: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      path: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Token Report" sheetId="1" r:id="rId1"/></sheets>
</workbook>`
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`
    },
    { path: "xl/worksheets/sheet1.xml", content: sheetXml }
  ]);
}

function createSheetRow(values: readonly RowValue[], rowNumber: number): string {
  const cells = values
    .map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
      const text = value === null ? "" : String(value);
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlText(text)}</t></is></c>`;
    })
    .join("");
  return `<row r="${rowNumber}">${cells}</row>`;
}

function columnName(index: number): string {
  let value = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function xmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

interface ZipEntryInput {
  path: string;
  content: string;
}

interface ZipEntryRecord {
  pathBytes: Uint8Array;
  contentBytes: Uint8Array;
  crc: number;
  offset: number;
}

function createZip(files: ZipEntryInput[]): Uint8Array {
  const records: ZipEntryRecord[] = [];
  const localParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const pathBytes = textEncoder.encode(file.path);
    const contentBytes = textEncoder.encode(file.content);
    const crc = crc32(contentBytes);
    const local = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(contentBytes.length),
      u32(contentBytes.length),
      u16(pathBytes.length),
      u16(0),
      pathBytes,
      contentBytes
    ]);

    records.push({ pathBytes, contentBytes, crc, offset });
    localParts.push(local);
    offset += local.length;
  }

  const centralParts = records.map((record) =>
    concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(record.crc),
      u32(record.contentBytes.length),
      u32(record.contentBytes.length),
      u16(record.pathBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(record.offset),
      record.pathBytes
    ])
  );
  const centralDirectory = concatBytes(centralParts);
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(records.length),
    u16(records.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return concatBytes([...localParts, centralDirectory, end]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  const view = new DataView(out.buffer);
  view.setUint16(0, value, true);
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  return out;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let current = i;
    for (let j = 0; j < 8; j += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[i] = current >>> 0;
  }
  crcTable = table;
  return table;
}

function databaseInjectionComment(dialect: SqlDialect): string {
  return `/*
Programmatic injection note:
This export is generated from the dashboard's normalized summary rows. In a
backend implementation, keep the dialect rules in a key-value map and stitch
the chosen rule into one prompt when the user switches the database option.

Example:
const syntaxRules = {
  sqlite: "INSERT INTO ... ON CONFLICT(id) DO UPDATE SET",
  postgresql: "INSERT INTO ... ON CONFLICT (unique_key) DO UPDATE SET EXCLUDED",
  mysql: "INSERT INTO ... ON DUPLICATE KEY UPDATE",
  mssql: "MERGE INTO target USING source ON ... WHEN MATCHED THEN UPDATE WHEN NOT MATCHED THEN INSERT",
  oracle: "MERGE INTO ... USING DUAL ON ... WHEN MATCHED THEN UPDATE WHEN NOT MATCHED THEN INSERT"
};
const prompt = [
  baseSchemaPrompt,
  "Target dialect: ${dialect}",
  syntaxRules["${dialect}"],
  JSON.stringify(snapshotRows)
].join("\\n\\n");

Selected dialect for this file: ${dialect}.
*/`;
}

function createSchemaSql(dialect: SqlDialect): string {
  switch (dialect) {
    case "sqlite":
      return `PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  billing_type TEXT NOT NULL CHECK (billing_type IN ('SEAT-BASED', 'ACTUAL'))
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  context_window INTEGER,
  UNIQUE (provider_id, model_name),
  FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  requests_count INTEGER NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  UNIQUE (model_id, snapshot_date),
  FOREIGN KEY (model_id) REFERENCES models(id)
);`;
    case "postgresql":
      return `CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  billing_type TEXT NOT NULL CHECK (billing_type IN ('SEAT-BASED', 'ACTUAL'))
);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  model_name TEXT NOT NULL,
  context_window BIGINT,
  UNIQUE (provider_id, model_name)
);

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL REFERENCES models(id),
  snapshot_date DATE NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
  requests_count BIGINT NOT NULL DEFAULT 0,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (model_id, snapshot_date)
);`;
    case "mysql":
      return `CREATE TABLE IF NOT EXISTS providers (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  billing_type VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS models (
  id VARCHAR(255) PRIMARY KEY,
  provider_id VARCHAR(128) NOT NULL,
  model_name VARCHAR(255) NOT NULL,
  context_window BIGINT NULL,
  UNIQUE KEY uq_models_provider_model (provider_id, model_name),
  CONSTRAINT fk_models_provider FOREIGN KEY (provider_id) REFERENCES providers(id)
);

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id VARCHAR(255) PRIMARY KEY,
  model_id VARCHAR(255) NOT NULL,
  snapshot_date DATE NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
  requests_count BIGINT NOT NULL DEFAULT 0,
  total_cost DECIMAL(14, 2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_snapshots_model_date (model_id, snapshot_date),
  CONSTRAINT fk_snapshots_model FOREIGN KEY (model_id) REFERENCES models(id)
);`;
    case "mssql":
      return `IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[providers]') AND type = N'U')
BEGIN
  CREATE TABLE dbo.providers (
    id NVARCHAR(128) NOT NULL PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    billing_type NVARCHAR(32) NOT NULL
  );
END;

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[models]') AND type = N'U')
BEGIN
  CREATE TABLE dbo.models (
    id NVARCHAR(255) NOT NULL PRIMARY KEY,
    provider_id NVARCHAR(128) NOT NULL,
    model_name NVARCHAR(255) NOT NULL,
    context_window BIGINT NULL,
    CONSTRAINT uq_models_provider_model UNIQUE (provider_id, model_name),
    CONSTRAINT fk_models_provider FOREIGN KEY (provider_id) REFERENCES dbo.providers(id)
  );
END;

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[usage_snapshots]') AND type = N'U')
BEGIN
  CREATE TABLE dbo.usage_snapshots (
    id NVARCHAR(255) NOT NULL PRIMARY KEY,
    model_id NVARCHAR(255) NOT NULL,
    snapshot_date DATE NOT NULL,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    cache_read_tokens BIGINT NOT NULL DEFAULT 0,
    cache_creation_tokens BIGINT NOT NULL DEFAULT 0,
    requests_count BIGINT NOT NULL DEFAULT 0,
    total_cost DECIMAL(14, 2) NOT NULL DEFAULT 0,
    CONSTRAINT uq_snapshots_model_date UNIQUE (model_id, snapshot_date),
    CONSTRAINT fk_snapshots_model FOREIGN KEY (model_id) REFERENCES dbo.models(id)
  );
END;`;
    case "oracle":
      return `BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE providers (
    id VARCHAR2(128) PRIMARY KEY,
    name VARCHAR2(255) NOT NULL,
    billing_type VARCHAR2(32) NOT NULL
  )';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE models (
    id VARCHAR2(255) PRIMARY KEY,
    provider_id VARCHAR2(128) NOT NULL,
    model_name VARCHAR2(255) NOT NULL,
    context_window NUMBER(19),
    CONSTRAINT uq_models_provider_model UNIQUE (provider_id, model_name),
    CONSTRAINT fk_models_provider FOREIGN KEY (provider_id) REFERENCES providers(id)
  )';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/

BEGIN
  EXECUTE IMMEDIATE 'CREATE TABLE usage_snapshots (
    id VARCHAR2(255) PRIMARY KEY,
    model_id VARCHAR2(255) NOT NULL,
    snapshot_date DATE NOT NULL,
    input_tokens NUMBER(19) DEFAULT 0 NOT NULL,
    output_tokens NUMBER(19) DEFAULT 0 NOT NULL,
    cache_read_tokens NUMBER(19) DEFAULT 0 NOT NULL,
    cache_creation_tokens NUMBER(19) DEFAULT 0 NOT NULL,
    requests_count NUMBER(19) DEFAULT 0 NOT NULL,
    total_cost NUMBER(14, 2) DEFAULT 0 NOT NULL,
    CONSTRAINT uq_snapshots_model_date UNIQUE (model_id, snapshot_date),
    CONSTRAINT fk_snapshots_model FOREIGN KEY (model_id) REFERENCES models(id)
  )';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLCODE != -955 THEN RAISE; END IF;
END;
/`;
  }
}

function upsertProviderSql(row: ReportExportRow, dialect: SqlDialect): string {
  switch (dialect) {
    case "sqlite":
    case "postgresql":
      return `INSERT INTO providers (id, name, billing_type)
VALUES (${sqlString(row.providerId)}, ${sqlString(row.providerName)}, ${sqlString(row.billingType)})
ON CONFLICT${conflictTarget(dialect)} DO UPDATE SET
  name = ${excluded(dialect)}.name,
  billing_type = ${excluded(dialect)}.billing_type;`;
    case "mysql":
      return `INSERT INTO providers (id, name, billing_type)
VALUES (${sqlString(row.providerId)}, ${sqlString(row.providerName)}, ${sqlString(row.billingType)})
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  billing_type = VALUES(billing_type);`;
    case "mssql":
      return `MERGE INTO dbo.providers AS target
USING (SELECT ${sqlString(row.providerId)} AS id, ${sqlString(row.providerName)} AS name, ${sqlString(row.billingType)} AS billing_type) AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET name = source.name, billing_type = source.billing_type
WHEN NOT MATCHED THEN INSERT (id, name, billing_type) VALUES (source.id, source.name, source.billing_type);`;
    case "oracle":
      return `MERGE INTO providers target
USING (SELECT ${sqlString(row.providerId)} id, ${sqlString(row.providerName)} name, ${sqlString(row.billingType)} billing_type FROM DUAL) source
ON (target.id = source.id)
WHEN MATCHED THEN UPDATE SET target.name = source.name, target.billing_type = source.billing_type
WHEN NOT MATCHED THEN INSERT (id, name, billing_type) VALUES (source.id, source.name, source.billing_type);`;
  }
}

function upsertModelSql(row: ReportExportRow, dialect: SqlDialect): string {
  switch (dialect) {
    case "sqlite":
    case "postgresql":
      return `INSERT INTO models (id, provider_id, model_name, context_window)
VALUES (${sqlString(row.modelId)}, ${sqlString(row.providerId)}, ${sqlString(row.modelName)}, ${sqlNumber(row.contextWindow)})
ON CONFLICT${conflictTarget(dialect)} DO UPDATE SET
  provider_id = ${excluded(dialect)}.provider_id,
  model_name = ${excluded(dialect)}.model_name,
  context_window = ${excluded(dialect)}.context_window;`;
    case "mysql":
      return `INSERT INTO models (id, provider_id, model_name, context_window)
VALUES (${sqlString(row.modelId)}, ${sqlString(row.providerId)}, ${sqlString(row.modelName)}, ${sqlNumber(row.contextWindow)})
ON DUPLICATE KEY UPDATE
  provider_id = VALUES(provider_id),
  model_name = VALUES(model_name),
  context_window = VALUES(context_window);`;
    case "mssql":
      return `MERGE INTO dbo.models AS target
USING (SELECT ${sqlString(row.modelId)} AS id, ${sqlString(row.providerId)} AS provider_id, ${sqlString(row.modelName)} AS model_name, ${sqlNumber(row.contextWindow)} AS context_window) AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET provider_id = source.provider_id, model_name = source.model_name, context_window = source.context_window
WHEN NOT MATCHED THEN INSERT (id, provider_id, model_name, context_window) VALUES (source.id, source.provider_id, source.model_name, source.context_window);`;
    case "oracle":
      return `MERGE INTO models target
USING (SELECT ${sqlString(row.modelId)} id, ${sqlString(row.providerId)} provider_id, ${sqlString(row.modelName)} model_name, ${sqlNumber(row.contextWindow)} context_window FROM DUAL) source
ON (target.id = source.id)
WHEN MATCHED THEN UPDATE SET target.provider_id = source.provider_id, target.model_name = source.model_name, target.context_window = source.context_window
WHEN NOT MATCHED THEN INSERT (id, provider_id, model_name, context_window) VALUES (source.id, source.provider_id, source.model_name, source.context_window);`;
  }
}

function upsertSnapshotSql(row: ReportExportRow, dialect: SqlDialect): string {
  const values = [
    sqlString(row.snapshotId),
    sqlString(row.modelId),
    sqlDate(row.snapshotDate, dialect),
    row.inputTokens,
    row.outputTokens,
    row.cacheReadTokens,
    row.cacheCreationTokens,
    row.requestsCount,
    row.totalCost
  ];
  const columns =
    "id, model_id, snapshot_date, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, requests_count, total_cost";

  switch (dialect) {
    case "sqlite":
    case "postgresql":
      return `INSERT INTO usage_snapshots (${columns})
VALUES (${values.join(", ")})
ON CONFLICT${conflictTarget(dialect)} DO UPDATE SET
  model_id = ${excluded(dialect)}.model_id,
  snapshot_date = ${excluded(dialect)}.snapshot_date,
  input_tokens = ${excluded(dialect)}.input_tokens,
  output_tokens = ${excluded(dialect)}.output_tokens,
  cache_read_tokens = ${excluded(dialect)}.cache_read_tokens,
  cache_creation_tokens = ${excluded(dialect)}.cache_creation_tokens,
  requests_count = ${excluded(dialect)}.requests_count,
  total_cost = ${excluded(dialect)}.total_cost;`;
    case "mysql":
      return `INSERT INTO usage_snapshots (${columns})
VALUES (${values.join(", ")})
ON DUPLICATE KEY UPDATE
  model_id = VALUES(model_id),
  snapshot_date = VALUES(snapshot_date),
  input_tokens = VALUES(input_tokens),
  output_tokens = VALUES(output_tokens),
  cache_read_tokens = VALUES(cache_read_tokens),
  cache_creation_tokens = VALUES(cache_creation_tokens),
  requests_count = VALUES(requests_count),
  total_cost = VALUES(total_cost);`;
    case "mssql":
      return `MERGE INTO dbo.usage_snapshots AS target
USING (SELECT ${values[0]} AS id, ${values[1]} AS model_id, ${values[2]} AS snapshot_date, ${values[3]} AS input_tokens, ${values[4]} AS output_tokens, ${values[5]} AS cache_read_tokens, ${values[6]} AS cache_creation_tokens, ${values[7]} AS requests_count, ${values[8]} AS total_cost) AS source
ON target.id = source.id
WHEN MATCHED THEN UPDATE SET model_id = source.model_id, snapshot_date = source.snapshot_date, input_tokens = source.input_tokens, output_tokens = source.output_tokens, cache_read_tokens = source.cache_read_tokens, cache_creation_tokens = source.cache_creation_tokens, requests_count = source.requests_count, total_cost = source.total_cost
WHEN NOT MATCHED THEN INSERT (${columns}) VALUES (source.id, source.model_id, source.snapshot_date, source.input_tokens, source.output_tokens, source.cache_read_tokens, source.cache_creation_tokens, source.requests_count, source.total_cost);`;
    case "oracle":
      return `MERGE INTO usage_snapshots target
USING (SELECT ${values[0]} id, ${values[1]} model_id, ${values[2]} snapshot_date, ${values[3]} input_tokens, ${values[4]} output_tokens, ${values[5]} cache_read_tokens, ${values[6]} cache_creation_tokens, ${values[7]} requests_count, ${values[8]} total_cost FROM DUAL) source
ON (target.id = source.id)
WHEN MATCHED THEN UPDATE SET target.model_id = source.model_id, target.snapshot_date = source.snapshot_date, target.input_tokens = source.input_tokens, target.output_tokens = source.output_tokens, target.cache_read_tokens = source.cache_read_tokens, target.cache_creation_tokens = source.cache_creation_tokens, target.requests_count = source.requests_count, target.total_cost = source.total_cost
WHEN NOT MATCHED THEN INSERT (${columns}) VALUES (source.id, source.model_id, source.snapshot_date, source.input_tokens, source.output_tokens, source.cache_read_tokens, source.cache_creation_tokens, source.requests_count, source.total_cost);`;
  }
}

function excluded(dialect: "sqlite" | "postgresql"): string {
  return dialect === "postgresql" ? "EXCLUDED" : "excluded";
}

function conflictTarget(dialect: "sqlite" | "postgresql"): string {
  return dialect === "postgresql" ? " (id)" : "(id)";
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNumber(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

function sqlDate(value: string, dialect: SqlDialect): string {
  if (dialect === "mssql") return `CAST(${sqlString(value)} AS DATE)`;
  if (dialect === "oracle") return `DATE ${sqlString(value)}`;
  return sqlString(value);
}
