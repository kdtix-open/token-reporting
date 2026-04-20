import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { scanClaudeCodeSessions } from "../client";

async function createTmpRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "cc-test-"));
}

function jsonl(...objects: unknown[]): string {
  return objects.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

function assistantMessage(overrides: {
  timestamp?: string;
  sessionId?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  web_search_requests?: number;
  web_fetch_requests?: number;
}): Record<string, unknown> {
  const serverToolUse =
    overrides.web_search_requests || overrides.web_fetch_requests
      ? {
          web_search_requests: overrides.web_search_requests ?? 0,
          web_fetch_requests: overrides.web_fetch_requests ?? 0
        }
      : undefined;

  return {
    type: "assistant",
    timestamp: overrides.timestamp ?? "2026-04-15T10:00:00Z",
    sessionId: overrides.sessionId ?? "sess-001",
    message: {
      role: "assistant",
      model: overrides.model ?? "claude-opus-4-6",
      usage: {
        input_tokens: overrides.input_tokens ?? 1_000,
        output_tokens: overrides.output_tokens ?? 500,
        cache_read_input_tokens: overrides.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens:
          overrides.cache_creation_input_tokens ?? 0,
        ...(serverToolUse ? { server_tool_use: serverToolUse } : {})
      }
    }
  };
}

describe("scanClaudeCodeSessions", () => {
  it("returns empty snapshot for nonexistent directory", async () => {
    const snapshot = await scanClaudeCodeSessions("/nonexistent/path", 200);

    expect(snapshot.dailyBuckets).toHaveLength(0);
    expect(snapshot.sessionCount).toBe(0);
    expect(snapshot.modelsUsed).toEqual([]);
  });

  it("parses assistant messages and groups by day", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      jsonl(
        assistantMessage({
          timestamp: "2026-04-15T10:00:00Z",
          sessionId: "s1",
          input_tokens: 1_000,
          output_tokens: 500
        }),
        assistantMessage({
          timestamp: "2026-04-15T14:00:00Z",
          sessionId: "s1",
          input_tokens: 2_000,
          output_tokens: 800
        }),
        assistantMessage({
          timestamp: "2026-04-16T09:00:00Z",
          sessionId: "s2",
          input_tokens: 500,
          output_tokens: 200
        })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 100);

    expect(snapshot.dailyBuckets).toHaveLength(2);
    expect(snapshot.dailyBuckets[0].date).toBe("2026-04-15");
    expect(snapshot.dailyBuckets[0].requestCount).toBe(2);
    expect(snapshot.dailyBuckets[0].inputTokens).toBe(3_000);
    expect(snapshot.dailyBuckets[1].date).toBe("2026-04-16");
    expect(snapshot.dailyBuckets[1].requestCount).toBe(1);
    expect(snapshot.sessionCount).toBe(2);
    expect(snapshot.monthlySeatCost).toBe(100);
  });

  it("counts distinct session IDs", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      jsonl(
        assistantMessage({ sessionId: "s1" }),
        assistantMessage({ sessionId: "s1" }),
        assistantMessage({ sessionId: "s2" }),
        assistantMessage({ sessionId: "s3" })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    expect(snapshot.sessionCount).toBe(3);
  });

  it("collects distinct models sorted", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      jsonl(
        assistantMessage({ model: "claude-sonnet-4-6" }),
        assistantMessage({ model: "claude-opus-4-6" }),
        assistantMessage({ model: "claude-sonnet-4-6" })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    expect(snapshot.modelsUsed).toEqual([
      "claude-opus-4-6",
      "claude-sonnet-4-6"
    ]);
  });

  it("tracks web search and fetch requests", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      jsonl(
        assistantMessage({ web_search_requests: 3, web_fetch_requests: 1 }),
        assistantMessage({ web_search_requests: 1, web_fetch_requests: 2 })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    expect(snapshot.dailyBuckets[0].webSearchRequests).toBe(4);
    expect(snapshot.dailyBuckets[0].webFetchRequests).toBe(3);
  });

  it("skips malformed lines gracefully", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      "not valid json\n" +
        JSON.stringify(assistantMessage({ input_tokens: 100, output_tokens: 50 })) +
        "\n"
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    expect(snapshot.dailyBuckets).toHaveLength(1);
    expect(snapshot.dailyBuckets[0].requestCount).toBe(1);
  });

  it("skips entries without usage data", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      jsonl(
        { type: "human", timestamp: "2026-04-15T10:00:00Z", sessionId: "s1" },
        { type: "system", timestamp: "2026-04-15T10:00:00Z" },
        assistantMessage({ input_tokens: 500, output_tokens: 200 })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    expect(snapshot.dailyBuckets[0].requestCount).toBe(1);
  });

  it("scans subdirectories recursively (subagents)", async () => {
    const root = await createTmpRoot();
    const subagentDir = path.join(root, "proj-a", "subagents");
    await mkdir(subagentDir, { recursive: true });

    await writeFile(
      path.join(subagentDir, "agent.jsonl"),
      jsonl(
        assistantMessage({
          sessionId: "sub-1",
          input_tokens: 300,
          output_tokens: 100
        })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    expect(snapshot.dailyBuckets).toHaveLength(1);
    expect(snapshot.dailyBuckets[0].requestCount).toBe(1);
    expect(snapshot.sessionCount).toBe(1);
  });

  it("builds per-model breakdown within daily buckets", async () => {
    const root = await createTmpRoot();
    const projDir = path.join(root, "proj-a");
    await mkdir(projDir, { recursive: true });

    await writeFile(
      path.join(projDir, "session.jsonl"),
      jsonl(
        assistantMessage({
          model: "claude-opus-4-6",
          input_tokens: 1_000,
          output_tokens: 500
        }),
        assistantMessage({
          model: "claude-sonnet-4-6",
          input_tokens: 200,
          output_tokens: 100
        })
      )
    );

    const snapshot = await scanClaudeCodeSessions(root, 200);
    const bucket = snapshot.dailyBuckets[0];
    expect(Object.keys(bucket.models)).toHaveLength(2);
    expect(bucket.models["claude-opus-4-6"].inputTokens).toBe(1_000);
    expect(bucket.models["claude-sonnet-4-6"].inputTokens).toBe(200);
  });
});
