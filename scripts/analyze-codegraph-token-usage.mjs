#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const DEFAULT_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");
const DEFAULT_AGENTS_FILE = path.join(os.homedir(), ".codex", "AGENTS.md");
const DEFAULT_OUT_DIR = path.join(
  os.homedir(),
  ".codex",
  "automations",
  "codegraph-token-usage-heartbeat"
);

const args = parseArgs(process.argv.slice(2));
const sessionsDir = path.resolve(args.sessionsDir ?? DEFAULT_SESSIONS_DIR);
const agentsFile = path.resolve(args.agentsFile ?? DEFAULT_AGENTS_FILE);
const outDir = path.resolve(args.outDir ?? DEFAULT_OUT_DIR);
const repoRoot = path.resolve(args.repoRoot ?? process.cwd());
const generatedAt = new Date();
const instructionUpdatedAt = args.instructionUpdatedAt
  ? new Date(args.instructionUpdatedAt)
  : fs.existsSync(agentsFile)
    ? fs.statSync(agentsFile).mtime
    : null;

const sessionFiles = walkJsonl(sessionsDir);
const includedSessionFiles = [];
const excludedSessionFiles = [];
const allTurns = [];
const allToolCalls = [];

for (const file of sessionFiles) {
  const { exclusionReason, included, sessionCwd, turns, toolCalls } = await parseSession(file, repoRoot);
  if (included) {
    includedSessionFiles.push(file);
  } else {
    excludedSessionFiles.push({ file, reason: exclusionReason, sessionCwd });
  }
  allTurns.push(...turns);
  allToolCalls.push(...toolCalls);
}

allTurns.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

const report = buildReport({
  generatedAt,
  instructionUpdatedAt,
  sessionsDir,
  agentsFile,
  sessionFiles,
  includedSessionFiles,
  excludedSessionFiles,
  repoRoot,
  turns: allTurns,
  toolCalls: allToolCalls,
});

if (isReadOnlyMode()) {
  throw new Error(
    "CodeGraph token usage heartbeat is disabled while TOKEN_REPORTING_READ_ONLY is enabled."
  );
}

fs.mkdirSync(outDir, { recursive: true });
const stamp = generatedAt.toISOString().replace(/[:.]/g, "-");
const jsonPath = path.join(outDir, `codegraph-token-usage-${stamp}.json`);
const markdownPath = path.join(outDir, `codegraph-token-usage-${stamp}.md`);
const latestJsonPath = path.join(outDir, "latest-codegraph-token-usage.json");
const latestMarkdownPath = path.join(outDir, "latest-codegraph-token-usage.md");
const memoryPath = path.join(outDir, "memory.md");

fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(markdownPath, renderMarkdown(report));
fs.copyFileSync(jsonPath, latestJsonPath);
fs.copyFileSync(markdownPath, latestMarkdownPath);
fs.writeFileSync(memoryPath, renderMemory(report));

if (args.journalIssue) {
  journalReport(args.journalIssue, markdownPath);
}

console.log(`Wrote ${markdownPath}`);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${memoryPath}`);
console.log(
  JSON.stringify(
    {
      measuredTurns: report.totals.measuredTurnCount,
      codegraphAssistedTurns: report.totals.codegraphAssistedTurnCount,
      shellSearchReadTurns: report.totals.shellSearchReadTurnCount,
      firstCodegraphToolAt: report.firstCodegraphToolAt,
      latestMarkdownPath,
    },
    null,
    2
  )
);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--sessions-dir") {
      parsed.sessionsDir = argv[++index];
    } else if (arg === "--repo-root") {
      parsed.repoRoot = argv[++index];
    } else if (arg === "--agents-file") {
      parsed.agentsFile = argv[++index];
    } else if (arg === "--instruction-updated-at") {
      parsed.instructionUpdatedAt = argv[++index];
    } else if (arg === "--out-dir") {
      parsed.outDir = argv[++index];
    } else if (arg === "--journal-issue") {
      parsed.journalIssue = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/analyze-codegraph-token-usage.mjs [options]

Options:
  --sessions-dir <path>              Codex sessions directory.
  --repo-root <path>                 Repo root used to include/exclude sessions by session_meta cwd.
  --agents-file <path>               AGENTS.md used for instruction timestamp.
  --instruction-updated-at <iso>     Override the instruction update timestamp.
  --out-dir <path>                   Report output directory.
  --journal-issue <owner/repo#num>   Post the Markdown report to a GitHub issue.
`);
}

function walkJsonl(root) {
  const results = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

async function parseSession(file, repoRoot) {
  const turns = [];
  const toolCalls = [];
  let currentSegment = emptySegment();
  let pendingSegment = emptySegment();
  let sessionCwd = null;
  let isHeartbeatSession = false;

  const reader = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = event.payload;
    if (!payload || typeof payload !== "object") continue;
    isHeartbeatSession = isHeartbeatSession || isHeartbeatAnalyzerInvocation(payload);

    if (event.type === "session_meta" && typeof payload.cwd === "string") {
      sessionCwd = payload.cwd;
      continue;
    }

    if (event.type === "response_item" && payload.type === "function_call") {
      const call = classifyToolCall(payload, event.timestamp, file);
      toolCalls.push(call);
      pendingSegment.toolCalls += 1;
      pendingSegment.codegraphCalls += call.isCodeGraph ? 1 : 0;
      pendingSegment.shellSearchReadCalls += call.isShellSearchRead ? 1 : 0;
      pendingSegment.readExplorationCalls += call.isReadExploration ? 1 : 0;
      continue;
    }

    if (event.type === "event_msg" && payload.type === "token_count") {
      const usage = payload.info?.last_token_usage;
      if (usage && event.timestamp) {
        turns.push({
          timestamp: event.timestamp,
          file,
          classification: classifyTurn(currentSegment),
          toolCalls: currentSegment.toolCalls,
          codegraphCalls: currentSegment.codegraphCalls,
          shellSearchReadCalls: currentSegment.shellSearchReadCalls,
          readExplorationCalls: currentSegment.readExplorationCalls,
          usage: normalizeUsage(usage),
        });
      }
      currentSegment = pendingSegment;
      pendingSegment = emptySegment();
    }
  }

  const insideRepoRoot = isPathInside(sessionCwd, repoRoot);
  const included = insideRepoRoot && !isHeartbeatSession;
  return {
    exclusionReason: included
      ? null
      : isHeartbeatSession
        ? "codegraph_token_usage_heartbeat"
        : "outside_repo_root",
    included,
    sessionCwd,
    toolCalls: included ? toolCalls : [],
    turns: included ? turns : [],
  };
}

function isHeartbeatAnalyzerInvocation(payload) {
  if (payload.type !== "function_call") return false;
  const name = String(payload.name ?? "").toLowerCase();
  if (name !== "exec_command") return false;
  const args = String(payload.arguments ?? "").toLowerCase();
  return /(?:^|[\s"'/:])node\s+(?:\.\/)?scripts\/analyze-codegraph-token-usage\.mjs\b/u.test(args);
}

function isPathInside(candidate, root) {
  if (!candidate) return false;
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function emptySegment() {
  return {
    toolCalls: 0,
    codegraphCalls: 0,
    shellSearchReadCalls: 0,
    readExplorationCalls: 0,
  };
}

function classifyToolCall(payload, timestamp, file) {
  const name = String(payload.name ?? "");
  const args = String(payload.arguments ?? "").toLowerCase();
  const lowerName = name.toLowerCase();
  const isMcpCodeGraph = lowerName.includes("codegraph");
  const isShellCodeGraph = lowerName === "exec_command" && /\bcodegraph\s+/.test(args);
  const isCodeGraph = isMcpCodeGraph || isShellCodeGraph;
  const isShellSearchRead =
    lowerName === "exec_command" &&
    /\b(rg|grep|find|sed|awk|cat|nl|head|tail|ls|tree)\b/.test(args) &&
    !isShellCodeGraph;
  const isReadExploration =
    isShellSearchRead ||
    lowerName.includes("open") ||
    lowerName.includes("read") ||
    lowerName.includes("grep") ||
    lowerName.includes("find");

  return {
    file,
    isCodeGraph,
    isMcpCodeGraph,
    isReadExploration,
    isShellCodeGraph,
    isShellSearchRead,
    name,
    timestamp,
  };
}

function classifyTurn(segment) {
  if (segment.codegraphCalls > 0) return "codegraph_assisted";
  if (segment.shellSearchReadCalls > 0) return "shell_search_read";
  if (segment.readExplorationCalls > 0) return "other_read_exploration";
  return "other";
}

function normalizeUsage(usage) {
  const input = numberOrZero(usage.input_tokens);
  const cached = numberOrZero(usage.cached_input_tokens);
  const output = numberOrZero(usage.output_tokens);
  const reasoning = numberOrZero(usage.reasoning_output_tokens);
  return {
    billableProxyTokens: input + output,
    cachedInputTokens: cached,
    inputTokens: input,
    outputTokens: output,
    reasoningOutputTokens: reasoning,
    totalTokens: numberOrZero(usage.total_tokens),
    uncachedInputTokens: Math.max(input - cached, 0),
  };
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isReadOnlyMode() {
  const raw = process.env.TOKEN_REPORTING_READ_ONLY?.trim().toLowerCase();
  return raw === "1" || raw === "true";
}

function buildReport(input) {
  const codegraphTimes = input.toolCalls
    .filter((call) => call.isCodeGraph && call.timestamp)
    .map((call) => new Date(call.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  const firstCodegraphToolAt = codegraphTimes[0] ?? null;
  const lastCodegraphToolAt = codegraphTimes.at(-1) ?? null;

  const classifications = {};
  for (const name of ["codegraph_assisted", "shell_search_read", "other_read_exploration", "other"]) {
    classifications[name] = summarizeTurns(input.turns.filter((turn) => turn.classification === name));
  }

  return {
    generatedAt: input.generatedAt.toISOString(),
    instructionUpdatedAt: input.instructionUpdatedAt?.toISOString() ?? null,
    firstCodegraphToolAt: firstCodegraphToolAt?.toISOString() ?? null,
    lastCodegraphToolAt: lastCodegraphToolAt?.toISOString() ?? null,
    repoRoot: input.repoRoot,
    sessionsDir: input.sessionsDir,
    agentsFile: input.agentsFile,
    caveats: [
      "Session-log telemetry is factual but observational; use paired tasks for causal savings claims.",
      "billableProxyTokens is input + output; reasoning_output_tokens is already included in output_tokens and is not added again.",
      "Early CodeGraph samples may include setup, verification, or instruction tuning overhead.",
    ],
    totals: {
      sessionFileCount: input.sessionFiles.length,
      includedSessionFileCount: input.includedSessionFiles.length,
      excludedSessionFileCount: input.excludedSessionFiles.length,
      measuredTurnCount: input.turns.length,
      codegraphAssistedTurnCount: classifications.codegraph_assisted.turnCount,
      shellSearchReadTurnCount: classifications.shell_search_read.turnCount,
    },
    excludedSessionFiles: input.excludedSessionFiles,
    windows: buildWindows(input.turns, input.instructionUpdatedAt, firstCodegraphToolAt),
    classifications,
    comparison: compareClassifications(classifications.codegraph_assisted, classifications.shell_search_read),
  };
}

function buildWindows(turns, instructionUpdatedAt, firstCodegraphToolAt) {
  const windows = {};
  if (instructionUpdatedAt) {
    windows.postInstructionUpdate = summarizeTurns(
      turns.filter((turn) => new Date(turn.timestamp) >= instructionUpdatedAt)
    );
    windows.beforeInstructionUpdate = summarizeTurns(
      turns.filter((turn) => new Date(turn.timestamp) < instructionUpdatedAt)
    );
  }
  if (firstCodegraphToolAt) {
    windows.postFirstCodeGraphSeen = summarizeTurns(
      turns.filter((turn) => new Date(turn.timestamp) >= firstCodegraphToolAt)
    );
    windows.beforeFirstCodeGraphSeen = summarizeTurns(
      turns.filter((turn) => new Date(turn.timestamp) < firstCodegraphToolAt)
    );
  }
  return windows;
}

function summarizeTurns(turns) {
  return {
    turnCount: turns.length,
    toolCalls: sum(turns.map((turn) => turn.toolCalls)),
    codegraphCalls: sum(turns.map((turn) => turn.codegraphCalls)),
    shellSearchReadCalls: sum(turns.map((turn) => turn.shellSearchReadCalls)),
    totalTokens: summarizeMetric(turns, "totalTokens"),
    uncachedInputTokens: summarizeMetric(turns, "uncachedInputTokens"),
    billableProxyTokens: summarizeMetric(turns, "billableProxyTokens"),
    outputTokens: summarizeMetric(turns, "outputTokens"),
    reasoningOutputTokens: summarizeMetric(turns, "reasoningOutputTokens"),
  };
}

function summarizeMetric(turns, metric) {
  const values = turns.map((turn) => turn.usage[metric]);
  if (values.length === 0) return { sum: 0, median: 0, p75: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sum: sum(values),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    max: sorted.at(-1),
  };
}

function compareClassifications(codegraph, shell) {
  const metrics = {};
  const hasComparableSamples = codegraph.turnCount > 0 && shell.turnCount > 0;
  for (const metric of [
    "totalTokens",
    "uncachedInputTokens",
    "billableProxyTokens",
    "outputTokens",
    "reasoningOutputTokens",
  ]) {
    if (!hasComparableSamples) {
      metrics[metric] = {
        codegraphMedian: null,
        shellSearchReadMedian: null,
        delta: null,
        deltaPercentVsShell: null,
      };
      continue;
    }
    const codegraphMedian = codegraph[metric].median;
    const shellMedian = shell[metric].median;
    metrics[metric] = {
      codegraphMedian,
      shellSearchReadMedian: shellMedian,
      delta: shellMedian - codegraphMedian,
      deltaPercentVsShell: shellMedian > 0 ? round(((shellMedian - codegraphMedian) / shellMedian) * 100, 2) : null,
    };
  }
  return {
    basis: "Median measured turn: codegraph_assisted versus shell_search_read.",
    metrics,
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# CodeGraph Token Usage Heartbeat - ${report.generatedAt}`);
  lines.push("");
  lines.push("## Evidence Window");
  lines.push("");
  lines.push(`- Session files scanned: ${report.totals.sessionFileCount}`);
  lines.push(`- Session files included for repo: ${report.totals.includedSessionFileCount}`);
  lines.push(`- Session files excluded by repo filter: ${report.totals.excludedSessionFileCount}`);
  lines.push(`- Repo root filter: ${report.repoRoot}`);
  lines.push(`- Measured token_count turns: ${report.totals.measuredTurnCount}`);
  lines.push(`- Instruction update timestamp: ${report.instructionUpdatedAt ?? "not available"}`);
  lines.push(`- First CodeGraph tool call seen: ${report.firstCodegraphToolAt ?? "not observed"}`);
  lines.push(`- Last CodeGraph tool call seen: ${report.lastCodegraphToolAt ?? "not observed"}`);
  lines.push("");
  lines.push("## Classification Summary");
  lines.push("");
  lines.push("| Classification | Turns | Tool calls | CodeGraph calls | Shell search/read calls | Median total | Median billable proxy |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const [name, summary] of Object.entries(report.classifications)) {
    lines.push(
      `| ${name} | ${summary.turnCount} | ${summary.toolCalls} | ${summary.codegraphCalls} | ${summary.shellSearchReadCalls} | ${summary.totalTokens.median} | ${summary.billableProxyTokens.median} |`
    );
  }
  lines.push("");
  lines.push("## CodeGraph Vs Shell Search/Read");
  lines.push("");
  lines.push("| Metric | CodeGraph median | Shell search/read median | Delta | Delta % vs shell |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const [metric, value] of Object.entries(report.comparison.metrics)) {
    const pct = value.deltaPercentVsShell === null ? "n/a" : `${value.deltaPercentVsShell}%`;
    lines.push(
      `| ${metric} | ${formatNullable(value.codegraphMedian)} | ${formatNullable(
        value.shellSearchReadMedian
      )} | ${formatNullable(value.delta)} | ${pct} |`
    );
  }
  lines.push("");
  lines.push("## Adoption Windows");
  lines.push("");
  lines.push("| Window | Turns | CodeGraph calls | Shell search/read calls | Median total | Median billable proxy |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const [name, summary] of Object.entries(report.windows)) {
    lines.push(
      `| ${name} | ${summary.turnCount} | ${summary.codegraphCalls} | ${summary.shellSearchReadCalls} | ${summary.totalTokens.median} | ${summary.billableProxyTokens.median} |`
    );
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- Use this heartbeat as internal monitoring evidence.");
  lines.push("- Do not make a client-facing savings claim until paired fresh-thread tasks show repeatable deltas.");
  lines.push("- Delta is shell-search/read median minus CodeGraph median; positive means CodeGraph is lower for that metric, negative means higher.");
  lines.push("");
  lines.push("## Caveats");
  lines.push("");
  for (const caveat of report.caveats) lines.push(`- ${caveat}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderMemory(report) {
  return [
    `# CodeGraph Token Usage Heartbeat Memory`,
    ``,
    `Last run: ${report.generatedAt}`,
    `Instruction update timestamp: ${report.instructionUpdatedAt ?? "not available"}`,
    `First CodeGraph tool call seen: ${report.firstCodegraphToolAt ?? "not observed"}`,
    `Measured turns: ${report.totals.measuredTurnCount}`,
    `CodeGraph-assisted turns: ${report.totals.codegraphAssistedTurnCount}`,
    `Shell-search/read turns: ${report.totals.shellSearchReadTurnCount}`,
    ``,
    `Median total-token delta vs shell-search/read: ${formatNullable(
      report.comparison.metrics.totalTokens.delta
    )} (${formatPercent(report.comparison.metrics.totalTokens.deltaPercentVsShell)})`,
    `Median billable-proxy delta vs shell-search/read: ${formatNullable(
      report.comparison.metrics.billableProxyTokens.delta
    )} (${formatPercent(report.comparison.metrics.billableProxyTokens.deltaPercentVsShell)})`,
    ``,
  ].join("\n");
}

function formatNullable(value) {
  return value === null || value === undefined ? "n/a" : String(value);
}

function formatPercent(value) {
  return value === null || value === undefined ? "n/a" : `${value}%`;
}

function journalReport(issueRef, markdownPath) {
  const parsed = parseIssueRef(issueRef);
  const result = spawnSync(
    "gh",
    ["issue", "comment", String(parsed.number), "--repo", parsed.repo, "--body-file", markdownPath],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`Failed to journal report to ${issueRef}: ${result.stderr || result.stdout}`);
  }
  console.log(`Journaled report to ${issueRef}`);
}

function parseIssueRef(value) {
  const match = value.match(/^([^/]+\/[^#]+)#(\d+)$/u);
  if (!match) {
    throw new Error(`Expected --journal-issue as owner/repo#number, got: ${value}`);
  }
  return { repo: match[1], number: Number(match[2]) };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * fraction) - 1));
  return sortedValues[index];
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
