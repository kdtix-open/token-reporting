import type { CodexReportSummary } from "../providers/codex/types";
import { ProviderReportCard } from "./ProviderReportCard";

interface CodexReportCardProps {
  summary: CodexReportSummary;
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}

export function CodexReportCard({ summary }: CodexReportCardProps) {
  const hasEnrichment = summary.cacheReadTokens !== null;
  const displayCost = summary.actualCostUsd ?? summary.estimatedCostUsd;
  const costLabel = summary.actualCostUsd !== null ? "Actual cost" : "Est. cost (approx.)";

  return (
    <ProviderReportCard summary={summary}>
      <div>
        <dt>Input tokens (total)</dt>
        <dd>{summary.inputTokens.toLocaleString()}</dd>
      </div>
      {hasEnrichment && (
        <>
          <div>
            <dt>Cached input tokens</dt>
            <dd>{fmt(summary.cacheReadTokens)}</dd>
          </div>
          <div>
            <dt>Uncached input tokens</dt>
            <dd>{fmt(summary.uncachedInputTokens)}</dd>
          </div>
          <div>
            <dt>Cache hit rate</dt>
            <dd>
              {summary.cacheHitRate !== null
                ? `${(summary.cacheHitRate * 100).toFixed(1)}%`
                : "—"}
            </dd>
          </div>
        </>
      )}
      <div>
        <dt>Output tokens</dt>
        <dd>{summary.outputTokens.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Requests</dt>
        <dd>{summary.requestCount.toLocaleString()}</dd>
      </div>
      {hasEnrichment && summary.modelsUsed.length > 0 && (
        <div>
          <dt>Models used</dt>
          <dd>{summary.modelsUsed.join(", ")}</dd>
        </div>
      )}
      <div>
        <dt>{costLabel}</dt>
        <dd>${displayCost.toFixed(2)} <small>USD</small></dd>
      </div>
      {summary.unattributedCostUsd !== null && summary.unattributedCostUsd > 0 && (
        <div>
          <dt>Unattributed cost</dt>
          <dd>
            ${summary.unattributedCostUsd.toFixed(2)} <small>USD (e.g. tool calls)</small>
          </dd>
        </div>
      )}
      {hasEnrichment && summary.perModelBreakdown.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>Per-model breakdown</dt>
          <dd>
            <table style={{ width: "100%", fontSize: "0.85em", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Model</th>
                  <th style={{ textAlign: "right" }}>Input</th>
                  <th style={{ textAlign: "right" }}>Cached</th>
                  <th style={{ textAlign: "right" }}>Output</th>
                  <th style={{ textAlign: "right" }}>Requests</th>
                  <th style={{ textAlign: "right" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.perModelBreakdown.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td style={{ textAlign: "right" }}>{row.inputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.cachedInputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.outputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.requestCount.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>
                      {row.costUsd !== null ? `$${row.costUsd.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </dd>
        </div>
      )}
    </ProviderReportCard>
  );
}
