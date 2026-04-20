import type { GitHubCopilotReportSummary } from "../providers/githubCopilot/types";

interface GitHubCopilotReportCardProps {
  summary: GitHubCopilotReportSummary;
}

export function GitHubCopilotReportCard({
  summary
}: GitHubCopilotReportCardProps) {
  const hasUsageData = summary.totalInteractions !== null;
  const hasCliTokens = summary.cliInputTokens !== null;

  return (
    <article className="report-card">
      <div className="report-card__header">
        <p className="report-card__eyebrow">{summary.organization}</p>
        <h2>{summary.providerLabel}</h2>
      </div>
      <dl className="report-card__details">
        <div>
          <dt>Coverage</dt>
          <dd>
            {summary.reportStartDay} to {summary.reportEndDay}
          </dd>
        </div>
        <div>
          <dt>Downloads</dt>
          <dd>{summary.downloadCount} signed downloads</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>{summary.reportAgeLabel}</dd>
        </div>
        {hasCliTokens && (
          <>
            <div>
              <dt>Input Tokens (CLI)</dt>
              <dd>{summary.cliInputTokens?.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Output Tokens (CLI)</dt>
              <dd>{summary.cliOutputTokens?.toLocaleString()}</dd>
            </div>
            {summary.cliRequestCount !== null && (
              <div>
                <dt>CLI Requests</dt>
                <dd>{summary.cliRequestCount.toLocaleString()}</dd>
              </div>
            )}
            {summary.cliSessionCount !== null && (
              <div>
                <dt>CLI Sessions</dt>
                <dd>{summary.cliSessionCount.toLocaleString()}</dd>
              </div>
            )}
            {summary.cliModelsUsed.length > 0 && (
              <div>
                <dt>Models Used (CLI)</dt>
                <dd>{summary.cliModelsUsed.join(", ")}</dd>
              </div>
            )}
          </>
        )}
        {hasUsageData && (
          <>
            <div>
              <dt>Interactions</dt>
              <dd>{summary.totalInteractions?.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Code Generations</dt>
              <dd>{summary.totalCodeGenerations?.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Accepted Suggestions</dt>
              <dd>{summary.totalAcceptances?.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Lines Suggested</dt>
              <dd>{summary.totalLocSuggested?.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Lines Added</dt>
              <dd>{summary.totalLinesAdded?.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Active Users</dt>
              <dd>{summary.activeUserCount?.toLocaleString()}</dd>
            </div>
          </>
        )}
        {summary.perModelBreakdown.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <dt>Per-model breakdown</dt>
            <dd>
              <table style={{ width: "100%", fontSize: "0.85em", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Model</th>
                    <th style={{ textAlign: "left" }}>Features</th>
                    <th style={{ textAlign: "right" }}>Interactions</th>
                    <th style={{ textAlign: "right" }}>Input¹</th>
                    <th style={{ textAlign: "right" }}>Output¹</th>
                    <th style={{ textAlign: "right" }}>Requests¹</th>
                    <th style={{ textAlign: "right" }}>Cost²</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.perModelBreakdown.map((row) => (
                    <tr key={row.model}>
                      <td>{row.model}</td>
                      <td style={{ color: "#666" }}>{row.features.join(", ")}</td>
                      <td style={{ textAlign: "right" }}>
                        {row.interactionCount.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {row.tokensUnavailable ? "—" : row.inputTokens.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {row.tokensUnavailable ? "—" : row.outputTokens.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {row.tokensUnavailable ? "—" : row.requestCount.toLocaleString()}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {row.costUsd !== null ? `$${row.costUsd.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: "0.75em", color: "#666", marginTop: "0.4em" }}>
                ¹ Tokens / requests allocated proportionally across CLI-feature
                models by interaction share — admin API does not expose
                per-model token telemetry. Non-CLI features (chat, agent,
                code-review) show "—". &nbsp;
                ² Seat cost prorated to 28-day window and allocated by
                interaction share across all features.
              </p>
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}
