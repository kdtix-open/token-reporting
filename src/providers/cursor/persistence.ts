import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import type {
  CursorDailyUsageResponse,
  CursorFilteredUsageEventsResponse,
  CursorTeamSpendResponse
} from "./types";

interface PersistReportArgs {
  /** Daily usage response (legacy) — wrapped under `daily` in the new snapshot. */
  report: CursorDailyUsageResponse;
  /** Optional per-member spend snapshot. */
  spend?: CursorTeamSpendResponse;
  /** Optional per-event usage feed. */
  events?: CursorFilteredUsageEventsResponse;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistCursorDailyUsageReport({
  report,
  spend,
  events,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "cursor",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting Cursor usage data", env);

  const snapshot: { daily: CursorDailyUsageResponse; spend?: CursorTeamSpendResponse; events?: CursorFilteredUsageEventsResponse } = {
    daily: report
  };
  if (spend) snapshot.spend = spend;
  if (events) snapshot.events = events;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return outputPath;
}
