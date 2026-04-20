import type { ProviderReportSummary } from "../lib/types";

interface ProviderComparisonSectionProps {
  summaries: ProviderReportSummary[];
}

interface BarRowProps {
  label: string;
  value: number | null;
  metricLabel: string;
  maxValue: number;
  color: string;
}

function BarRow({ label, value, metricLabel, maxValue, color }: BarRowProps) {
  const pct = value === null || maxValue <= 0 ? 0 : (value / maxValue) * 100;
  const displayValue =
    value === null
      ? "—"
      : value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M ${metricLabel}`
        : value >= 1_000
          ? `${(value / 1_000).toFixed(1)}K ${metricLabel}`
          : `${value.toLocaleString()} ${metricLabel}`;

  return (
    <div className="comparison-row">
      <span className="comparison-row__label">{label}</span>
      <div className="comparison-row__bar-track">
        <div
          className="comparison-row__bar-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
          role="meter"
          aria-valuenow={value ?? 0}
          aria-valuemax={maxValue}
          aria-label={`${label}: ${displayValue}`}
        />
      </div>
      <span className="comparison-row__value">{displayValue}</span>
    </div>
  );
}

const PROVIDER_COLORS: Record<string, string> = {
  "github-copilot": "#6366f1",
  cursor: "#0ea5e9",
  claude: "#f59e0b",
  codex: "#10b981"
};

export function ProviderComparisonSection({
  summaries
}: ProviderComparisonSectionProps) {
  const requestGroup = summaries.filter(
    (s) => s.comparisonMetric.unit === "requests"
  );
  const tokenGroup = summaries.filter(
    (s) => s.comparisonMetric.unit === "tokens"
  );

  const requestMax = Math.max(
    1,
    ...requestGroup.map((s) => s.comparisonMetric.value ?? 0)
  );
  const tokenMax = Math.max(
    1,
    ...tokenGroup.map((s) => s.comparisonMetric.value ?? 0)
  );

  return (
    <section className="comparison-section">
      <h2 className="comparison-section__title">Activity breakdown · 28-day window</h2>
      <div className="comparison-groups">
        {requestGroup.length > 0 && (
          <div className="comparison-group">
            <p className="comparison-group__heading">AI Interactions &amp; Requests</p>
            {requestGroup.map((s) => (
              <BarRow
                key={s.providerId}
                label={s.providerLabel}
                value={s.comparisonMetric.value}
                metricLabel={s.comparisonMetric.label}
                maxValue={requestMax}
                color={PROVIDER_COLORS[s.providerId] ?? "#94a3b8"}
              />
            ))}
          </div>
        )}
        {tokenGroup.length > 0 && (
          <div className="comparison-group">
            <p className="comparison-group__heading">Token Output</p>
            {tokenGroup.map((s) => (
              <BarRow
                key={s.providerId}
                label={s.providerLabel}
                value={s.comparisonMetric.value}
                metricLabel={s.comparisonMetric.label}
                maxValue={tokenMax}
                color={PROVIDER_COLORS[s.providerId] ?? "#94a3b8"}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
