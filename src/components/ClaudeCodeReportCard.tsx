import type { ClaudeCodeReportSummary } from "../providers/claudeCode/types";
import { ProviderReportCard } from "./ProviderReportCard";

interface ClaudeCodeReportCardProps {
  summary: ClaudeCodeReportSummary;
}

export function ClaudeCodeReportCard({ summary }: ClaudeCodeReportCardProps) {
  return (
    <ProviderReportCard summary={summary}>
      <div>
        <dt>Requests</dt>
        <dd>{summary.requestCount.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Sessions</dt>
        <dd>{summary.sessionCount.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Input tokens</dt>
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
      {summary.webFetchRequests > 0 && (
        <div>
          <dt>Web fetch requests</dt>
          <dd>{summary.webFetchRequests.toLocaleString()}</dd>
        </div>
      )}
      <div>
        <dt>Subscription</dt>
        <dd>${summary.monthlySeatCost}/mo <small>flat rate</small></dd>
      </div>
      {summary.perModelBreakdown.length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>Per-model breakdown</dt>
          <dd>
            <table style={{ width: "100%", fontSize: "0.85em", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Model</th>
                  <th style={{ textAlign: "right" }}>Input</th>
                  <th style={{ textAlign: "right" }}>Cache read</th>
                  <th style={{ textAlign: "right" }}>Cache create</th>
                  <th style={{ textAlign: "right" }}>Output</th>
                  <th style={{ textAlign: "right" }}>Requests</th>
                </tr>
              </thead>
              <tbody>
                {summary.perModelBreakdown.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td style={{ textAlign: "right" }}>{row.inputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.cacheReadTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.cacheCreationTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.outputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.requestCount.toLocaleString()}</td>
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
