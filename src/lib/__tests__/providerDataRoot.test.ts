import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistClaudeUsageReport } from "../../providers/claude/persistence";
import { persistClaudeCodeSnapshot } from "../../providers/claudeCode/persistence";
import { persistCodexUsageReport } from "../../providers/codex/persistence";
import { persistCursorDailyUsageReport } from "../../providers/cursor/persistence";
import { persistGitHubCopilotLatestUsersReportMetadata } from "../../providers/githubCopilot/persistence";
import { resolveFetchDayWindow } from "../providerHistory";

interface PersistenceOptions { env: NodeJS.ProcessEnv; outputPath?: string; dataRoot?: string }

const providers = [
  { id: "claude", persist: (options: PersistenceOptions) => persistClaudeUsageReport({
    report: { data: [], has_more: false, next_page: null }, ...options
  }) },
  { id: "codex", persist: (options: PersistenceOptions) => persistCodexUsageReport({
    usage: { data: [], has_more: false, next_page: null }, ...options
  }) },
  { id: "cursor", persist: (options: PersistenceOptions) => persistCursorDailyUsageReport({
    report: { data: [], period: { startDate: 0, endDate: 1 } }, ...options
  }) },
  { id: "github-copilot", persist: (options: PersistenceOptions) => persistGitHubCopilotLatestUsersReportMetadata({
    organization: "fixture-org", report: {
      download_links: [], report_start_day: "2026-09-01", report_end_day: "2026-09-08"
    }, ...options
  }) },
  { id: "claude-code", persist: (options: PersistenceOptions) => persistClaudeCodeSnapshot({
    snapshot: {
      generatedAt: "2026-09-09T00:00:00.000Z", monthlySeatCost: 0,
      sessionCount: 0, modelsUsed: [], dailyBuckets: []
    }, ...options
  }) }
];

let root: string;
let codeRoot: string;
let dataRoot: string;
let env: NodeJS.ProcessEnv;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-data-root-test-"));
  codeRoot = path.join(root, "deploy-code");
  dataRoot = path.join(root, "served-data");
  await fs.mkdir(codeRoot);
  vi.spyOn(process, "cwd").mockReturnValue(codeRoot);
  env = { TOKEN_REPORTING_DATA_ROOT: dataRoot, TOKEN_REPORTING_CURSOR_REDACTION_SALT: "fixture-only-salt" };
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  await fs.rm(root, { recursive: true, force: true });
});

describe("provider data-root invariant", () => {
  it.each(providers)("$id / persist_SeparateCodeRoot_WritesBothSnapshotsToServedRoot", async ({ id, persist }) => {
    expect(await persist({ env })).toBe(path.join(dataRoot, id, "latest-metadata.json"));
    for (const file of ["latest-metadata.json", "accumulated-metadata.json"]) {
      expect(JSON.parse(await fs.readFile(path.join(dataRoot, id, file), "utf8"))).toHaveProperty("generatedAt");
    }
    expect(await fs.readdir(codeRoot)).toEqual([]);
  });

  it.each(providers)("$id / persist_ExplicitOutputPath_TakesPrecedenceOverConfiguredRoot", async ({ persist }) => {
    const outputPath = path.join(root, "explicit", "snapshot.json");
    expect(await persist({ env, outputPath })).toBe(outputPath);
    expect(await fs.readdir(path.dirname(outputPath))).toEqual(["accumulated-metadata.json", "snapshot.json"]);
    await expect(fs.access(dataRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(providers)("$id / persist_ExplicitDataRoot_TakesPrecedenceOverEnvironment", async ({ id, persist }) => {
    const explicitRoot = path.join(root, "explicit-data");
    expect(await persist({ env, dataRoot: explicitRoot })).toBe(path.join(explicitRoot, id, "latest-metadata.json"));
    await expect(fs.access(dataRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(providers)("$id / persist_ReadOnly_DoesNotCreateEitherRootOrWriteSnapshot", async ({ persist }) => {
    await expect(persist({ env: { ...env, TOKEN_REPORTING_READ_ONLY: "true" } })).rejects.toThrow("TOKEN_REPORTING_READ_ONLY");
    expect(await fs.readdir(codeRoot)).toEqual([]);
    await expect(fs.access(dataRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    { id: "claude" as const, snapshot: { usage: { data: [{ ending_at: "2026-09-09T00:00:00Z" }] } } },
    { id: "codex" as const, snapshot: { usage: { data: [{ end_time: Date.parse("2026-09-09T00:00:00Z") / 1000 }] } } },
    { id: "cursor" as const, snapshot: { daily: { data: [{ day: "2026-09-08" }] } } }
  ])("$id / resolveFetchDayWindow_ConfiguredRoot_ReadsServedHistory", async ({ id, snapshot }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00.000Z"));
    await fs.mkdir(path.join(dataRoot, id), { recursive: true });
    await fs.writeFile(path.join(dataRoot, id, "accumulated-metadata.json"), JSON.stringify(snapshot));
    expect(await resolveFetchDayWindow(id, env)).toEqual({ startDay: "2026-09-07", endDay: "2026-09-09" });
    expect(await fs.readdir(codeRoot)).toEqual([]);
  });
});
