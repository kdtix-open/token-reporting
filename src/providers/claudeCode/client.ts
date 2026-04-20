import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ClaudeCodeSnapshot, ClaudeCodeDailyBucket } from "./types";

const DEFAULT_MONTHLY_COST = 200;

interface ClaudeMessageUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
}

interface DayAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  requestCount: number;
  webSearchRequests: number;
  webFetchRequests: number;
  models: Map<string, ModelAccumulator>;
}

interface ModelAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  requestCount: number;
}

async function readJsonlLines(path: string): Promise<unknown[]> {
  try {
    const raw = await readFile(path, "utf8");
    const out: unknown[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // skip malformed line
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Recursively collect all .jsonl files under a directory. */
async function collectJsonlFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        results.push(...(await collectJsonlFiles(full)));
      } else if (entry.endsWith(".jsonl")) {
        results.push(full);
      }
    } catch {
      // skip inaccessible entries
    }
  }
  return results;
}

function newDayAccumulator(): DayAccumulator {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    requestCount: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
    models: new Map()
  };
}

function newModelAccumulator(): ModelAccumulator {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    requestCount: 0
  };
}

function accumulateMessage(
  day: DayAccumulator,
  usage: ClaudeMessageUsage,
  model: string | null
): void {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  const webSearch = usage.server_tool_use?.web_search_requests ?? 0;
  const webFetch = usage.server_tool_use?.web_fetch_requests ?? 0;

  if (input + output + cacheRead + cacheCreate <= 0) return;

  day.inputTokens += input;
  day.outputTokens += output;
  day.cacheReadTokens += cacheRead;
  day.cacheCreationTokens += cacheCreate;
  day.requestCount += 1;
  day.webSearchRequests += webSearch;
  day.webFetchRequests += webFetch;

  if (model) {
    if (!day.models.has(model)) day.models.set(model, newModelAccumulator());
    const m = day.models.get(model)!;
    m.inputTokens += input;
    m.outputTokens += output;
    m.cacheReadTokens += cacheRead;
    m.cacheCreationTokens += cacheCreate;
    m.requestCount += 1;
  }
}

function dayAccumulatorToBucket(
  date: string,
  acc: DayAccumulator
): ClaudeCodeDailyBucket {
  const models: ClaudeCodeDailyBucket["models"] = {};
  for (const [name, m] of acc.models) {
    models[name] = { ...m };
  }
  return {
    date,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens,
    requestCount: acc.requestCount,
    webSearchRequests: acc.webSearchRequests,
    webFetchRequests: acc.webFetchRequests,
    models
  };
}

/**
 * Scan Claude Code session JSONL files and aggregate into a snapshot.
 * Reads from `~/.claude/projects/` by default.
 */
export async function scanClaudeCodeSessions(
  rootDir: string = join(homedir(), ".claude", "projects"),
  monthlySeatCost: number = DEFAULT_MONTHLY_COST
): Promise<ClaudeCodeSnapshot> {
  const dayMap = new Map<string, DayAccumulator>();
  const sessionIds = new Set<string>();
  const allModels = new Set<string>();

  if (!existsSync(rootDir)) {
    return {
      generatedAt: new Date().toISOString(),
      monthlySeatCost,
      sessionCount: 0,
      modelsUsed: [],
      dailyBuckets: []
    };
  }

  const files = await collectJsonlFiles(rootDir);

  for (const file of files) {
    const lines = await readJsonlLines(file);
    for (const entry of lines) {
      const e = entry as Record<string, unknown>;

      // Track session IDs
      if (typeof e.sessionId === "string") {
        sessionIds.add(e.sessionId);
      }

      // Extract usage from assistant messages
      const msg = e.message as Record<string, unknown> | undefined;
      if (!msg) continue;
      const usage = msg.usage as ClaudeMessageUsage | undefined;
      if (!usage) continue;

      // Extract day from timestamp
      const timestamp = e.timestamp as string | undefined;
      if (!timestamp || timestamp.length < 10) continue;
      const date = timestamp.slice(0, 10);

      // Extract model
      const model =
        typeof msg.model === "string" ? (msg.model as string) : null;
      if (model) allModels.add(model);

      if (!dayMap.has(date)) dayMap.set(date, newDayAccumulator());
      accumulateMessage(dayMap.get(date)!, usage, model);
    }
  }

  const dailyBuckets = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, acc]) => dayAccumulatorToBucket(date, acc));

  return {
    generatedAt: new Date().toISOString(),
    monthlySeatCost,
    sessionCount: sessionIds.size,
    modelsUsed: [...allModels].sort(),
    dailyBuckets
  };
}
