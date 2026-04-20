import type { ClaudeReportSummary } from "../providers/claude/types";
import { ProviderReportCard } from "./ProviderReportCard";

interface ClaudeReportCardProps {
  summary: ClaudeReportSummary;
}

export function ClaudeReportCard({ summary }: ClaudeReportCardProps) {
  const displayCost = summary.actualCostUsd ?? summary.estimatedCostUsd;
  const costLabel = summary.actualCostUsd !== null ? "Actual cost" : "Est. cost (approx.)";
  return (
    <ProviderReportCard summary={summary}>
      <div>
        <dt>Uncached input tokens</dt>
        <dd>{summary.inputTokens.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Output tokens</dt>
        <dd>{summary.outputTokens.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Cache read tokens</dt>
        <dd>{summary.cacheReadTokens.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Cache creation tokens</dt>
        <dd>{summary.cacheCreationTokens.toLocaleString()}</dd>
      </div>
      {summary.cacheHitRate !== null && (
        <div>
          <dt>Cache hit rate</dt>
          <dd>{(summary.cacheHitRate * 100).toFixed(1)}%</dd>
        </div>
      )}
      {summary.modelsUsed.length > 0 && (
        <div>
          <dt>Models used</dt>
          <dd>{summary.modelsUsed.join(", ")}</dd>
        </div>
      )}
      {summary.webSearchRequests > 0 && (
        <div>
          <dt>Web search requests</dt>
          <dd>{summary.webSearchRequests.toLocaleString()}</dd>
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
            ${summary.unattributedCostUsd.toFixed(2)} <small>USD</small>
          </dd>
        </div>
      )}
      {summary.perModelBreakdown.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>Per-model breakdown</dt>
          <dd>
            <table style={{ width: "100%", fontSize: "0.85em", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Model</th>
                  <th style={{ textAlign: "right" }}>Uncached in</th>
                  <th style={{ textAlign: "right" }}>Cache read</th>
                  <th style={{ textAlign: "right" }}>Cache create</th>
                  <th style={{ textAlign: "right" }}>Output</th>
                  <th style={{ textAlign: "right" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.perModelBreakdown.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td style={{ textAlign: "right" }}>{row.uncachedInputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.cacheReadTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.cacheCreationTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.outputTokens.toLocaleString()}</td>
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
