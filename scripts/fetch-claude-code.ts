#!/usr/bin/env -S npx tsx
/**
 * Scan local Claude Code session files (~/.claude/projects/) and persist a
 * usage snapshot for the dashboard. No API key required — all data is local.
 *
 * Environment variables:
 *   CLAUDE_CODE_MONTHLY_COST  — flat monthly subscription cost (default 200)
 */
import { scanClaudeCodeSessions } from "../src/providers/claudeCode/client";
import { persistClaudeCodeSnapshot } from "../src/providers/claudeCode/persistence";

async function main() {
  const monthlyCost = Number(process.env.CLAUDE_CODE_MONTHLY_COST) || 200;

  console.log(
    `Scanning Claude Code sessions (monthly cost: $${monthlyCost})…`
  );

  const snapshot = await scanClaudeCodeSessions(undefined, monthlyCost);

  if (snapshot.dailyBuckets.length === 0) {
    console.warn("No Claude Code session data found in ~/.claude/projects/");
    return;
  }

  const totalRequests = snapshot.dailyBuckets.reduce(
    (sum, b) => sum + b.requestCount,
    0
  );

  const outputPath = await persistClaudeCodeSnapshot({ snapshot });

  console.log(
    `Saved ${snapshot.dailyBuckets.length} days, ` +
      `${totalRequests.toLocaleString()} requests, ` +
      `${snapshot.sessionCount} sessions → ${outputPath}`
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown Claude Code error";
  console.error(message);
  process.exitCode = 1;
});
