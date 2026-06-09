import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import {
  accumulatedPathForLatest,
  mergeByKey,
  readJsonIfExists
} from "../../lib/snapshotHistory";
import type { CodexUsageReport, CodexCostsReport } from "./types";

interface PersistReportArgs {
  usage: CodexUsageReport;
  costs?: CodexCostsReport;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistCodexUsageReport({
  usage,
  costs,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "codex",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting OpenAI Codex usage data", env);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    usage,
    ...(costs ? { costs } : {})
  };
  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<typeof snapshot>(accumulatedPath);
  const accumulated = existing ? mergeCodexSnapshots(existing, snapshot) : snapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function mergeCodexSnapshots<T extends { usage: CodexUsageReport; costs?: CodexCostsReport }>(
  existing: T,
  incoming: T
): T {
  const usageData = mergeByKey(
    existing.usage.data,
    incoming.usage.data,
    (bucket) => `${bucket.start_time}:${bucket.end_time}`
  ).sort((a, b) => a.start_time - b.start_time);

  const existingCosts = existing.costs?.data ?? [];
  const incomingCosts = incoming.costs?.data ?? [];
  const costsData = mergeByKey(
    existingCosts,
    incomingCosts,
    (bucket) => `${bucket.start_time}:${bucket.end_time}`
  ).sort((a, b) => a.start_time - b.start_time);

  return {
    ...incoming,
    usage: { data: usageData, has_more: false, next_page: null },
    ...(costsData.length > 0
      ? { costs: { data: costsData, has_more: false, next_page: null } }
      : {})
  } as T;
}
