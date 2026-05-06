import type { ProviderReportSummary } from "../lib/types";
import type { ClaudeCodeReportSummary } from "../providers/claudeCode/types";
import type { CodexReportSummary } from "../providers/codex/types";
import type { GitHubCopilotReportSummary } from "../providers/githubCopilot/types";

// Peak-to-average ratios observed in EOM April 2026 data
const CC_PEAK_FACTOR = 4.7;
const CX_PEAK_FACTOR = 4.1;
const GROWTH_FACTOR = 2.0;
const MINS_PER_8H = 8 * 60;

const QUOTA_FORM_URL =
  "https://aka.ms/oai/stuquotarequest";

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function roundUpToClean(tpm: number): number {
  const steps = [
    5_000, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 80_000,
    100_000, 120_000, 150_000, 180_000, 200_000, 250_000, 300_000,
  ];
  return steps.find((s) => s >= tpm) ?? Math.ceil(tpm / 50_000) * 50_000;
}

function parseWindowDays(label: string): number {
  const m = /^(\d+)-day window/.exec(label);
  return m ? parseInt(m[1], 10) : 28;
}

interface QuotaRow {
  azureModel: string;
  category: "anthropic" | "openai";
  replaces: string;
  peakTpm: number;
  withGrowthTpm: number;
  requestedTpm: number;
  unitRatio: number;
  capacityUnits: number;
}

function makeRow(
  azureModel: string,
  category: "anthropic" | "openai",
  replaces: string,
  peakTpm: number,
  unitRatio: number
): QuotaRow {
  const withGrowthTpm = peakTpm * GROWTH_FACTOR;
  const requestedTpm = roundUpToClean(withGrowthTpm);
  return {
    azureModel,
    category,
    replaces,
    peakTpm,
    withGrowthTpm,
    requestedTpm,
    unitRatio,
    capacityUnits: Math.ceil(requestedTpm / unitRatio),
  };
}

interface AzureQuotaPanelProps {
  summaries: ProviderReportSummary[];
}

function QuotaTable({ rows }: { rows: QuotaRow[] }) {
  return (
    <div className="quota-table-wrapper" tabIndex={0}>
      <table className="quota-table">
        <thead>
          <tr>
            <th>Azure AI Foundry Model</th>
            <th>Replaces</th>
            <th>Peak 8h TPM</th>
            <th>2× Growth</th>
            <th>Requested TPM</th>
            <th>Unit Ratio</th>
            <th className="quota-table__units">Capacity Units</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.azureModel}>
              <td className="quota-table__model">{row.azureModel}</td>
              <td className="quota-table__replaces">{row.replaces}</td>
              <td>{fmt(row.peakTpm)}</td>
              <td>{fmt(row.withGrowthTpm)}</td>
              <td className="quota-table__requested">{fmt(row.requestedTpm)}</td>
              <td className="quota-table__ratio">
                1:{(row.unitRatio / 1_000).toFixed(0)}K TPM
              </td>
              <td className="quota-table__units quota-table__units--value">
                {row.capacityUnits}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AzureQuotaPanel({ summaries }: AzureQuotaPanelProps) {
  const cc = summaries.find(
    (s) => s.providerId === "claude-code"
  ) as ClaudeCodeReportSummary | undefined;
  const gh = summaries.find(
    (s) => s.providerId === "github-copilot"
  ) as GitHubCopilotReportSummary | undefined;
  const cx = summaries.find(
    (s) => s.providerId === "codex"
  ) as CodexReportSummary | undefined;

  // ── Claude Code ─────────────────────────────────────────────────────────
  const ccActiveDays = cc ? parseWindowDays(cc.reportAgeLabel) : 1;
  const ccActiveTokens = cc
    ? cc.inputTokens + cc.outputTokens + cc.cacheCreationTokens
    : 0;
  const ccDailyAvg = ccActiveTokens / ccActiveDays;
  const ccAvgTpm = ccDailyAvg / MINS_PER_8H;
  const ccPeakTpm = ccAvgTpm * CC_PEAK_FACTOR;

  const ccHaikuTokens =
    cc?.perModelBreakdown
      .filter((m) => m.model.includes("haiku"))
      .reduce(
        (s, m) => s + m.inputTokens + m.outputTokens + m.cacheCreationTokens,
        0
      ) ?? 0;
  const ccHaikuFrac = ccActiveTokens > 0 ? ccHaikuTokens / ccActiveTokens : 0;
  const ccOpusSonnetPeak = ccPeakTpm * (1 - ccHaikuFrac);
  const ccHaikuPeak = ccPeakTpm * ccHaikuFrac;

  // ── GitHub Copilot ───────────────────────────────────────────────────────
  const ghTotal = (gh?.cliInputTokens ?? 0) + (gh?.cliOutputTokens ?? 0);
  const ghAvgTpm = ghTotal / 28 / MINS_PER_8H;

  // ── OpenAI Codex ─────────────────────────────────────────────────────────
  const cxStart = cx?.reportStartDay ?? "";
  const cxEnd = cx?.reportEndDay ?? "";
  const cxCalDays =
    cxStart && cxEnd
      ? Math.max(
          1,
          Math.round(
            (new Date(cxEnd).getTime() - new Date(cxStart).getTime()) /
              86_400_000
          ) + 1
        )
      : 28;
  const cxTotal = (cx?.inputTokens ?? 0) + (cx?.outputTokens ?? 0);
  const cxAvgTpm = cxTotal / cxCalDays / MINS_PER_8H;
  const cxPeakTpm = cxAvgTpm * CX_PEAK_FACTOR;

  const cxRealtimeToks =
    cx?.perModelBreakdown
      .filter((m) => m.model.includes("realtime"))
      .reduce((s, m) => s + m.inputTokens + m.outputTokens, 0) ?? 0;
  const cxCodexToks =
    cx?.perModelBreakdown
      .filter((m) => m.model.includes("codex"))
      .reduce((s, m) => s + m.inputTokens + m.outputTokens, 0) ?? 0;
  const cxRealtimeFrac = cxTotal > 0 ? cxRealtimeToks / cxTotal : 0;
  const cxCodexFrac = cxTotal > 0 ? cxCodexToks / cxTotal : 0;
  const cxStandardFrac = 1 - cxRealtimeFrac - cxCodexFrac;

  // ── Quota rows ────────────────────────────────────────────────────────────
  const combinedOpusSonnetPeak = ccOpusSonnetPeak + ghAvgTpm;

  const anthroRows: QuotaRow[] = [
    makeRow(
      "claude-3.7-sonnet",
      "anthropic",
      "claude-opus-4-7 · claude-sonnet-4-6 · Copilot CLI",
      combinedOpusSonnetPeak,
      1_000
    ),
    makeRow(
      "claude-3.5-haiku",
      "anthropic",
      "claude-haiku-4-5",
      ccHaikuPeak,
      1_000
    ),
  ];

  const openaiRows: QuotaRow[] = [
    makeRow(
      "gpt-4o / gpt-4.1",
      "openai",
      "gpt-5.4 · gpt-5.5",
      cxPeakTpm * cxStandardFrac,
      1_000
    ),
    makeRow(
      "o3-mini",
      "openai",
      "gpt-5.3-codex (agentic)",
      cxPeakTpm * cxCodexFrac,
      10_000
    ),
    makeRow(
      "gpt-4o-realtime-preview",
      "openai",
      "gpt-realtime-1.5 (audio)",
      cxPeakTpm * cxRealtimeFrac,
      1_000
    ),
  ];

  const allRows = [...anthroRows, ...openaiRows];

  const totalAnthroUnits = anthroRows.reduce((s, r) => s + r.capacityUnits, 0);
  const totalOpenaiUnitsAt1k = openaiRows
    .filter((r) => r.unitRatio === 1_000)
    .reduce((s, r) => s + r.capacityUnits, 0);
  const o3miniRow = openaiRows.find((r) => r.azureModel === "o3-mini");

  // ── Usage basis stats ─────────────────────────────────────────────────────
  const basisRows = [
    {
      label: "Claude Code (direct API)",
      period: cc ? `${cc.reportStartDay} → ${cc.reportEndDay}` : "—",
      windowLabel: cc?.reportAgeLabel ?? "—",
      activeTokens: ccActiveTokens,
      cacheReads: cc?.cacheReadTokens ?? null,
      avgTpm: Math.round(ccAvgTpm),
      peakTpm: Math.round(ccPeakTpm),
    },
    {
      label: "GitHub Copilot CLI",
      period: gh ? `${gh.reportStartDay} → ${gh.reportEndDay}` : "—",
      windowLabel: "28-day window",
      activeTokens: ghTotal,
      cacheReads: null,
      avgTpm: Math.round(ghAvgTpm),
      peakTpm: null,
    },
    {
      label: "OpenAI Codex",
      period: cx ? `${cx.reportStartDay} → ${cx.reportEndDay}` : "—",
      windowLabel: `${cxCalDays}-day window`,
      activeTokens: cxTotal,
      cacheReads: null,
      avgTpm: Math.round(cxAvgTpm),
      peakTpm: Math.round(cxPeakTpm),
    },
  ];

  return (
    <section className="quota-panel" aria-labelledby="quota-panel-title">
      <div className="quota-panel__header">
        <div>
          <p className="quota-panel__eyebrow">Azure AI Foundry evaluation</p>
          <h2 className="quota-panel__title" id="quota-panel-title">
            Quota Request Calculator
          </h2>
          <p className="quota-panel__subtitle">
            EOM April 2026 basis · 8-hour work-window peak ·{" "}
            {GROWTH_FACTOR}× growth headroom applied
          </p>
        </div>
        <a
          className="quota-panel__cta"
          href={QUOTA_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Request Quota Increase ↗
        </a>
      </div>

      {/* ── Usage basis ──────────────────────────────────────────────────── */}
      <h3 className="quota-panel__section-heading">Usage Basis</h3>
      <div className="quota-table-wrapper" tabIndex={0}>
        <table className="quota-table quota-table--basis">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Period</th>
              <th>Window</th>
              <th>Active Tokens</th>
              <th>Cache Reads</th>
              <th>Avg 8h TPM</th>
              <th>Peak 8h TPM</th>
            </tr>
          </thead>
          <tbody>
            {basisRows.map((r) => (
              <tr key={r.label}>
                <td className="quota-table__model">{r.label}</td>
                <td className="quota-table__replaces">{r.period}</td>
                <td>{r.windowLabel}</td>
                <td>{fmt(r.activeTokens)}</td>
                <td>{r.cacheReads !== null ? fmt(r.cacheReads) : "—"}</td>
                <td>{fmt(r.avgTpm)}</td>
                <td>
                  {r.peakTpm !== null ? (
                    <strong>{fmt(r.peakTpm)}</strong>
                  ) : (
                    <span className="quota-note">avg used ×{CC_PEAK_FACTOR}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="quota-panel__note">
        Peak 8h TPM = observed daily-avg ÷ 480 min × peak factor (Claude ×{CC_PEAK_FACTOR},
        OpenAI ×{CX_PEAK_FACTOR}) derived from April 2026 burst pattern.
        Cache reads not counted against Azure AI Foundry TPM rate limits.
      </p>

      {/* ── Anthropic quota ───────────────────────────────────────────────── */}
      <h3 className="quota-panel__section-heading">
        Anthropic Models — Global Standard
        <span className="quota-panel__ratio-badge">1 unit = 1,000 TPM</span>
      </h3>
      <QuotaTable rows={anthroRows} />
      <p className="quota-panel__tally">
        Total Anthropic capacity units to request:{" "}
        <strong>{totalAnthroUnits}</strong>
      </p>

      {/* ── OpenAI quota ──────────────────────────────────────────────────── */}
      <h3 className="quota-panel__section-heading">
        Azure OpenAI Models — Global Standard
      </h3>
      <QuotaTable rows={openaiRows} />
      <p className="quota-panel__tally">
        gpt-4o / gpt-4.1 + realtime capacity units:{" "}
        <strong>{totalOpenaiUnitsAt1k}</strong> (at 1:1K ratio)
        {o3miniRow && (
          <>
            {" "}· o3-mini: <strong>{o3miniRow.capacityUnits}</strong> unit
            {o3miniRow.capacityUnits !== 1 ? "s" : ""} (at 1:10K ratio)
          </>
        )}
      </p>

      {/* ── Region recommendations ────────────────────────────────────────── */}
      <h3 className="quota-panel__section-heading">Recommended Regions</h3>
      <div className="quota-regions">
        {[
          {
            priority: "Primary",
            region: "East US",
            reason:
              "Highest quota pool for both Anthropic and Azure OpenAI models; best model availability; US-east latency.",
          },
          {
            priority: "Secondary",
            region: "East US 2",
            reason:
              "Strong fallback quota availability; good for multi-deployment redundancy within the same subscription.",
          },
          {
            priority: "Tertiary",
            region: "West US 3",
            reason:
              "West-coast coverage; growing quota capacity for GPT-4o and o-series models.",
          },
        ].map(({ priority, region, reason }) => (
          <div key={region} className="quota-region-card">
            <span className="quota-region-card__priority">{priority}</span>
            <strong className="quota-region-card__name">{region}</strong>
            <p className="quota-region-card__reason">{reason}</p>
          </div>
        ))}
      </div>

      <p className="quota-panel__note">
        Quota is allocated per-region, per-subscription, per-model. Deploying
        across East US + East US 2 doubles effective capacity without a formal
        quota increase. Verify current availability in the{" "}
        <a
          href="https://learn.microsoft.com/en-us/azure/foundry/reference/region-support"
          target="_blank"
          rel="noopener noreferrer"
        >
          Foundry region support docs ↗
        </a>
        .
      </p>

      {/* ── All rows combined ─────────────────────────────────────────────── */}
      <h3 className="quota-panel__section-heading">
        All Models — Combined View
      </h3>
      <div className="quota-table-wrapper" tabIndex={0}>
        <table className="quota-table">
          <thead>
            <tr>
              <th>Azure AI Foundry Model</th>
              <th>Category</th>
              <th>Replaces</th>
              <th>Peak 8h TPM</th>
              <th>Requested TPM</th>
              <th className="quota-table__units">Capacity Units</th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((row) => (
              <tr key={row.azureModel}>
                <td className="quota-table__model">{row.azureModel}</td>
                <td>
                  <span
                    className={`quota-badge quota-badge--${row.category}`}
                  >
                    {row.category === "anthropic" ? "Anthropic" : "Azure OpenAI"}
                  </span>
                </td>
                <td className="quota-table__replaces">{row.replaces}</td>
                <td>{fmt(row.peakTpm)}</td>
                <td className="quota-table__requested">{fmt(row.requestedTpm)}</td>
                <td className="quota-table__units quota-table__units--value">
                  {row.capacityUnits}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
