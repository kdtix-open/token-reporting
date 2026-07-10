import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";

import {
  createDynamicIntegrationContractHandler,
  type DynamicProviderBudgetLimit
} from "../lib/integrationContractDynamic";
import { createProviderScriptRefreshExecutor } from "../lib/dynamicRefreshExecutor";
import { createFileForensicRunStore } from "../lib/forensicRunStore";
import {
  createObservabilityLogger,
  resolveLoggingConfig,
  type ObservabilityLogger
} from "../lib/observabilityLogger";
import { normalizePublicBasePath } from "../lib/runtimePaths";
import { createFileRefreshJobStore } from "../lib/refreshJobStore";
import { createSdlcaBridgeForensicExecutor } from "../lib/sdlcaBridgeForensics";
import type {
  IntegrationContractRequest,
  IntegrationContractResponse
} from "../lib/integrationContractStub";

export interface TokenReportingProductionServerOptions {
  basePath?: string;
  budgetLimits?: Record<string, DynamicProviderBudgetLimit>;
  dataRoot?: string;
  distRoot?: string;
  env?: NodeJS.ProcessEnv;
  handleApiRequest?: (request: IntegrationContractRequest) => Promise<IntegrationContractResponse>;
  logger?: ObservabilityLogger;
}

const immutableCacheControl = "public, max-age=31536000, immutable";
const noCacheControl = "no-cache, no-store, must-revalidate";

export function createTokenReportingProductionServer(
  options: TokenReportingProductionServerOptions = {}
): Server {
  const env = options.env ?? process.env;
  const basePath = normalizePublicBasePath(options.basePath ?? env.TOKEN_REPORTING_PUBLIC_BASE_PATH);
  const dataRoot = path.resolve(options.dataRoot ?? env.TOKEN_REPORTING_DATA_ROOT ?? "public/data");
  const distRoot = path.resolve(options.distRoot ?? env.TOKEN_REPORTING_DIST_ROOT ?? "dist");
  const logger = options.logger ?? createProductionLogger(env);
  const handleApiRequest =
    options.handleApiRequest ?? createProductionApiHandler({ dataRoot, env, logger, options });

  return createServer(async (request, response) => {
    const requestPath = new URL(request.url ?? "/", "http://token-reporting.local").pathname;
    logger.info("Production HTTP request started", {
      method: request.method ?? "GET",
      path: requestPath
    });

    try {
      await routeProductionRequest({
        basePath,
        dataRoot,
        distRoot,
        env,
        handleApiRequest,
        logger,
        request,
        response
      });
    } catch (error) {
      logger.error("Production HTTP request failed", { path: requestPath }, error);
      writeJson(response, 500, {
        code: "internal_error",
        message: "Token Reporting production server request failed."
      });
    }
  });
}

function createProductionApiHandler(args: {
  dataRoot: string;
  env: NodeJS.ProcessEnv;
  logger: ObservabilityLogger;
  options: TokenReportingProductionServerOptions;
}) {
  const refreshJobStorePath =
    args.env.TOKEN_REPORTING_REFRESH_JOB_STORE_PATH ??
    path.join(args.dataRoot, "integration", "refresh-jobs.json");
  const forensicRunStorePath =
    args.env.TOKEN_REPORTING_FORENSIC_RUN_STORE_PATH ??
    path.join(args.dataRoot, "integration", "forensic-runs.json");

  return createDynamicIntegrationContractHandler({
    budgetLimits: args.options.budgetLimits ?? readBudgetLimitsFromEnvironment(args.env),
    dataRoot: args.dataRoot,
    env: args.env,
    forensicExecutor: createConfiguredForensicExecutor(args.env, args.logger),
    forensicRunStore: createFileForensicRunStore(forensicRunStorePath),
    refreshExecutor: createProviderScriptRefreshExecutor({
      env: args.env,
      logger: args.logger
    }),
    refreshJobStore: createFileRefreshJobStore(refreshJobStorePath)
  });
}

async function routeProductionRequest(args: {
  basePath: string;
  dataRoot: string;
  distRoot: string;
  env: NodeJS.ProcessEnv;
  handleApiRequest: (request: IntegrationContractRequest) => Promise<IntegrationContractResponse>;
  logger: ObservabilityLogger;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  const normalizedRequest = normalizeRequestPath(args.request.url ?? "/", args.basePath);
  if (normalizedRequest.kind === "outside-base") {
    writeRedirect(args.response, `${args.basePath}/`);
    return;
  }

  if (args.request.method === "OPTIONS" && normalizedRequest.path.startsWith("/api/")) {
    writeJson(args.response, 204, {});
    return;
  }

  if (normalizedRequest.path.startsWith("/api/")) {
    await routeApiRequest(args, normalizedRequest.path);
    return;
  }

  if (normalizedRequest.path.startsWith("/data/")) {
    await routeStaticFile(args.response, args.dataRoot, normalizedRequest.path.slice(6), false);
    return;
  }

  await routeDistRequest(args.response, args.distRoot, normalizedRequest.path);
}

async function routeApiRequest(
  args: {
    env: NodeJS.ProcessEnv;
    handleApiRequest: (request: IntegrationContractRequest) => Promise<IntegrationContractResponse>;
    logger: ObservabilityLogger;
    request: IncomingMessage;
    response: ServerResponse;
  },
  apiPath: string
): Promise<void> {
  if (apiPath === "/api/operational-status" && args.request.method === "GET") {
    writeJson(args.response, 200, buildOperationalStatus(args.env), {
      "Cache-Control": "no-store"
    });
    return;
  }

  const body = await readJsonBody(args.request);
  args.logger.debug("Production API request body parsed", { body, path: apiPath });
  const result = await args.handleApiRequest({
    body,
    method: args.request.method ?? "GET",
    path: apiPath
  });
  writeJson(args.response, result.status, result.body, result.headers);
}

async function routeDistRequest(
  response: ServerResponse,
  distRoot: string,
  requestPath: string
): Promise<void> {
  const filePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const served = await routeStaticFile(response, distRoot, filePath, requestPath.startsWith("/assets/"));
  if (!served) {
    await routeStaticFile(response, distRoot, "index.html", false);
  }
}

async function routeStaticFile(
  response: ServerResponse,
  root: string,
  relativePath: string,
  immutable: boolean
): Promise<boolean> {
  const resolvedPath = safeJoin(root, relativePath);
  if (!resolvedPath) {
    writeJson(response, 403, { code: "invalid_path", message: "Invalid static file path." });
    return true;
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (!stat.isFile()) return false;
  } catch {
    return false;
  }

  response.writeHead(200, {
    "Cache-Control": immutable ? immutableCacheControl : noCacheControl,
    "Content-Type": contentTypeForPath(resolvedPath)
  });
  createReadStream(resolvedPath).pipe(response);
  return true;
}

function normalizeRequestPath(
  rawUrl: string,
  basePath: string
): { kind: "inside-base"; path: string } | { kind: "outside-base" } {
  const pathname = new URL(rawUrl, "http://token-reporting.local").pathname;
  if (!basePath) return { kind: "inside-base", path: pathname };
  if (pathname === "/" || pathname === "") return { kind: "outside-base" };
  if (pathname === basePath) return { kind: "inside-base", path: "/" };
  if (pathname.startsWith(`${basePath}/`)) {
    return { kind: "inside-base", path: pathname.slice(basePath.length) || "/" };
  }

  return { kind: "outside-base" };
}

function safeJoin(root: string, relativePath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  return resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
    ? resolvedPath
    : null;
}

function contentTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js" || extension === ".mjs") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml; charset=utf-8";
  if (extension === ".ico") return "image/x-icon";
  return "application/octet-stream";
}

function createProductionLogger(env: NodeJS.ProcessEnv): ObservabilityLogger {
  return createObservabilityLogger(
    resolveLoggingConfig({
      env,
      serviceName: "token-reporting-production"
    })
  );
}

function readBudgetLimitsFromEnvironment(
  env: NodeJS.ProcessEnv
): Record<string, DynamicProviderBudgetLimit> {
  const raw = env.TOKEN_REPORTING_PROVIDER_BUDGET_LIMITS_JSON;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, DynamicProviderBudgetLimit>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function createConfiguredForensicExecutor(env: NodeJS.ProcessEnv, logger: ObservabilityLogger) {
  const bridgeUrl = env.TOKEN_REPORTING_SDLCA_BRIDGE_URL?.trim();
  const bridgeToken = env.TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN?.trim();
  if (!bridgeUrl || !bridgeToken) return undefined;

  return createSdlcaBridgeForensicExecutor({
    bridgeToken,
    bridgeUrl,
    logger,
    timeoutMs: readPositiveInteger(env.TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS, 120_000),
    workingDirectory: env.TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY?.trim() ?? process.cwd()
  });
}

function buildOperationalStatus(env: NodeJS.ProcessEnv): {
  forensics: {
    bridgeTimeoutMs: number;
    bridgeUrlConfigured: boolean;
    status: "configured" | "not_configured";
    tokenConfigured: boolean;
    workingDirectoryConfigured: boolean;
  };
  service: "token-reporting-production";
} {
  const bridgeUrlConfigured = Boolean(env.TOKEN_REPORTING_SDLCA_BRIDGE_URL?.trim());
  const tokenConfigured = Boolean(env.TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN?.trim());

  return {
    forensics: {
      bridgeTimeoutMs: readPositiveInteger(env.TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS, 120_000),
      bridgeUrlConfigured,
      status: bridgeUrlConfigured && tokenConfigured ? "configured" : "not_configured",
      tokenConfigured,
      workingDirectoryConfigured: Boolean(
        env.TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY?.trim()
      )
    },
    service: "token-reporting-production"
  };
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(status === 204 ? "" : JSON.stringify(body, null, 2));
}

function writeRedirect(response: ServerResponse, location: string): void {
  response.writeHead(302, {
    Location: location
  });
  response.end();
}
