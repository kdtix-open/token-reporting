import fs from "node:fs";
import path from "node:path";

import { createTokenReportingProductionServer } from "../src/server/productionServer";
import {
  createObservabilityLogger,
  resolveLoggingConfig
} from "../src/lib/observabilityLogger";

loadAdminEnvironmentFile();

const env = process.env;
const host = env.TOKEN_REPORTING_HOST ?? "0.0.0.0";
const port = readPositiveInteger(env.TOKEN_REPORTING_PORT, 8080);
const loggingConfig = resolveLoggingConfig({
  env,
  serviceName: "token-reporting-production"
});
const logger = createObservabilityLogger(loggingConfig);
const server = createTokenReportingProductionServer({ env, logger });

server.listen(port, host, () => {
  logger.info("Token Reporting production server listening", {
    basePath: env.TOKEN_REPORTING_PUBLIC_BASE_PATH ?? "/",
    dataRoot: env.TOKEN_REPORTING_DATA_ROOT ?? "public/data",
    distRoot: env.TOKEN_REPORTING_DIST_ROOT ?? "dist",
    host,
    port
  });
  process.stdout.write(`Token Reporting production server listening at http://${host}:${port}\n`);
});

function loadAdminEnvironmentFile(): void {
  const envFilePath = process.env.TOKEN_REPORTING_ADMIN_ENV_FILE ?? ".env.admin.credentials";
  const resolvedPath = path.resolve(envFilePath);
  if (!fs.existsSync(resolvedPath)) return;

  const lines = fs.readFileSync(resolvedPath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed || process.env[parsed.key] !== undefined) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex <= 0) return null;

  const key = withoutExport.slice(0, equalsIndex).trim();
  const value = stripQuotes(withoutExport.slice(equalsIndex + 1).trim());
  return /^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) ? { key, value } : null;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
