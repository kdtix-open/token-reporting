import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildBridgeEnvRepair } from "../src/lib/bridgeEnvRepair";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const adminEnvPath = path.resolve(
  process.env.TOKEN_REPORTING_ADMIN_ENV_FILE ?? path.join(repoRoot, ".env.admin.credentials")
);
const bridgeEnvPath = path.resolve(
  process.env.SDLCA_BRIDGE_ENV_FILE ?? path.join(os.homedir(), ".sdlca", "bridge", ".env.credentials")
);
const bridgeUrl = process.env.TOKEN_REPORTING_SDLCA_BRIDGE_URL ?? "http://127.0.0.1:4318";
const workingDirectory = process.env.TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY ?? repoRoot;
const timeoutMs = readPositiveInteger(process.env.TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS, 120_000);

await main();

async function main(): Promise<void> {
  const [adminEnvText, bridgeEnvText] = await Promise.all([
    readTextIfExists(adminEnvPath),
    fs.readFile(bridgeEnvPath, "utf8")
  ]);
  const repair = buildBridgeEnvRepair({
    adminEnvText,
    bridgeEnvText,
    bridgeUrl,
    timeoutMs,
    workingDirectory
  });

  if (repair.redactedSummary.changed) {
    const backupPath = `${adminEnvPath}.bak-${timestampForFile(new Date())}`;
    await fs.writeFile(backupPath, adminEnvText, { mode: 0o600 });
    await fs.writeFile(adminEnvPath, repair.updatedAdminEnvText, { mode: 0o600 });
    await fs.chmod(adminEnvPath, 0o600);
  }

  process.stdout.write(`${JSON.stringify(repair.redactedSummary, null, 2)}\n`);
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
