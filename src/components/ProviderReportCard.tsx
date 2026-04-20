import type { ProviderReportSummary } from "../lib/types";

interface ProviderReportCardProps {
  summary: ProviderReportSummary;
  children?: React.ReactNode;
}

export function ProviderReportCard({
  summary,
  children
}: ProviderReportCardProps) {
  return (
    <article className="report-card">
      <div className="report-card__header">
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
          <dt>Window</dt>
          <dd>{summary.reportAgeLabel}</dd>
        </div>
        {children}
      </dl>
    </article>
  );
}
