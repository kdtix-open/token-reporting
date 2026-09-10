import fs from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { persistClaudeCodeSnapshot } from "../../providers/claudeCode/persistence";
import { createTokenReportingProductionServer } from "../productionServer";

const snapshot = {
  generatedAt: "2026-09-09T00:00:00.000Z", monthlySeatCost: 0,
  sessionCount: 0, modelsUsed: [], dailyBuckets: []
};

// Exercise real executor and persistence; only the external collector subprocess is replaced.
vi.mock("../../lib/dynamicRefreshExecutor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/dynamicRefreshExecutor")>();
  return {
    ...actual,
    createProviderScriptRefreshExecutor: (options: Parameters<typeof actual.createProviderScriptRefreshExecutor>[0]) =>
      actual.createProviderScriptRefreshExecutor({
        ...options,
        runScript: async (_script, env) => {
          await persistClaudeCodeSnapshot({ snapshot, env });
          return { ok: true };
        }
      })
  };
});

let server: Server | undefined;
let root: string | undefined;

afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;
  vi.restoreAllMocks();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe("production served-data invariant", () => {
  it.each([false, true])("refresh_SeparateCodeRootAndExplicitOption=%s_AdvancesServedSnapshot", async (explicitOption) => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-served-data-test-"));
    const codeRoot = path.join(root, "deploy-code");
    const dataRoot = path.join(root, "served-data");
    const envRoot = explicitOption ? path.join(root, "ignored-env-data") : dataRoot;
    await fs.mkdir(codeRoot);
    await fs.mkdir(path.join(dataRoot, "claude-code"), { recursive: true });
    const before = { ...snapshot, generatedAt: "2026-09-02T00:00:00.000Z" };
    await fs.writeFile(path.join(dataRoot, "claude-code", "accumulated-metadata.json"), JSON.stringify(before));
    vi.spyOn(process, "cwd").mockReturnValue(codeRoot);
    server = createTokenReportingProductionServer({
      basePath: "/tools/token-reporting", distRoot: codeRoot,
      ...(explicitOption ? { dataRoot } : {}),
      env: {
        TOKEN_REPORTING_DATA_ROOT: envRoot, TOKEN_REPORTING_REFRESH_ASYNC: "false",
        TOKEN_REPORTING_LOG_ROOT: path.join(root, "logs")
      }
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture server address");
    const base = `http://127.0.0.1:${address.port}/tools/token-reporting`;
    const snapshotUrl = `${base}/data/claude-code/accumulated-metadata.json`;
    expect(await (await fetch(snapshotUrl)).json()).toEqual(before);

    const response = await fetch(`${base}/api/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: ["claude-code"], includeHuggingFaceRefresh: false, includeForensicModelProfiles: false })
    });
    // The existing API returns 202 even when synchronous execution has completed.
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ providerResults: [{ providerId: "claude-code", status: "completed" }] });
    expect(await (await fetch(snapshotUrl)).json()).toEqual(snapshot);
    expect(await fs.readdir(codeRoot)).toEqual([]);
    if (explicitOption) await expect(fs.access(envRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
