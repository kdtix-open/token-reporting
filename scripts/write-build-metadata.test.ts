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

  it("uses HEAD only for a clean worktree and omits it for dirty sources", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-git-metadata-"));
    temporaryRoots.push(root);
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ version: "9.9.9" }));
    await fs.writeFile(path.join(root, "tracked.txt"), "clean\n");
    await runGit(root, ["init"]);
    await runGit(root, ["config", "user.email", "uat@example.invalid"]);
    await runGit(root, ["config", "user.name", "UAT"]);
    await runGit(root, ["add", "package.json", "tracked.txt"]);
    await runGit(root, ["commit", "-m", "fixture"]);

    const head = (await runGit(root, ["rev-parse", "HEAD"])).trim();
    await runScript(
      {
        TOKEN_REPORTING_BUILD_SHA: "",
        GITHUB_SHA: "",
        TOKEN_REPORTING_BUILD_VERSION: "",
        TOKEN_REPORTING_DIST_ROOT: path.join(root, "clean-dist")
      },
      root
    );
    await expectMetadataAt(path.join(root, "clean-dist"), { sha: head, version: "9.9.9" });

    await fs.writeFile(path.join(root, "untracked.txt"), "dirty\n");
    await runScript(
      { TOKEN_REPORTING_DIST_ROOT: path.join(root, "dirty-dist") },
      root
    );
    await expectMetadataAt(path.join(root, "dirty-dist"), { sha: null, version: "9.9.9" });
  });
});

async function runScript(env: NodeJS.ProcessEnv, cwd = process.cwd()): Promise<void> {
  const repoRoot = process.cwd();
  await execFileAsync(
    process.execPath,
    [path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"), path.join(repoRoot, "scripts/write-build-metadata.ts")],
    {
    cwd,
    env: { ...process.env, ...env }
    }
  );
}

async function expectMetadata(root: string, expected: { sha: string | null; version: string | null }) {
  await expectMetadataAt(root, expected);
}

async function expectMetadataAt(
  root: string,
  expected: { sha: string | null; version: string | null }
) {
  await expect(
    JSON.parse(await fs.readFile(path.join(root, "build-metadata.json"), "utf8"))
  ).toEqual(expected);
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd });
  return result.stdout;
}
