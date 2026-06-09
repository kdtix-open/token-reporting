#!/usr/bin/env -S npx tsx
/**
 * Rebuild accumulated provider snapshots from committed public/data revisions.
 *
 * This is intentionally additive and idempotent: each historical blob is routed
 * through provider persistence, which merges by stable day/window keys. The
 * current working-tree latest snapshot is replayed last so the dashboard does
 * not roll back to an older Git revision.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { persistClaudeUsageReport } from "../src/providers/claude/persistence";
import { persistClaudeCodeSnapshot } from "../src/providers/claudeCode/persistence";
import { persistCodexUsageReport } from "../src/providers/codex/persistence";
import { persistCursorDailyUsageReport } from "../src/providers/cursor/persistence";
import { persistGitHubCopilotLatestUsersReportMetadata } from "../src/providers/githubCopilot/persistence";

const execFileAsync = promisify(execFile);

const PROVIDER_FILES = [
  "public/data/github-copilot/latest-metadata.json",
  "public/data/cursor/latest-metadata.json",
  "public/data/claude/latest-metadata.json",
  "public/data/claude-code/latest-metadata.json",
  "public/data/codex/latest-metadata.json"
] as const;

async function gitCommitsFor(filePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", [
    "log",
    "--reverse",
    "--format=%H",
    "--",
    filePath
  ]);
  return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function gitShow(commit: string, filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${commit}:${filePath}`], {
      maxBuffer: 25 * 1024 * 1024
    });
    return stdout;
  } catch {
    return null;
  }
}

async function persistSnapshot(filePath: string, raw: unknown): Promise<void> {
  if (filePath.includes("/github-copilot/")) {
    await persistGitHubCopilotLatestUsersReportMetadata({
      organization: process.env.GITHUB_ORG ?? "kdtix-open",
      report: raw as Parameters<typeof persistGitHubCopilotLatestUsersReportMetadata>[0]["report"]
    });
    return;
  }

  if (filePath.includes("/cursor/")) {
    const snapshot = raw as {
      daily?: Parameters<typeof persistCursorDailyUsageReport>[0]["report"];
      spend?: Parameters<typeof persistCursorDailyUsageReport>[0]["spend"];
      events?: Parameters<typeof persistCursorDailyUsageReport>[0]["events"];
    };
    await persistCursorDailyUsageReport({
      report: snapshot.daily ?? (raw as Parameters<typeof persistCursorDailyUsageReport>[0]["report"]),
      spend: snapshot.spend,
      events: snapshot.events
    });
    return;
  }

  if (filePath.includes("/claude-code/")) {
    await persistClaudeCodeSnapshot({
      snapshot: raw as Parameters<typeof persistClaudeCodeSnapshot>[0]["snapshot"]
    });
    return;
  }

  if (filePath.includes("/claude/")) {
    const snapshot = raw as {
      usage?: Parameters<typeof persistClaudeUsageReport>[0]["report"];
      costs?: Parameters<typeof persistClaudeUsageReport>[0]["costs"];
    };
    await persistClaudeUsageReport({
      report: snapshot.usage ?? (raw as Parameters<typeof persistClaudeUsageReport>[0]["report"]),
      costs: snapshot.costs
    });
    return;
  }

  if (filePath.includes("/codex/")) {
    const snapshot = raw as {
      usage: Parameters<typeof persistCodexUsageReport>[0]["usage"];
      costs?: Parameters<typeof persistCodexUsageReport>[0]["costs"];
    };
    await persistCodexUsageReport({
      usage: snapshot.usage,
      costs: snapshot.costs
    });
  }
}

async function replayFile(filePath: string): Promise<void> {
  const commits = await gitCommitsFor(filePath);
  let replayed = 0;

  for (const commit of commits) {
    const content = await gitShow(commit, filePath);
    if (!content) continue;
    await persistSnapshot(filePath, JSON.parse(content));
    replayed += 1;
  }

  try {
    await persistSnapshot(filePath, JSON.parse(await readFile(filePath, "utf8")));
    replayed += 1;
  } catch {
    // Current working-tree snapshot is optional; committed snapshots still seed history.
  }

  console.log(`✓ ${filePath}: replayed ${replayed} snapshot revision(s)`);
}

async function main(): Promise<void> {
  console.log("▶  Seeding accumulated snapshots from Git history…\n");
  for (const filePath of PROVIDER_FILES) {
    await replayFile(filePath);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
