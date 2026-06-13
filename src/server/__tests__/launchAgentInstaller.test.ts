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
});
