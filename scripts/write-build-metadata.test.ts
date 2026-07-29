import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

describe("write-build-metadata", () => {
  it("writes explicit reviewed identity and ignores blank environment values", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-build-metadata-"));
    temporaryRoots.push(root);

    await runScript({
      TOKEN_REPORTING_BUILD_SHA: " ",
      TOKEN_REPORTING_BUILD_VERSION: " ",
      TOKEN_REPORTING_DIST_ROOT: root,
      GITHUB_SHA: "b9949c5e34e50462c6b62d46ce1f4f5ec2b5f99a"
    });

    await expectMetadata(root, {
      sha: "b9949c5e34e50462c6b62d46ce1f4f5ec2b5f99a",
      version: "0.1.0"
    });
  });

  it("refuses to write while read-only mode is enabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-build-metadata-"));
    temporaryRoots.push(root);

    await expect(
      runScript({ TOKEN_REPORTING_DIST_ROOT: root, TOKEN_REPORTING_READ_ONLY: "true" })
    ).rejects.toThrow(/TOKEN_REPORTING_READ_ONLY/);
    await expect(fs.stat(path.join(root, "build-metadata.json"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

async function runScript(env: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/write-build-metadata.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, ...env }
  });
}

async function expectMetadata(root: string, expected: { sha: string | null; version: string | null }) {
  await expect(
    JSON.parse(await fs.readFile(path.join(root, "build-metadata.json"), "utf8"))
  ).toEqual(expected);
}
