import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("repair-bridge-env", () => {
  it("repairBridgeEnv_ReadOnlyMode_DoesNotReadBridgeEnvOrWriteAdminEnv", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-repair-env-"));
    const adminEnvPath = path.join(tempDir, ".env.admin.credentials");
    const missingBridgeEnvPath = path.join(tempDir, "missing-bridge.env");
    await fs.writeFile(adminEnvPath, "OPENAI_ADMIN_API_KEY=admin-token\n", "utf8");

    await expect(
      execFileAsync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/repair-bridge-env.ts"], {
        env: {
          ...process.env,
          SDLCA_BRIDGE_ENV_FILE: missingBridgeEnvPath,
          TOKEN_REPORTING_ADMIN_ENV_FILE: adminEnvPath,
          TOKEN_REPORTING_READ_ONLY: "true"
        }
      })
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("TOKEN_REPORTING_READ_ONLY")
    });

    await expect(fs.readFile(adminEnvPath, "utf8")).resolves.toBe("OPENAI_ADMIN_API_KEY=admin-token\n");
    await expect(fs.readdir(tempDir)).resolves.toEqual([".env.admin.credentials"]);
  });

  it("repairBridgeEnv_UnchangedAdminEnv_StillRestrictsFileMode", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-repair-env-"));
    const adminEnvPath = path.join(tempDir, ".env.admin.credentials");
    const bridgeEnvPath = path.join(tempDir, "bridge.env");
    const adminEnvText = [
      "TOKEN_REPORTING_SDLCA_BRIDGE_URL=http://127.0.0.1:4318",
      "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN=bridge-token",
      `TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY=${tempDir}`,
      "TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS=120000",
      ""
    ].join("\n");
    await fs.writeFile(adminEnvPath, adminEnvText, { mode: 0o644 });
    await fs.writeFile(bridgeEnvPath, "SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN=bridge-token\n", "utf8");

    const result = await execFileAsync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/repair-bridge-env.ts"],
      {
        env: {
          ...process.env,
          SDLCA_BRIDGE_ENV_FILE: bridgeEnvPath,
          TOKEN_REPORTING_ADMIN_ENV_FILE: adminEnvPath,
          TOKEN_REPORTING_READ_ONLY: "false",
          TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS: "120000",
          TOKEN_REPORTING_SDLCA_BRIDGE_URL: "http://127.0.0.1:4318",
          TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY: tempDir
        }
      }
    );

    expect(JSON.parse(result.stdout)).toMatchObject({ changed: false });
    expect((await fs.stat(adminEnvPath)).mode & 0o777).toBe(0o600);
    await expect(fs.readdir(tempDir)).resolves.toEqual([".env.admin.credentials", "bridge.env"]);
  });

  it("repairBridgeEnv_ChangedAdminEnv_RestrictsFileAndBackupModes", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-repair-env-"));
    const adminEnvPath = path.join(tempDir, ".env.admin.credentials");
    const bridgeEnvPath = path.join(tempDir, "bridge.env");
    await fs.writeFile(adminEnvPath, "OPENAI_ADMIN_API_KEY=admin-token\n", { mode: 0o644 });
    await fs.writeFile(bridgeEnvPath, "SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN=bridge-token\n", "utf8");

    const result = await execFileAsync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/repair-bridge-env.ts"],
      {
        env: {
          ...process.env,
          SDLCA_BRIDGE_ENV_FILE: bridgeEnvPath,
          TOKEN_REPORTING_ADMIN_ENV_FILE: adminEnvPath,
          TOKEN_REPORTING_READ_ONLY: "false",
          TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS: "120000",
          TOKEN_REPORTING_SDLCA_BRIDGE_URL: "http://127.0.0.1:4318",
          TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY: tempDir
        }
      }
    );

    const files = await fs.readdir(tempDir);
    const backupFile = files.find((file) => file.startsWith(".env.admin.credentials.bak-"));
    expect(JSON.parse(result.stdout)).toMatchObject({ changed: true });
    expect(backupFile).toBeDefined();
    expect((await fs.stat(adminEnvPath)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(path.join(tempDir, backupFile ?? ""))).mode & 0o777).toBe(0o600);
  });
});
