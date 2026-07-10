import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("repair-bridge-env", () => {
  it("repairBridgeEnv_ReadOnlyMode_DoesNotWriteAdminEnvOrBackup", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-repair-env-"));
    const adminEnvPath = path.join(tempDir, ".env.admin.credentials");
    const bridgeEnvPath = path.join(tempDir, "bridge.env");
    await fs.writeFile(adminEnvPath, "OPENAI_ADMIN_API_KEY=admin-token\n", "utf8");
    await fs.writeFile(bridgeEnvPath, "SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN=bridge-secret\n", "utf8");

    await expect(
      execFileAsync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/repair-bridge-env.ts"], {
        env: {
          ...process.env,
          SDLCA_BRIDGE_ENV_FILE: bridgeEnvPath,
          TOKEN_REPORTING_ADMIN_ENV_FILE: adminEnvPath,
          TOKEN_REPORTING_READ_ONLY: "true"
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("TOKEN_REPORTING_READ_ONLY")
    });

    await expect(fs.readFile(adminEnvPath, "utf8")).resolves.toBe("OPENAI_ADMIN_API_KEY=admin-token\n");
    await expect(fs.readdir(tempDir)).resolves.toEqual([".env.admin.credentials", "bridge.env"]);
  });
});
