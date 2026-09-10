import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveDataRoot } from "../../lib/dataRoot";
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
  dataRoot?: string;
  env?: NodeJS.ProcessEnv;
}

/** Persist corrected user/day observations without retaining temporary signed URLs. */
export async function persistGitHubCopilotLatestUsersReportMetadata({
  organization,
  report,
  env = process.env,
  dataRoot,
  outputPath = path.join(resolveDataRoot({ dataRoot, env }), "github-copilot", "latest-metadata.json")
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed(
    `Persisting GitHub Copilot metadata for ${organization}`,
    env
  );

  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<GitHubCopilotLatestUsersReport>(accumulatedPath);
  const aliases = identifiedLoginAliases([
    ...existing?.usage_records ?? [],
    ...report.usage_records ?? []
  ]);
  const snapshot = safeSnapshot(report, aliases);
  const accumulated = existing ? mergeGitHubCopilotReports(existing, snapshot, aliases) : snapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function mergeGitHubCopilotReports(
  existing: GitHubCopilotLatestUsersReport,
  incoming: GitHubCopilotLatestUsersReport,
  aliases: Map<string, Set<number>>
): GitHubCopilotLatestUsersReport {
  const records = normalizeRecords([
    ...existing.usage_records ?? [],
    ...incoming.usage_records ?? []
  ], aliases);

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
  return JSON.stringify(record.user_id !== undefined
    ? [record.day, "id", record.user_id]
    : [record.day, "login", normalizedLogin(record)]);
}

function normalizedLogin(record: GitHubCopilotUsageRecord): string {
  return record.user_login?.trim().toLowerCase() ?? "";
}

function loginKey(record: GitHubCopilotUsageRecord): string {
  return JSON.stringify([record.day, normalizedLogin(record)]);
}

function identifiedLoginAliases(records: GitHubCopilotUsageRecord[]): Map<string, Set<number>> {
  const aliases = new Map<string, Set<number>>();
  for (const record of records) {
    if (record.user_id === undefined || !normalizedLogin(record)) continue;
    const key = loginKey(record);
    const ids = aliases.get(key) ?? new Set<number>();
    ids.add(record.user_id);
    aliases.set(key, ids);
  }
  return aliases;
}

function normalizeRecords(
  records: GitHubCopilotUsageRecord[],
  aliases: Map<string, Set<number>>
): GitHubCopilotUsageRecord[] {
  const identified = records.map((record) => {
    if (record.user_id !== undefined) return record;
    if (!normalizedLogin(record)) {
      throw new Error("Copilot usage observation requires a stable user identity before persistence.");
    }
    const ids = aliases.get(loginKey(record));
    if (ids && ids.size > 1) {
      throw new Error("Copilot usage login identity is ambiguous; persistence was refused.");
    }
    const userId = ids?.values().next().value;
    return userId === undefined ? record : { ...record, user_id: userId };
  });
  return mergeByKey([], identified, githubCopilotRecordKey)
    .sort((a, b) => a.day.localeCompare(b.day));
}

function safeSnapshot(
  report: GitHubCopilotLatestUsersReport,
  aliases: Map<string, Set<number>>
): GitHubCopilotLatestUsersReport & { download_link_count: number } {
  const records = report.usage_records === undefined
    ? undefined : normalizeRecords(report.usage_records, aliases);
  return {
    ...report,
    download_links: [],
    download_link_count: safeDownloadCount(report),
    generatedAt: new Date().toISOString(),
    usage_records: records,
    usage_summary: records === undefined ? report.usage_summary : aggregateGitHubCopilotUsageRecords(records)
  };
}

function safeDownloadCount(report: GitHubCopilotLatestUsersReport): number {
  if (report.download_links.length > 0) return report.download_links.length;
  const count = "download_link_count" in report ? report.download_link_count : undefined;
  return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : 0;
}
