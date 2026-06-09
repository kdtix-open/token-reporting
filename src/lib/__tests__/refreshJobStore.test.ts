import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createFileRefreshJobStore } from "../refreshJobStore";

describe("refreshJobStore", () => {
  it("createFileRefreshJobStore_SetThenGet_PersistsJobAcrossStoreInstances", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-refresh-jobs-"));
    const storePath = path.join(tempDir, "nested", "refresh-jobs.json");
    const firstStore = createFileRefreshJobStore(storePath);

    await firstStore.set("dynamic-refresh-001", {
      jobId: "dynamic-refresh-001",
      status: "completed"
    });

    const secondStore = createFileRefreshJobStore(storePath);
    await expect(secondStore.get("dynamic-refresh-001")).resolves.toEqual({
      jobId: "dynamic-refresh-001",
      status: "completed"
    });
  });

  it("createFileRefreshJobStore_CorruptJson_ReturnsUndefinedAndSelfHealsOnSet", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-refresh-jobs-"));
    const storePath = path.join(tempDir, "refresh-jobs.json");
    await fs.writeFile(storePath, "{not-json", "utf8");
    const store = createFileRefreshJobStore(storePath);

    await expect(store.get("missing-job")).resolves.toBeUndefined();

    await store.set("dynamic-refresh-002", {
      jobId: "dynamic-refresh-002",
      status: "degraded"
    });

    await expect(JSON.parse(await fs.readFile(storePath, "utf8"))).toEqual({
      jobs: {
        "dynamic-refresh-002": {
          jobId: "dynamic-refresh-002",
          status: "degraded"
        }
      }
    });
  });
});
