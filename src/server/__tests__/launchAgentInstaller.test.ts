import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("install-macos-launchagent", () => {
  it("installMacosLaunchAgent_DryRun_WritesPathAndAdminEnvFileToPlist", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));

    await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], {
      env: {
        ...process.env,
        TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
        TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
        TOKEN_REPORTING_LAUNCHD_PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
        TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true"
      }
    });

    const plist = await fs.readFile(path.join(plistDir, "com.kdtix.token-reporting.plist"), "utf8");
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).toContain(
      "<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>"
    );
    expect(plist).toContain("<key>TOKEN_REPORTING_ADMIN_ENV_FILE</key>");
  });

  it("installMacosLaunchAgent_DryRun_UsesDeterministicDefaultLaunchdPath", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));
    const nodeDir = path.dirname(process.execPath);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
      TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
      TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
      TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true",
      TOKEN_REPORTING_NODE_BIN: process.execPath
    };
    delete env.TOKEN_REPORTING_LAUNCHD_PATH;

    await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], { env });

    const plist = await fs.readFile(path.join(plistDir, "com.kdtix.token-reporting.plist"), "utf8");
    expect(plist).toContain(
      `<string>${nodeDir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/.local/bin</string>`
    );
  });

  it("installMacosLaunchAgent_DryRun_PreservesCustomNodeDirectoryInDefaultLaunchdPath", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: "/tmp/project-bin:/usr/bin:/bin",
      TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
      TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
      TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
      TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true",
      TOKEN_REPORTING_NODE_BIN: "/custom/node/bin/node"
    };
    delete env.TOKEN_REPORTING_LAUNCHD_PATH;

    await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], { env });

    const plist = await fs.readFile(path.join(plistDir, "com.kdtix.token-reporting.plist"), "utf8");
    expect(plist).toContain(
      `<string>/custom/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME}/.local/bin</string>`
    );
    expect(plist).not.toContain("/tmp/project-bin");
  });
});
