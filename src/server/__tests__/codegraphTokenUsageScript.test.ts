import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptPath = "scripts/analyze-codegraph-token-usage.mjs";

describe("analyze-codegraph-token-usage", () => {
  it("analyzeCodeGraphTokenUsage_FiltersToRepoRootAndUsesCodexBillableProxyFormula", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(path.join(fixture.repoRoot, "subdir")),
      toolCall("mcp__codegraph.codegraph_explore", "{}"),
      tokenCount("2026-07-10T17:00:00.000Z", {
        cached_input_tokens: 10,
        input_tokens: 60,
        output_tokens: 20,
        reasoning_output_tokens: 5,
        total_tokens: 80
      }),
      tokenCount("2026-07-10T17:02:00.000Z", {
        cached_input_tokens: 20,
        input_tokens: 100,
        output_tokens: 30,
        reasoning_output_tokens: 7,
        total_tokens: 130
      }),
      "{bad json",
      toolCall("exec_command", "{\"cmd\":\"rg token scripts\"}"),
      tokenCount("2026-07-10T17:05:00.000Z", {
        cached_input_tokens: 10,
        input_tokens: 90,
        output_tokens: 20,
        reasoning_output_tokens: 5,
        total_tokens: 110
      }),
      tokenCount("2026-07-10T17:07:00.000Z", {
        cached_input_tokens: 50,
        input_tokens: 200,
        output_tokens: 40,
        reasoning_output_tokens: 11,
        total_tokens: 240
      })
    ]);
    await writeSession(fixture.sessionsDir, "excluded.jsonl", [
      sessionMeta("/tmp/unrelated-repo"),
      toolCall("mcp__codegraph.codegraph_explore", "{}"),
      tokenCount("2026-07-10T17:10:00.000Z", {
        input_tokens: 999,
        output_tokens: 1,
        total_tokens: 1000
      })
    ]);

    await runAnalyzer(fixture, ["--repo-root", fixture.repoRoot]);

    const report = await readLatestReport(fixture.outDir);
    expect(report.totals).toMatchObject({
      excludedSessionFileCount: 1,
      includedSessionFileCount: 1,
      measuredTurnCount: 4,
      sessionFileCount: 2
    });
    expect(report.classifications.other.billableProxyTokens.median).toBe(95);
    expect(report.classifications.codegraph_assisted.billableProxyTokens.median).toBe(130);
    expect(report.classifications.codegraph_assisted.uncachedInputTokens.median).toBe(80);
    expect(report.classifications.shell_search_read.billableProxyTokens.median).toBe(240);
    expect(report.comparison.metrics.billableProxyTokens.delta).toBe(110);
  });

  it("analyzeCodeGraphTokenUsage_HeartbeatAnalyzerSession_IsExcludedFromSamples", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessionsDir, "heartbeat.jsonl", [
      sessionMeta(fixture.repoRoot),
      toolCall(
        "exec_command",
        "{\"cmd\":\"codegraph status . && node scripts/analyze-codegraph-token-usage.mjs --journal-issue kdtix-open/token-reporting#25\"}"
      ),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 100,
        output_tokens: 30,
        total_tokens: 130
      }),
      tokenCount("2026-07-10T17:02:00.000Z", {
        input_tokens: 200,
        output_tokens: 40,
        total_tokens: 240
      })
    ]);

    await runAnalyzer(fixture, ["--repo-root", fixture.repoRoot]);

    const report = await readLatestReport(fixture.outDir);
    expect(report.totals).toMatchObject({
      excludedSessionFileCount: 1,
      excludedSessionReasonCounts: {
        codegraph_token_usage_heartbeat: 1
      },
      includedSessionFileCount: 0,
      measuredTurnCount: 0,
      sessionFileCount: 1
    });
    expect(report.excludedSessionFiles).toEqual([
      expect.objectContaining({ reason: "codegraph_token_usage_heartbeat" })
    ]);
    expect(report.classifications.codegraph_assisted.turnCount).toBe(0);
  });

  it("analyzeCodeGraphTokenUsage_EmptyComparisonCohort_RendersNotAvailableDelta", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessionsDir, "shell-only.jsonl", [
      sessionMeta(fixture.repoRoot),
      toolCall("exec_command", "{\"cmd\":\"rg token scripts\"}"),
      tokenCount("2026-07-10T17:05:00.000Z", {
        input_tokens: 50,
        output_tokens: 10,
        total_tokens: 60
      }),
      tokenCount("2026-07-10T17:06:00.000Z", {
        input_tokens: 200,
        output_tokens: 40,
        total_tokens: 240
      })
    ]);

    await runAnalyzer(fixture, ["--repo-root", fixture.repoRoot]);

    const report = await readLatestReport(fixture.outDir);
    const markdown = await fs.readFile(
      path.join(fixture.outDir, "latest-codegraph-token-usage.md"),
      "utf8"
    );
    expect(report.comparison.metrics.billableProxyTokens).toMatchObject({
      codegraphMedian: null,
      delta: null,
      deltaPercentVsShell: null,
      shellSearchReadMedian: null
    });
    expect(markdown).toContain("| billableProxyTokens | n/a | n/a | n/a | n/a |");
  });

  it("analyzeCodeGraphTokenUsage_EvenCohort_UsesMidpointMedian", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(fixture.repoRoot),
      toolCall("mcp__codegraph.codegraph_explore", "{}"),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20
      }),
      tokenCount("2026-07-10T17:01:00.000Z", {
        input_tokens: 80,
        output_tokens: 20,
        total_tokens: 100
      }),
      toolCall("mcp__codegraph.codegraph_explore", "{}"),
      tokenCount("2026-07-10T17:02:00.000Z", {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20
      }),
      tokenCount("2026-07-10T17:03:00.000Z", {
        input_tokens: 180,
        output_tokens: 20,
        total_tokens: 200
      })
    ]);

    await runAnalyzer(fixture, ["--repo-root", fixture.repoRoot]);

    const report = await readLatestReport(fixture.outDir);
    expect(report.classifications.codegraph_assisted.billableProxyTokens.median).toBe(150);
  });

  it("analyzeCodeGraphTokenUsage_GitAndJqDiscovery_ClassifiesAsShellSearchRead", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(fixture.repoRoot),
      toolCall("exec_command", "{\"cmd\":\"git show --stat HEAD && jq . package.json\"}"),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 50,
        output_tokens: 10,
        total_tokens: 60
      }),
      tokenCount("2026-07-10T17:01:00.000Z", {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120
      })
    ]);

    await runAnalyzer(fixture, ["--repo-root", fixture.repoRoot]);

    const report = await readLatestReport(fixture.outDir);
    expect(report.classifications.shell_search_read).toMatchObject({
      billableProxyTokens: {
        median: 120
      },
      turnCount: 1
    });
  });

  it("analyzeCodeGraphTokenUsage_ReadOnlyMode_BlocksLocalAndRemoteMutations", async () => {
    const fixture = await createFixture();
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(fixture.repoRoot),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 100,
        output_tokens: 30,
        total_tokens: 130
      })
    ]);

    await expect(
      runAnalyzer(fixture, ["--repo-root", fixture.repoRoot, "--journal-issue", "kdtix-open/token-reporting#25"], {
        TOKEN_REPORTING_READ_ONLY: "1"
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("TOKEN_REPORTING_READ_ONLY")
    });
    await expect(pathExists(fixture.outDir)).resolves.toBe(false);
  });

  it("analyzeCodeGraphTokenUsage_JournalFailure_ReportsGhError", async () => {
    const fixture = await createFixture();
    const mockBinDir = path.join(fixture.root, "bin");
    await fs.mkdir(mockBinDir);
    await fs.writeFile(
      path.join(mockBinDir, "gh"),
      "#!/usr/bin/env bash\nprintf 'mock gh failure' >&2\nexit 42\n",
      { mode: 0o755 }
    );
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(fixture.repoRoot),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 100,
        output_tokens: 30,
        total_tokens: 130
      })
    ]);

    await expect(
      runAnalyzer(fixture, ["--repo-root", fixture.repoRoot, "--journal-issue", "kdtix-open/token-reporting#25"], {
        PATH: `${mockBinDir}:${process.env.PATH ?? ""}`
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("mock gh failure")
    });
    await expect(pathExists(path.join(fixture.outDir, "latest-codegraph-token-usage.md"))).resolves.toBe(
      true
    );
  });

  it("analyzeCodeGraphTokenUsage_MissingGhBinary_ReportsSpawnError", async () => {
    const fixture = await createFixture();
    const missingBinDir = path.join(fixture.root, "missing-bin");
    await fs.mkdir(missingBinDir);
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(fixture.repoRoot),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 100,
        output_tokens: 30,
        total_tokens: 130
      })
    ]);

    await expect(
      runAnalyzer(fixture, ["--repo-root", fixture.repoRoot, "--journal-issue", "kdtix-open/token-reporting#25"], {
        PATH: missingBinDir
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("spawnSync gh ENOENT")
    });
    await expect(pathExists(path.join(fixture.outDir, "latest-codegraph-token-usage.md"))).resolves.toBe(
      true
    );
  });

  it("analyzeCodeGraphTokenUsage_JournalSuccess_UsesBodyFileContract", async () => {
    const fixture = await createFixture();
    const mockBinDir = path.join(fixture.root, "bin");
    const ghArgsPath = path.join(fixture.root, "gh-args.txt");
    await fs.mkdir(mockBinDir);
    await fs.writeFile(
      path.join(mockBinDir, "gh"),
      "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$GH_ARGS_FILE\"\n",
      { mode: 0o755 }
    );
    await writeSession(fixture.sessionsDir, "included.jsonl", [
      sessionMeta(fixture.repoRoot),
      tokenCount("2026-07-10T17:00:00.000Z", {
        input_tokens: 100,
        output_tokens: 30,
        total_tokens: 130
      })
    ]);

    await runAnalyzer(fixture, ["--repo-root", fixture.repoRoot, "--journal-issue", "kdtix-open/token-reporting#25"], {
      GH_ARGS_FILE: ghArgsPath,
      PATH: `${mockBinDir}:${process.env.PATH ?? ""}`
    });

    const ghArgs = (await fs.readFile(ghArgsPath, "utf8")).trim().split("\n");
    const bodyFileIndex = ghArgs.indexOf("--body-file");
    expect(ghArgs).toEqual([
      "issue",
      "comment",
      "25",
      "--repo",
      "kdtix-open/token-reporting",
      "--body-file",
      expect.stringContaining("codegraph-token-usage-")
    ]);
    expect(bodyFileIndex).toBeGreaterThan(0);
    await expect(pathExists(ghArgs[bodyFileIndex + 1] ?? "")).resolves.toBe(true);
  });

  it("analyzeCodeGraphTokenUsage_MissingValueFlag_FailsFast", async () => {
    const fixture = await createFixture();

    await expect(
      runAnalyzer(fixture, ["--repo-root", fixture.repoRoot, "--journal-issue"])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Missing value for --journal-issue")
    });
    await expect(pathExists(fixture.outDir)).resolves.toBe(false);
  });

  it("analyzeCodeGraphTokenUsage_MissingSessionsRoot_FailsInsteadOfReportingZeroTurns", async () => {
    const fixture = await createFixture();
    const missingSessionsDir = path.join(fixture.root, "missing-sessions");

    await expect(
      runAnalyzer(fixture, ["--sessions-dir", missingSessionsDir, "--repo-root", fixture.repoRoot])
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("Unable to read sessions directory")
    });
    await expect(pathExists(fixture.outDir)).resolves.toBe(false);
  });
});

interface Fixture {
  outDir: string;
  repoRoot: string;
  root: string;
  sessionsDir: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-codegraph-usage-"));
  const sessionsDir = path.join(root, "sessions");
  const outDir = path.join(root, "out");
  const repoRoot = path.join(root, "repo");
  await fs.mkdir(sessionsDir);
  await fs.mkdir(repoRoot);
  return { outDir, repoRoot, root, sessionsDir };
}

async function runAnalyzer(
  fixture: Fixture,
  extraArgs: string[] = [],
  env: NodeJS.ProcessEnv = {}
): Promise<{ stderr: string; stdout: string }> {
  return execFileAsync(process.execPath, [
    scriptPath,
    "--sessions-dir",
    fixture.sessionsDir,
    "--out-dir",
    fixture.outDir,
    "--instruction-updated-at",
    "2026-07-10T16:00:00.000Z",
    ...extraArgs
  ], {
    env: {
      ...analyzerBaseEnv(),
      ...env
    }
  });
}

function analyzerBaseEnv(): NodeJS.ProcessEnv {
  const baseEnv = { ...process.env };
  delete baseEnv.TOKEN_REPORTING_READ_ONLY;
  return baseEnv;
}

async function writeSession(root: string, name: string, events: Array<Record<string, unknown> | string>) {
  await fs.writeFile(
    path.join(root, name),
    `${events.map((event) => (typeof event === "string" ? event : JSON.stringify(event))).join("\n")}\n`,
    "utf8"
  );
}

function sessionMeta(cwd: string): Record<string, unknown> {
  return {
    payload: {
      cwd
    },
    timestamp: "2026-07-10T16:55:00.000Z",
    type: "session_meta"
  };
}

function toolCall(name: string, args: string): Record<string, unknown> {
  return {
    payload: {
      arguments: args,
      name,
      type: "function_call"
    },
    timestamp: "2026-07-10T16:59:00.000Z",
    type: "response_item"
  };
}

function tokenCount(timestamp: string, lastTokenUsage: Record<string, number>): Record<string, unknown> {
  return {
    payload: {
      info: {
        last_token_usage: lastTokenUsage
      },
      type: "token_count"
    },
    timestamp,
    type: "event_msg"
  };
}

interface AnalyzerMetricSummary {
  median: number | null;
}

interface AnalyzerReport {
  classifications: Record<
    string,
    {
      billableProxyTokens: AnalyzerMetricSummary;
      turnCount: number;
      uncachedInputTokens: AnalyzerMetricSummary;
    }
  >;
  comparison: {
    metrics: Record<
      string,
      {
        codegraphMedian: number | null;
        delta: number | null;
        deltaPercentVsShell: number | null;
        shellSearchReadMedian: number | null;
      }
    >;
  };
  excludedSessionFiles: Array<{ reason: string }>;
  totals: Record<string, unknown>;
}

async function readLatestReport(outDir: string): Promise<AnalyzerReport> {
  return JSON.parse(await fs.readFile(path.join(outDir, "latest-codegraph-token-usage.json"), "utf8"));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
