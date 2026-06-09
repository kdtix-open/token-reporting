import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import {
  accumulatedPathForLatest,
  mergeByKey,
  readJsonIfExists
} from "../../lib/snapshotHistory";
import { aggregateGitHubCopilotUsageRecords } from "./service";
import type {
  GitHubCopilotLatestUsersReport,
  GitHubCopilotUsageRecord
} from "./types";

interface PersistReportArgs {
  organization: string;
  report: GitHubCopilotLatestUsersReport;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistGitHubCopilotLatestUsersReportMetadata({
  organization,
  report,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "github-copilot",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed(
    `Persisting GitHub Copilot metadata for ${organization}`,
    env
  );

  const snapshot = {
    ...report,
    generatedAt: new Date().toISOString()
  };
  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<GitHubCopilotLatestUsersReport>(accumulatedPath);
  const accumulated = existing ? mergeGitHubCopilotReports(existing, snapshot) : snapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function mergeGitHubCopilotReports(
  existing: GitHubCopilotLatestUsersReport,
  incoming: GitHubCopilotLatestUsersReport
): GitHubCopilotLatestUsersReport {
  const records = mergeByKey(
    existing.usage_records ?? [],
    incoming.usage_records ?? [],
    githubCopilotRecordKey
  ).sort((a, b) => a.day.localeCompare(b.day));

  return {
    ...incoming,
    report_start_day:
      existing.report_start_day < incoming.report_start_day
        ? existing.report_start_day
        : incoming.report_start_day,
    report_end_day:
      existing.report_end_day > incoming.report_end_day
        ? existing.report_end_day
        : incoming.report_end_day,
    usage_summary:
      records.length > 0
        ? aggregateGitHubCopilotUsageRecords(records)
        : incoming.usage_summary ?? existing.usage_summary,
    usage_records: records,
    billing_seats: incoming.billing_seats ?? existing.billing_seats
  };
}

function githubCopilotRecordKey(record: GitHubCopilotUsageRecord): string {
  return [
    record.day,
    record.user_id ?? record.user_login ?? "",
    record.totals_by_cli?.request_count ?? 0,
    record.user_initiated_interaction_count
  ].join(":");
}
