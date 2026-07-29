import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../src/lib/permissions";

assertWritableOperationAllowed("Token Reporting build metadata generation");

const outputPath = path.resolve(
  firstNonBlank(process.env.TOKEN_REPORTING_DIST_ROOT) ?? "dist",
  "build-metadata.json"
);
const sha = readSafeSha(
  firstNonBlank(process.env.TOKEN_REPORTING_BUILD_SHA, process.env.GITHUB_SHA) ?? readGitSha()
);
const version = readSafeVersion(
  firstNonBlank(process.env.TOKEN_REPORTING_BUILD_VERSION) ?? readPackageVersion()
);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ sha, version }, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o644
});

function readGitSha(): string | undefined {
  try {
    const status = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { encoding: "utf8" }
    );
    if (status.trim()) return undefined;
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

function readPackageVersion(): string | undefined {
  try {
    const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string" ? packageJson.version : undefined;
  } catch {
    return undefined;
  }
}

function readSafeSha(value: string | undefined): string | null {
  const candidate = value?.trim() ?? "";
  return /^[0-9a-f]{7,64}$/iu.test(candidate) ? candidate : null;
}

function readSafeVersion(value: string | undefined): string | null {
  const candidate = value?.trim() ?? "";
  return /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u.test(candidate) ? candidate : null;
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim();
}
