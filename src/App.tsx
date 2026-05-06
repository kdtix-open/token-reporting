import { useCallback, useEffect, useRef, useState } from "react";

import { ClaudeCodeReportCard } from "./components/ClaudeCodeReportCard";
import { ClaudeReportCard } from "./components/ClaudeReportCard";
import { CodexReportCard } from "./components/CodexReportCard";
import { CursorReportCard } from "./components/CursorReportCard";
import { GitHubCopilotReportCard } from "./components/GitHubCopilotReportCard";
import { ProviderComparisonSection } from "./components/ProviderComparisonSection";
import { LocalModelMigrationPanel } from "./components/LocalModelMigrationPanel";
import { SpendProjectionPanel } from "./components/SpendProjectionPanel";
import { AzureQuotaPanel } from "./components/AzureQuotaPanel";
import type { ClaudeCodeReportSummary } from "./providers/claudeCode/types";
import type { ClaudeReportSummary } from "./providers/claude/types";
import type { CodexReportSummary } from "./providers/codex/types";
import type { CursorReportSummary } from "./providers/cursor/types";
import type { GitHubCopilotReportSummary } from "./providers/githubCopilot/types";
import type { ProviderReportSummary } from "./lib/types";
import {
  loadLocalSessionDistribution,
  type LocalSessionDistribution,
} from "./lib/localSessionDistribution";
import { providerRegistry } from "./providers/registry";
import "./App.css";

function renderProviderCard(summary: ProviderReportSummary) {
  switch (summary.providerId) {
    case "github-copilot":
      return (
        <GitHubCopilotReportCard
          key={summary.providerId}
          summary={summary as GitHubCopilotReportSummary}
        />
      );
    case "cursor":
      return (
        <CursorReportCard
          key={summary.providerId}
          summary={summary as CursorReportSummary}
        />
      );
    case "claude":
      return (
        <ClaudeReportCard
          key={summary.providerId}
          summary={summary as ClaudeReportSummary}
        />
      );
    case "claude-code":
      return (
        <ClaudeCodeReportCard
          key={summary.providerId}
          summary={summary as ClaudeCodeReportSummary}
        />
      );
    case "codex":
      return (
        <CodexReportCard
          key={summary.providerId}
          summary={summary as CodexReportSummary}
        />
      );
    default:
      return null;
  }
}

export default function App() {
  const [summaries, setSummaries] = useState<ProviderReportSummary[]>(
    providerRegistry.map((adapter) => adapter.seedSummary)
  );
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [distribution, setDistribution] = useState<LocalSessionDistribution | null>(null);
  // Counter guards against stale responses from concurrent or Strict Mode loads
  const loadCounterRef = useRef(0);

  const loadSnapshots = useCallback(async (cacheBust = false) => {
    setLoading(true);
    const myCount = ++loadCounterRef.current;

    try {
      const qs = cacheBust ? `?t=${Date.now()}` : "";
      const [results, dist] = await Promise.all([
        Promise.all(
          providerRegistry.map(async (adapter) => {
            try {
              const url = `/data/${adapter.dataPath}${qs}`;
              const response = await fetch(url);
              if (!response.ok) return adapter.seedSummary;
              const raw = await response.json();
              return adapter.transformSnapshot(raw);
            } catch {
              return adapter.seedSummary;
            }
          })
        ),
        loadLocalSessionDistribution(),
      ]);

      if (myCount === loadCounterRef.current) {
        setSummaries(results);
        setDistribution(dist);
        setLastRefreshed(new Date());
      }
    } finally {
      if (myCount === loadCounterRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadSnapshots(false);
  }, [loadSnapshots]);

  return (
    <main className="page-shell">
      <section className="hero">
        <p className="hero__eyebrow">Token reporting workspace</p>
        <h1>Multi-provider token consumption dashboard</h1>
        <p className="hero__body">
          Aggregated usage across GitHub Copilot, Cursor, Claude, Claude Code,
          and OpenAI Codex from their respective reporting APIs and local
          session telemetry.
        </p>
        <div className="hero__actions">
          <button
            className="hero__refresh-btn"
            onClick={() => void loadSnapshots(true)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "↻ Refresh Report"}
          </button>
          {lastRefreshed && (
            <span className="hero__refresh-meta" aria-live="polite">
              Updated {lastRefreshed.toLocaleTimeString()}
            </span>
          )}
        </div>
      </section>
      <ProviderComparisonSection summaries={summaries} />
      <SpendProjectionPanel summaries={summaries} />
      <LocalModelMigrationPanel summaries={summaries} distribution={distribution} />
      <AzureQuotaPanel summaries={summaries} />
      <div className="report-cards">
        {summaries.map(renderProviderCard)}
      </div>
    </main>
  );
}
