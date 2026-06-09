import type { ProviderReportSummary } from "../lib/types";

import {
  gitHubCopilotLatestUsersReportSchema,
  type GitHubCopilotReportSummary
} from "./githubCopilot/types";
import { createGitHubCopilotReportSummary } from "./githubCopilot/service";
import { seededGitHubCopilotReportSummary } from "./githubCopilot/seed";

import {
  cursorDailyUsageResponseSchema,
  cursorSnapshotSchema
} from "./cursor/types";
import { createCursorReportSummary } from "./cursor/service";
import { seededCursorReportSummary } from "./cursor/seed";

import { claudeSnapshotSchema, claudeUsageReportSchema } from "./claude/types";
import { createClaudeReportSummary } from "./claude/service";
import { seededClaudeReportSummary } from "./claude/seed";

import { codexSnapshotSchema } from "./codex/client";
import { createCodexReportSummary } from "./codex/service";
import { seededCodexReportSummary } from "./codex/seed";

import { claudeCodeSnapshotSchema } from "./claudeCode/types";
import { createClaudeCodeReportSummary } from "./claudeCode/service";
import { seededClaudeCodeReportSummary } from "./claudeCode/seed";

/**
 * A registered provider. Contains no React imports so it can be consumed by
 * both the dashboard UI and CLI fetch scripts.
 */
export interface ProviderAdapter<
  S extends ProviderReportSummary = ProviderReportSummary
> {
  /** Stable machine identifier, used as a URL path segment for snapshot files. */
  readonly providerId: string;
  readonly providerLabel: string;
  /** Pre-computed summary used when no live snapshot has been fetched yet. */
  readonly seedSummary: S;
  /** Path relative to `public/data/` where the raw snapshot is persisted. */
  readonly dataPath: string;
  /** Parse the raw snapshot JSON and return a typed summary. */
  readonly transformSnapshot: (raw: unknown) => S;
}

const githubCopilotAdapter: ProviderAdapter<GitHubCopilotReportSummary> = {
  providerId: "github-copilot",
  providerLabel: "GitHub Copilot",
  seedSummary: seededGitHubCopilotReportSummary,
  dataPath: "github-copilot/latest-metadata.json",
  transformSnapshot(raw) {
    const report = gitHubCopilotLatestUsersReportSchema.parse(raw);
    return createGitHubCopilotReportSummary({
      organization: seededGitHubCopilotReportSummary.organization,
      report
    });
  }
};

const cursorAdapter: ProviderAdapter = {
  providerId: "cursor",
  providerLabel: "Cursor",
  seedSummary: seededCursorReportSummary,
  dataPath: "cursor/latest-metadata.json",
  transformSnapshot(raw) {
    // Try new enriched snapshot shape first, fall back to legacy raw daily-usage payload.
    const enriched = cursorSnapshotSchema.safeParse(raw);
    if (enriched.success) {
      return createCursorReportSummary(enriched.data);
    }
    return createCursorReportSummary(cursorDailyUsageResponseSchema.parse(raw));
  }
};

const claudeAdapter: ProviderAdapter = {
  providerId: "claude",
  providerLabel: "Claude",
  seedSummary: seededClaudeReportSummary,
  dataPath: "claude/latest-metadata.json",
  transformSnapshot(raw) {
    // New snapshot shape is { usage, costs? }; legacy shape is the raw usage report.
    const snapshot = claudeSnapshotSchema.safeParse(raw);
    if (snapshot.success) {
      return createClaudeReportSummary(
        snapshot.data.usage,
        snapshot.data.costs,
        snapshot.data.generatedAt
      );
    }
    return createClaudeReportSummary(claudeUsageReportSchema.parse(raw));
  }
};

const codexAdapter: ProviderAdapter = {
  providerId: "codex",
  providerLabel: "OpenAI Codex",
  seedSummary: seededCodexReportSummary,
  dataPath: "codex/latest-metadata.json",
  transformSnapshot(raw) {
    const snapshot = codexSnapshotSchema.parse(raw);
    return createCodexReportSummary(snapshot.usage, snapshot.costs, snapshot.generatedAt);
  }
};

const claudeCodeAdapter: ProviderAdapter = {
  providerId: "claude-code",
  providerLabel: "Claude Code",
  seedSummary: seededClaudeCodeReportSummary,
  dataPath: "claude-code/latest-metadata.json",
  transformSnapshot(raw) {
    const snapshot = claudeCodeSnapshotSchema.parse(raw);
    return createClaudeCodeReportSummary(snapshot);
  }
};

export const providerRegistry: ProviderAdapter[] = [
  githubCopilotAdapter,
  cursorAdapter,
  claudeAdapter,
  claudeCodeAdapter,
  codexAdapter
];
