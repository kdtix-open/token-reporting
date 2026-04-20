import type { ProviderReportSummary, SpendProjection } from "../lib/types";

interface SpendRow {
  label: string;
  projection: SpendProjection;
}

const COST_SOURCE_BADGE: Record<string, string> = {
  actual: "Actual",
  estimated: "Est.",
  seat_based: "Seat-based"
};

const TREND_ICON: Record<string, string> = {
  ramp: "↑",
  decline: "↓",
  flat: "→",
  insufficient_data: "—"
};

function fmt(usd: number | null): string {
  if (usd === null) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface SpendProjectionPanelProps {
  summaries: ProviderReportSummary[];
}

export function SpendProjectionPanel({ summaries }: SpendProjectionPanelProps) {
  const rows: SpendRow[] = summaries
    .filter((s) => s.spendProjection)
    .map((s) => ({ label: s.providerLabel, projection: s.spendProjection }));

  if (rows.length === 0) return null;

  const totalMonthly = rows.reduce(
    (acc, r) => acc + r.projection.projectedMonthlyUsd,
    0
  );
  const totalAnnual = rows.reduce(
    (acc, r) => acc + r.projection.projectedAnnualUsd,
    0
  );
  const totalTrendedMonthly = rows.every((r) => r.projection.trendedMonthlyUsd !== null)
    ? rows.reduce((acc, r) => acc + (r.projection.trendedMonthlyUsd ?? 0), 0)
    : null;
  const totalTrendedAnnual = rows.every((r) => r.projection.trendedAnnualUsd !== null)
    ? rows.reduce((acc, r) => acc + (r.projection.trendedAnnualUsd ?? 0), 0)
    : null;

  return (
    <section className="spend-panel" aria-labelledby="spend-panel-title">
      <h2 className="spend-panel__title" id="spend-panel-title">
        Spend projections
      </h2>
      <p className="spend-panel__subtitle">
        28-day window · flat = daily avg extrapolated · trended = OLS slope applied
      </p>
      <div className="spend-table-wrapper">
        <table className="spend-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>28-day total</th>
              <th>Daily avg</th>
              <th>Monthly (flat)</th>
              <th>Annual (flat)</th>
              <th>Monthly (trended)</th>
              <th>Annual (trended)</th>
              <th>Source</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, projection }) => (
              <tr key={label}>
                <td className="spend-table__provider">{label}</td>
                <td>{fmt(projection.totalUsd)}</td>
                <td>{fmt(projection.dailyAvgUsd)}</td>
                <td>{fmt(projection.projectedMonthlyUsd)}</td>
                <td>{fmt(projection.projectedAnnualUsd)}</td>
                <td>{fmt(projection.trendedMonthlyUsd)}</td>
                <td>{fmt(projection.trendedAnnualUsd)}</td>
                <td>
                  <span className={`spend-badge spend-badge--${projection.costSource}`}>
                    {COST_SOURCE_BADGE[projection.costSource] ?? projection.costSource}
                  </span>
                </td>
                <td
                  className={`spend-trend spend-trend--${projection.trend}`}
                  title={projection.note ?? undefined}
                >
                  {TREND_ICON[projection.trend] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="spend-table__total">
              <td>Total</td>
              <td />
              <td />
              <td>{fmt(totalMonthly)}</td>
              <td>{fmt(totalAnnual)}</td>
              <td>{fmt(totalTrendedMonthly)}</td>
              <td>{fmt(totalTrendedAnnual)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
