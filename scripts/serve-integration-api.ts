import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

import {
  createDynamicIntegrationContractHandler,
  type DynamicProviderBudgetLimit
} from "../src/lib/integrationContractDynamic";
import { createProviderScriptRefreshExecutor } from "../src/lib/dynamicRefreshExecutor";
import { createFileForensicRunStore } from "../src/lib/forensicRunStore";
import { createFileRefreshJobStore } from "../src/lib/refreshJobStore";
import {
  createObservabilityLogger,
  resolveLoggingConfig
} from "../src/lib/observabilityLogger";
import { createSdlcaBridgeForensicExecutor } from "../src/lib/sdlcaBridgeForensics";

const loggingConfig = resolveLoggingConfig({
  serviceName: "token-reporting-integration-api"
});
const logger = createObservabilityLogger(loggingConfig);
const port = Number.parseInt(process.env.TOKEN_REPORTING_INTEGRATION_API_PORT ?? "8788", 10);
const dataRoot = process.env.TOKEN_REPORTING_DATA_ROOT ?? path.resolve("public/data");
const refreshJobStorePath =
  process.env.TOKEN_REPORTING_REFRESH_JOB_STORE_PATH ??
  path.join(dataRoot, "integration", "refresh-jobs.json");
const forensicRunStorePath =
  process.env.TOKEN_REPORTING_FORENSIC_RUN_STORE_PATH ??
  path.join(dataRoot, "integration", "forensic-runs.json");
const handleRequest = createDynamicIntegrationContractHandler({
  budgetLimits: readBudgetLimitsFromEnvironment(),
  dataRoot,
  forensicExecutor: createConfiguredForensicExecutor(),
  forensicRunStore: createFileForensicRunStore(forensicRunStorePath),
  refreshExecutor: createProviderScriptRefreshExecutor({ logger }),
  refreshJobStore: createFileRefreshJobStore(refreshJobStorePath)
});

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    logger.debug("HTTP CORS preflight completed", {
      method: request.method,
      path: request.url ?? "/"
    });
    writeJson(response, 204, {}, {}, request.headers.origin);
    return;
  }

  const startedAt = Date.now();
  const method = request.method ?? "GET";
  const requestPath = request.url ?? "/";
  logger.info("HTTP request started", { method, path: requestPath });

  try {
    const body = await readJsonBody(request);
    logger.trace("HTTP request body parsed", { body, method, path: requestPath });
    const result = await handleRequest({
      body,
      method,
      path: requestPath
    });

    logger.info("HTTP request completed", {
      durationMs: Date.now() - startedAt,
      method,
      path: requestPath,
      status: result.status
    });
    logger.trace("HTTP response body prepared", {
      body: result.body,
      method,
      path: requestPath,
      status: result.status
    });
    writeJson(response, result.status, result.body, result.headers, request.headers.origin);
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    logger.error(
      "HTTP request failed",
      {
        durationMs: Date.now() - startedAt,
        method,
        path: requestPath,
        status
      },
      error
    );
    writeJson(
      response,
      status,
      {
        code: status === 400 ? "invalid_json" : "internal_error",
        message:
          status === 400
            ? "Request body must be valid JSON."
            : "Token Reporting integration API request failed."
      },
      {},
      request.headers.origin
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  logger.info("Token Reporting dynamic integration API listening", {
    dataRoot,
    debug: loggingConfig.debug,
    logRoot: loggingConfig.logRoot ?? "logs",
    port,
    refreshJobStorePath,
    verbose: loggingConfig.verbose
  });
  process.stdout.write(
    `Token Reporting dynamic integration API listening at http://127.0.0.1:${port}\n`
  );
});

function readBudgetLimitsFromEnvironment(): Record<string, DynamicProviderBudgetLimit> {
  const raw = process.env.TOKEN_REPORTING_PROVIDER_BUDGET_LIMITS_JSON;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, DynamicProviderBudgetLimit>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function createConfiguredForensicExecutor() {
  const bridgeUrl = process.env.TOKEN_REPORTING_SDLCA_BRIDGE_URL?.trim();
  const bridgeToken = process.env.TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN?.trim();
  if (!bridgeUrl || !bridgeToken) return undefined;

  return createSdlcaBridgeForensicExecutor({
    bridgeToken,
    bridgeUrl,
    logger,
    timeoutMs: readBridgeTimeoutMs(),
    workingDirectory:
      process.env.TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY?.trim() ?? process.cwd()
  });
}

function readBridgeTimeoutMs(): number {
  const parsed = Number.parseInt(
    process.env.TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS ?? "120000",
    10
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      raw += chunk;
    });
    request.on("end", () => {
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
  origin = "http://127.0.0.1"
): void {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });

  response.end(status === 204 ? "" : JSON.stringify(body, null, 2));
}
