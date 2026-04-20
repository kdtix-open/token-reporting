import { buildCrossProviderModelFleet } from "../lib/crossProviderModelFleet";
import type {
  ModelFamilyRow,
  LocalProfileTier
} from "../lib/crossProviderModelFleet";
import type { ProviderReportSummary } from "../lib/types";

interface CrossProviderModelFleetPanelProps {
  summaries: ProviderReportSummary[];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtUsd(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `$${n.toFixed(2)}`;
}

const TIER_LABEL: Record<LocalProfileTier, string> = {
  min: "Minimum",
  recommended: "Recommended",
  enterprise: "Enterprise",
  gap: "Gap — manual review"
};

const TIER_CLASS: Record<LocalProfileTier, string> = {
  min: "fleet-tier fleet-tier--min",
  recommended: "fleet-tier fleet-tier--recommended",
  enterprise: "fleet-tier fleet-tier--enterprise",
  gap: "fleet-tier fleet-tier--gap"
};

function ModelRow({ row }: { row: ModelFamilyRow }) {
  const hfUrl = row.recommendedHfRepoId
    ? `https://huggingface.co/${row.recommendedHfRepoId}`
    : null;
  const providers = [...new Set(row.contributions.map((c) => c.providerLabel))].join(", ");

  return (
    <tr>
      <td>
        <div className="fleet-row__name">{row.displayName}</div>
        <div className="fleet-row__providers">{providers}</div>
      </td>
      <td className="fleet-row__num">{fmtTokens(row.totalInputTokens)}</td>
      <td className="fleet-row__num">{fmtTokens(row.totalOutputTokens)}</td>
      <td className="fleet-row__num">{fmtTokens(row.totalCacheReadTokens)}</td>
      <td className="fleet-row__num">{fmtTokens(row.totalPureComputeTokens)}</td>
      <td className="fleet-row__num">{fmtUsd(row.totalCostUsd)}</td>
      <td>
        <span className={TIER_CLASS[row.recommendedTier]}>
          {TIER_LABEL[row.recommendedTier]}
        </span>
        {row.recommendedProfileName && (
          <div className="fleet-row__profile">
            {hfUrl ? (
              <a href={hfUrl} target="_blank" rel="noreferrer">
                {row.recommendedProfileName}
              </a>
            ) : (
              row.recommendedProfileName
            )}
          </div>
        )}
        <div className="fleet-row__note">{row.routingNote}</div>
      </td>
    </tr>
  );
}

export function CrossProviderModelFleetPanel({
  summaries
}: CrossProviderModelFleetPanelProps) {
  const report = buildCrossProviderModelFleet(summaries);

  if (report.rows.length === 0) {
    return (
      <section className="fleet-panel">
        <h2 className="fleet-panel__title">Cross-provider model fleet</h2>
        <p className="fleet-panel__empty">
          No per-model breakdowns available yet — refresh provider snapshots to populate.
        </p>
      </section>
    );
  }

  const g = report.growth;
  const hfUrl = g.twoYearRecommendedHfRepoId
    ? `https://huggingface.co/${g.twoYearRecommendedHfRepoId}`
    : null;

  return (
    <section className="fleet-panel">
      <h2 className="fleet-panel__title">Cross-provider model fleet</h2>
      <p className="fleet-panel__subtitle">
        Aggregated per-model usage across all providers, mapped to local on-prem complement
        profiles. Last {g.windowDays} days · Trend: <strong>{g.trendLabel}</strong>
        {g.slopeUsdPerDay !== 0 && (
          <> · slope {g.slopeUsdPerDay >= 0 ? "+" : ""}${g.slopeUsdPerDay.toFixed(2)}/day</>
        )}
      </p>

      <div className="fleet-table-wrap">
        <table className="fleet-table">
          <thead>
            <tr>
              <th>Model family</th>
              <th>Input</th>
              <th>Output</th>
              <th>Cache reads</th>
              <th>Compute total</th>
              <th>Cost</th>
              <th>Local complement</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <ModelRow key={row.familyKey} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="fleet-projection">
        <h3 className="fleet-projection__title">Growth projection &amp; 2-year sizing</h3>
        <div className="fleet-projection__grid">
          <div>
            <div className="fleet-projection__label">Monthly</div>
            <div className="fleet-projection__value">{fmtUsd(g.monthlyUsd)}</div>
            <div className="fleet-projection__sub">
              {fmtTokens(g.monthlyComputeTokens)} compute tokens
            </div>
          </div>
          <div>
            <div className="fleet-projection__label">Quarterly</div>
            <div className="fleet-projection__value">{fmtUsd(g.quarterlyUsd)}</div>
            <div className="fleet-projection__sub">
              {fmtTokens(g.quarterlyComputeTokens)} compute tokens
            </div>
          </div>
          <div>
            <div className="fleet-projection__label">Annual</div>
            <div className="fleet-projection__value">{fmtUsd(g.annualUsd)}</div>
            <div className="fleet-projection__sub">
              {fmtTokens(g.annualComputeTokens)} compute tokens
            </div>
          </div>
          <div className="fleet-projection__highlight">
            <div className="fleet-projection__label">2-year</div>
            <div className="fleet-projection__value">{fmtUsd(g.twoYearUsd)}</div>
            <div className="fleet-projection__sub">
              {fmtTokens(g.twoYearComputeTokens)} compute tokens · ~
              {g.twoYearRequiredTokensPerSec.toFixed(1)} tok/s required
            </div>
          </div>
        </div>

        <div className="fleet-projection__recommend">
          <div className="fleet-projection__label">
            Recommended profile for 2-year projected load
          </div>
          <div>
            <span className={TIER_CLASS[g.twoYearRecommendedTier]}>
              {TIER_LABEL[g.twoYearRecommendedTier]}
            </span>
            {g.twoYearRecommendedProfileName && (
              <span className="fleet-projection__profile">
                {hfUrl ? (
                  <a href={hfUrl} target="_blank" rel="noreferrer">
                    {g.twoYearRecommendedProfileName}
                  </a>
                ) : (
                  g.twoYearRecommendedProfileName
                )}
              </span>
            )}
          </div>
          <p className="fleet-projection__note">{g.twoYearNote}</p>
        </div>
      </div>

      {report.unclassifiedModels.length > 0 && (
        <p className="fleet-panel__unclassified">
          Unclassified models needing manual review: {report.unclassifiedModels.join(", ")}
        </p>
      )}
    </section>
  );
}
