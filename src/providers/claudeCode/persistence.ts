import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import {
  accumulatedPathForLatest,
  mergeByKey,
  readJsonIfExists
} from "../../lib/snapshotHistory";
import type { ClaudeCodeSnapshot } from "./types";

interface PersistSnapshotArgs {
  snapshot: ClaudeCodeSnapshot;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistClaudeCodeSnapshot({
  snapshot,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "claude-code",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistSnapshotArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting Claude Code usage data", env);

  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<ClaudeCodeSnapshot>(accumulatedPath);
  const accumulated = existing ? mergeClaudeCodeSnapshots(existing, snapshot) : snapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function mergeClaudeCodeSnapshots(
  existing: ClaudeCodeSnapshot,
  incoming: ClaudeCodeSnapshot
): ClaudeCodeSnapshot {
  const dailyBuckets = mergeByKey(
    existing.dailyBuckets,
    incoming.dailyBuckets,
    (bucket) => bucket.date
  ).sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...incoming,
    generatedAt: incoming.generatedAt,
    sessionCount: Math.max(existing.sessionCount, incoming.sessionCount),
    modelsUsed: Array.from(new Set([...existing.modelsUsed, ...incoming.modelsUsed])).sort(),
    dailyBuckets
  };
}
