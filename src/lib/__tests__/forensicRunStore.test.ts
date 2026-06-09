import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createFileForensicRunStore, createMemoryForensicRunStore } from "../forensicRunStore";

describe("forensicRunStore", () => {
  it("createMemoryForensicRunStore_ReturnsLatestWrittenRun", async () => {
    const store = createMemoryForensicRunStore();

    await store.set("dynamic-forensic-20260607T170000000Z", {
      createdAt: "2026-06-07T17:00:00.000Z",
      runId: "dynamic-forensic-20260607T170000000Z",
      status: "degraded"
    });

    expect(await store.get("dynamic-forensic-20260607T170000000Z")).toMatchObject({
      runId: "dynamic-forensic-20260607T170000000Z"
    });
    expect(await store.latest()).toMatchObject({
      runId: "dynamic-forensic-20260607T170000000Z"
    });
  });

  it("createFileForensicRunStore_CorruptJsonSelfHealsOnWrite", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-forensic-runs-"));
    const storePath = path.join(dir, "forensic-runs.json");
    await fs.writeFile(storePath, "{not-json", "utf8");

    const store = createFileForensicRunStore(storePath);
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.latest()).toBeUndefined();

    await store.set("dynamic-forensic-20260607T170000000Z", {
      createdAt: "2026-06-07T17:00:00.000Z",
      runId: "dynamic-forensic-20260607T170000000Z",
      status: "degraded"
    });

    const parsed = JSON.parse(await fs.readFile(storePath, "utf8")) as {
      latestRunId: string;
      runs: Record<string, { runId: string }>;
    };
    expect(parsed.latestRunId).toBe("dynamic-forensic-20260607T170000000Z");
    expect(parsed.runs["dynamic-forensic-20260607T170000000Z"]).toMatchObject({
      runId: "dynamic-forensic-20260607T170000000Z"
    });
  });
});
