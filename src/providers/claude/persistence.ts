import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import {
  accumulatedPathForLatest,
  mergeByKey,
  readJsonIfExists
} from "../../lib/snapshotHistory";
import type { ClaudeUsageReport, ClaudeCostsReport } from "./types";

interface PersistReportArgs {
  report: ClaudeUsageReport;
  costs?: ClaudeCostsReport;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistClaudeUsageReport({
  report,
  costs,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "claude",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting Claude usage data", env);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    usage: report,
    ...(costs ? { costs } : {})
  };
  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<typeof snapshot>(accumulatedPath);
  const accumulated = existing ? mergeClaudeSnapshots(existing, snapshot) : snapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function mergeClaudeSnapshots<T extends { usage: ClaudeUsageReport; costs?: ClaudeCostsReport }>(
  existing: T,
  incoming: T
): T {
  const usageData = mergeByKey(
    existing.usage.data,
    incoming.usage.data,
    (bucket) => `${bucket.starting_at}:${bucket.ending_at}`
  ).sort((a, b) => a.starting_at.localeCompare(b.starting_at));

  const existingCosts = existing.costs?.data ?? [];
  const incomingCosts = incoming.costs?.data ?? [];
  const costsData = mergeByKey(
    existingCosts,
    incomingCosts,
    (bucket) => `${bucket.starting_at}:${bucket.ending_at}`
  ).sort((a, b) => a.starting_at.localeCompare(b.starting_at));

  return {
    ...incoming,
    usage: { data: usageData, has_more: false, next_page: null },
    ...(costsData.length > 0
      ? { costs: { data: costsData, has_more: false, next_page: null } }
      : {})
  } as T;
}
