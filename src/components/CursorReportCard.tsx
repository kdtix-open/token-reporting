import type { CursorReportSummary } from "../providers/cursor/types";
import { ProviderReportCard } from "./ProviderReportCard";

interface CursorReportCardProps {
  summary: CursorReportSummary;
}

export function CursorReportCard({ summary }: CursorReportCardProps) {
  const displayCost = summary.actualCostUsd ?? summary.estimatedMonthlyCostUsd;
  const costLabel =
    summary.actualCostUsd !== null
      ? "Actual cost (28d, charged)"
      : "Est. monthly cost (seat-based)";
  const hasTokens =
    summary.inputTokens + summary.outputTokens + summary.cacheReadTokens > 0;
  return (
    <ProviderReportCard summary={summary}>
      <div>
        <dt>Active seats</dt>
        <dd>{summary.seatCount.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Cmd+K usages</dt>
        <dd>{summary.totalCmdkUsages.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Composer requests</dt>
        <dd>{summary.totalComposerRequests.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Chat requests</dt>
        <dd>{summary.totalChatRequests.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Agent requests</dt>
        <dd>{summary.totalAgentRequests.toLocaleString()}</dd>
      </div>
      <div>
        <dt>Usage-based requests</dt>
        <dd>{summary.totalUsageBasedReqs.toLocaleString()}</dd>
      </div>
      {summary.usageEventCount > 0 && (
        <div>
          <dt>Detailed usage events</dt>
          <dd>{summary.usageEventCount.toLocaleString()}</dd>
        </div>
      )}
      {summary.requestUnitsConsumed > 0 && (
        <div>
          <dt>Plan request units used</dt>
          <dd>{summary.requestUnitsConsumed.toFixed(1)}</dd>
        </div>
      )}
      {summary.fastPremiumRequests > 0 && (
        <div>
          <dt>Fast premium requests</dt>
          <dd>{summary.fastPremiumRequests.toLocaleString()}</dd>
        </div>
      )}
      {hasTokens && (
        <>
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
          {summary.cacheWriteTokens > 0 && (
            <div>
              <dt>Cache write tokens</dt>
              <dd>{summary.cacheWriteTokens.toLocaleString()}</dd>
            </div>
          )}
          {summary.cacheHitRate !== null && (
            <div>
              <dt>Cache hit rate</dt>
              <dd>{(summary.cacheHitRate * 100).toFixed(1)}%</dd>
            </div>
          )}
        </>
      )}
      {summary.modelsUsed.length > 0 && (
        <div>
          <dt>Models used</dt>
          <dd>{summary.modelsUsed.join(", ")}</dd>
        </div>
      )}
      {summary.includedSpendUsd !== null && summary.includedSpendUsd > 0 && (
        <div>
          <dt>Plan-included spend</dt>
          <dd>
            ${summary.includedSpendUsd.toFixed(2)} <small>USD (cycle)</small>
          </dd>
        </div>
      )}
      <div>
        <dt>{costLabel}</dt>
        <dd>${displayCost.toFixed(2)} <small>USD</small></dd>
      </div>
      {Object.keys(summary.kindBreakdown).length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <dt>Event kind breakdown</dt>
          <dd>
            {Object.entries(summary.kindBreakdown)
              .sort(([, a], [, b]) => b - a)
              .map(([k, n]) => `${k}: ${n}`)
              .join(" · ")}
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
                  <th style={{ textAlign: "right" }}>Events</th>
                  <th style={{ textAlign: "right" }}>Input</th>
                  <th style={{ textAlign: "right" }}>Cache read</th>
                  <th style={{ textAlign: "right" }}>Output</th>
                  <th style={{ textAlign: "right" }}>Req units</th>
                  <th style={{ textAlign: "right" }}>Charged</th>
                </tr>
              </thead>
              <tbody>
                {summary.perModelBreakdown.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td style={{ textAlign: "right" }}>{row.eventCount.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.inputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.cacheReadTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.outputTokens.toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>{row.requestUnitsConsumed.toFixed(1)}</td>
                    <td style={{ textAlign: "right" }}>
                      {row.chargedCostUsd !== null ? `$${row.chargedCostUsd.toFixed(2)}` : "—"}
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
