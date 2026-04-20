import { useEffect, useState } from "react";

import { ClaudeCodeReportCard } from "./components/ClaudeCodeReportCard";
import { ClaudeReportCard } from "./components/ClaudeReportCard";
import { CodexReportCard } from "./components/CodexReportCard";
import { CursorReportCard } from "./components/CursorReportCard";
import { GitHubCopilotReportCard } from "./components/GitHubCopilotReportCard";
import { ProviderComparisonSection } from "./components/ProviderComparisonSection";
import { LocalModelMigrationPanel } from "./components/LocalModelMigrationPanel";
import { SpendProjectionPanel } from "./components/SpendProjectionPanel";
import type { ClaudeCodeReportSummary } from "./providers/claudeCode/types";
import type { ClaudeReportSummary } from "./providers/claude/types";
import type { CodexReportSummary } from "./providers/codex/types";
import type { CursorReportSummary } from "./providers/cursor/types";
import type { GitHubCopilotReportSummary } from "./providers/githubCopilot/types";
import type { ProviderReportSummary } from "./lib/types";
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

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshots() {
      const results = await Promise.all(
        providerRegistry.map(async (adapter) => {
          try {
            const response = await fetch(`/data/${adapter.dataPath}`);
            if (!response.ok) return adapter.seedSummary;
            const raw = await response.json();
            return adapter.transformSnapshot(raw);
          } catch {
            return adapter.seedSummary;
          }
        })
      );

      if (!cancelled) {
        setSummaries(results);
      }
    }

    void loadSnapshots();

    return () => {
      cancelled = true;
    };
  }, []);

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
      </section>
      <ProviderComparisonSection summaries={summaries} />
      <SpendProjectionPanel summaries={summaries} />
      <LocalModelMigrationPanel summaries={summaries} />
      <div className="report-cards">
        {summaries.map(renderProviderCard)}
      </div>
    </main>
  );
}
