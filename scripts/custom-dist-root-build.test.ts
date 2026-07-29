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

describe("custom production build output root", () => {
  it("writes Vite assets and build metadata to the configured root", async () => {
    const distRoot = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-custom-dist-"));
    temporaryRoots.push(distRoot);

    await execFileAsync("npm", ["run", "build"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TOKEN_REPORTING_BUILD_SHA: "b9949c5e34e50462c6b62d46ce1f4f5ec2b5f99a8",
        TOKEN_REPORTING_BUILD_VERSION: "0.1.0",
        TOKEN_REPORTING_DIST_ROOT: distRoot
      },
      maxBuffer: 4 * 1024 * 1024
    });

    await expect(fs.stat(path.join(distRoot, "index.html"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(distRoot, "assets"))).resolves.toBeTruthy();
    expect(JSON.parse(await fs.readFile(path.join(distRoot, "build-metadata.json"), "utf8"))).toEqual({
      sha: "b9949c5e34e50462c6b62d46ce1f4f5ec2b5f99a8",
      version: "0.1.0"
    });
  }, 120_000);
});
