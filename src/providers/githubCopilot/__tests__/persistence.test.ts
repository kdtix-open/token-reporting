import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { persistGitHubCopilotLatestUsersReportMetadata } from "../persistence";
import { githubCopilotUsageRecordSchema, type GitHubCopilotLatestUsersReport, type GitHubCopilotUsageRecord } from "../types";

let root: string;
let outputPath: string;
let accumulatedPath: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "copilot-identity-test-"));
  outputPath = path.join(root, "latest-metadata.json");
  accumulatedPath = path.join(root, "accumulated-metadata.json");
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

function record(overrides: Partial<GitHubCopilotUsageRecord> = {}): GitHubCopilotUsageRecord {
  return githubCopilotUsageRecordSchema.parse({
    day: "2026-09-08", user_id: 1, user_login: "fixture-user",
    user_initiated_interaction_count: 10,
    totals_by_cli: { request_count: 8, session_count: 1, prompt_count: 1 },
    ...overrides
  });
}

async function persist(records: GitHubCopilotUsageRecord[]) {
  await persistGitHubCopilotLatestUsersReportMetadata({
    organization: "fixture-org", outputPath, env: {}, report: {
      report_start_day: "2026-09-01", report_end_day: "2026-09-09",
      download_links: [], usage_records: records
    }
  });
  return JSON.parse(await fs.readFile(accumulatedPath, "utf8"));
}

describe("GitHub Copilot stable history identity (#45)", () => {
  it("persist_CorrectedMutableCounts_ReplacesPriorUserDay", async () => {
    await persist([record()]);
    const corrected = record({ user_initiated_interaction_count: 3, totals_by_cli: { request_count: 2, session_count: 1, prompt_count: 1 } });
    const saved = await persist([corrected]);
    expect(saved.usage_records).toEqual([corrected]);
    expect(saved.usage_summary).toMatchObject({ totalInteractions: 3, totalCliRequests: 2 });
  });

  it("persist_RepeatedIdenticalReport_IsIdempotent", async () => {
    const records = [record(), record({ user_id: 2, user_login: "second-user" })];
    const first = await persist(records);
    const second = await persist(records);
    expect(second.usage_records).toEqual(first.usage_records);
    expect(second.usage_summary).toEqual(first.usage_summary);
  });

  it("persist_DistinctUsersAndDays_PreservesAllObservations", async () => {
    const first = [record(), record({ user_id: 2, user_login: "second-user" })];
    const next = first.map((entry) => ({ ...entry, day: "2026-09-09" }));
    await persist(first);
    const saved = await persist(next);
    expect(saved.usage_records).toHaveLength(4);
    expect(saved.usage_summary).toMatchObject({ totalInteractions: 40, totalCliRequests: 32 });
  });

  it("persist_UserIdWithRenamedLogin_KeepsStableIdentity", async () => {
    await persist([record()]);
    const renamed = record({ user_login: "renamed-user", user_initiated_interaction_count: 1 });
    expect((await persist([renamed])).usage_records).toEqual([renamed]);
  });

  it("persist_LoginFallbackWithKnownId_PreservesVerifiedIdentityAndLaterRename", async () => {
    await persist([record()]);
    const loginOnly = record({ user_id: undefined, user_login: "Fixture-User", user_initiated_interaction_count: 3 });
    expect((await persist([loginOnly])).usage_records).toEqual([{ ...loginOnly, user_id: 1 }]);
    const renamed = record({ user_login: "renamed-user", user_initiated_interaction_count: 2 });
    expect((await persist([renamed])).usage_records).toEqual([renamed]);
  });

  it("persist_LoginOnlyRecords_UsesNormalizedIdentifiedLogin", async () => {
    await persist([record({ user_id: undefined, user_login: "Fixture-User" })]);
    const corrected = record({ user_id: undefined, user_login: "fixture-user", user_initiated_interaction_count: 2 });
    expect((await persist([corrected])).usage_records).toEqual([corrected]);
  });

  it("persist_DuplicateRowsInFirstReport_DeduplicatesAndRecomputesSummary", async () => {
    const corrected = record({ user_initiated_interaction_count: 2 });
    const saved = await persist([record(), corrected]);
    const latest = JSON.parse(await fs.readFile(outputPath, "utf8"));
    expect(saved.usage_records).toEqual([corrected]);
    expect(saved.usage_summary.totalInteractions).toBe(2);
    expect(latest.usage_records).toEqual([corrected]);
    expect(latest.usage_summary.totalInteractions).toBe(2);
  });

  it.each([undefined, "", " "])("persist_AnonymousInitialRecord=%j_FailsBeforeAnyWrite", async (user_login) => {
    await expect(persist([record({ user_id: undefined, user_login })])).rejects.toThrow("stable user identity");
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("persist_AnonymousIncomingRecord_PreservesPriorFiles", async () => {
    await persist([record()]);
    const before = await Promise.all([outputPath, accumulatedPath].map((file) => fs.readFile(file, "utf8")));
    await expect(persist([record({ user_id: undefined, user_login: undefined })])).rejects.toThrow("stable user identity");
    expect(await Promise.all([outputPath, accumulatedPath].map((file) => fs.readFile(file, "utf8")))).toEqual(before);
  });

  it("persist_AmbiguousLoginOnlyRecord_FailsWithoutCollapsingDistinctIds", async () => {
    await persist([record(), record({ user_id: 2 })]);
    await expect(persist([record({ user_id: undefined })])).rejects.toThrow("ambiguous");
    expect(JSON.parse(await fs.readFile(accumulatedPath, "utf8")).usage_records).toHaveLength(2);
  });

  it("persist_SignedDownloadLinks_PersistsOnlySafeCountInBothFiles", async () => {
    const report = {
      report_start_day: "2026-09-01", report_end_day: "2026-09-09", usage_records: [record()],
      download_links: ["https://signed.invalid/report?fixture_credential=DO_NOT_PUBLISH"]
    };
    await fs.writeFile(accumulatedPath, JSON.stringify(report));
    await persistGitHubCopilotLatestUsersReportMetadata({ organization: "fixture-org", outputPath, env: {}, report });
    for (const file of [outputPath, accumulatedPath]) {
      const serialized = await fs.readFile(file, "utf8");
      expect(serialized).not.toMatch(/signed\.invalid|fixture_credential|DO_NOT_PUBLISH/);
      expect(JSON.parse(serialized)).toMatchObject({ download_links: [], download_link_count: 1 });
    }
  });

  it("persist_AlreadyRedactedReplay_PreservesSafeDownloadCount", async () => {
    const report: GitHubCopilotLatestUsersReport & { download_link_count: number } = {
      report_start_day: "2026-09-01", report_end_day: "2026-09-09",
      usage_records: [record()], download_links: [], download_link_count: 4
    };
    await persistGitHubCopilotLatestUsersReportMetadata({ organization: "fixture-org", outputPath, env: {}, report });
    expect(JSON.parse(await fs.readFile(outputPath, "utf8"))).toMatchObject({ download_links: [], download_link_count: 4 });
    expect(JSON.parse(await fs.readFile(accumulatedPath, "utf8"))).toMatchObject({ download_links: [], download_link_count: 4 });
  });
});
