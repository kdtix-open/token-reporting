import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("install-macos-launchagent", () => {
  it("installMacosLaunchAgent_DryRun_RendersPathAndAdminEnvFileWithoutWritingPlist", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));

    const { stdout } = await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], {
      env: {
        ...process.env,
        TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
        TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
        TOKEN_REPORTING_LAUNCHD_PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
        TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true"
      }
    });

    const plistPath = path.join(plistDir, "com.kdtix.token-reporting.plist");
    const plist = stdout;
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).toContain(
      "<string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>"
    );
    expect(plist).toContain("<key>TOKEN_REPORTING_ADMIN_ENV_FILE</key>");
    await expect(fs.access(plistPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("installMacosLaunchAgent_DefaultPath_DoesNotInheritCallerPath", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));
    const nodeDir = path.dirname(process.execPath);

    const { stdout } = await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], {
      env: {
        ...process.env,
        PATH: "/tmp/project-bin:/usr/bin:/bin",
        TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
        TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
        TOKEN_REPORTING_NODE_BIN: process.execPath,
        TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
        TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true"
      }
    });

    const plist = stdout;
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).not.toContain("/tmp/project-bin");
    expect(plist).toContain(
      `<string>${nodeDir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:`
    );
  });

  it("installMacosLaunchAgent_DryRun_PreservesCustomNodeDirectoryInDefaultLaunchdPath", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));

    const { stdout } = await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], {
      env: {
        ...process.env,
        PATH: "/tmp/project-bin:/usr/bin:/bin",
        TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
        TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
        TOKEN_REPORTING_NODE_BIN: "/custom/node/bin/node",
        TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
        TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true"
      }
    });

    const plist = stdout;
    expect(plist).toContain("<key>PATH</key>");
    expect(plist).not.toContain("/tmp/project-bin");
    expect(plist).toContain(
      "<string>/custom/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:"
    );
  });

  it("installMacosLaunchAgent_DryRun_DoesNotOverwriteExistingPlist", async () => {
    const plistDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-launchagent-"));
    const plistPath = path.join(plistDir, "com.kdtix.token-reporting.plist");
    await fs.writeFile(plistPath, "existing plist", "utf8");

    const { stdout } = await execFileAsync("bash", ["scripts/install-macos-launchagent.sh"], {
      env: {
        ...process.env,
        TOKEN_REPORTING_LAUNCHD_ALLOW_NON_DARWIN_FOR_TESTS: "true",
        TOKEN_REPORTING_LAUNCHD_DRY_RUN: "true",
        TOKEN_REPORTING_LAUNCHD_PLIST_DIR: plistDir,
        TOKEN_REPORTING_LAUNCHD_SKIP_PRECHECKS: "true"
      }
    });

    await expect(fs.readFile(plistPath, "utf8")).resolves.toBe("existing plist");
    expect(stdout).toContain("<key>Label</key>");
  });
});
