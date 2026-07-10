import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createTokenReportingProductionServer } from "../productionServer";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
    )
  );
});

describe("productionServer", () => {
  it("createTokenReportingProductionServer_SubpathRoutes_ServesDataApiAndSpa", async () => {
    const roots = await createFixtureRoots();
    const server = createTokenReportingProductionServer({
      basePath: "/tools/token-reporting",
      dataRoot: roots.dataRoot,
      distRoot: roots.distRoot,
      handleApiRequest: async (request) => ({
        body: {
          method: request.method,
          path: request.path,
          receivedBody: request.body ?? null
        },
        headers: {},
        status: 202
      })
    });
    const baseUrl = await listen(server);

    const dataResponse = await fetch(
      `${baseUrl}/tools/token-reporting/data/claude/latest-metadata.json`
    );
    await expectJson(dataResponse, 200, {
      provider: "claude"
    });

    const apiResponse = await fetch(`${baseUrl}/tools/token-reporting/api/refresh`, {
      body: JSON.stringify({ mode: "incremental" }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    await expectJson(apiResponse, 202, {
      method: "POST",
      path: "/api/refresh",
      receivedBody: { mode: "incremental" }
    });

    const spaResponse = await fetch(`${baseUrl}/tools/token-reporting/reports/local-sizing`);
    expect(spaResponse.status).toBe(200);
    expect(spaResponse.headers.get("content-type")).toContain("text/html");
    expect(spaResponse.headers.get("cache-control")).toContain("no-cache");
    expect(await spaResponse.text()).toContain("Token Reporting shell");
  });

  it("createTokenReportingProductionServer_RootRequest_RedirectsToConfiguredBasePath", async () => {
    const roots = await createFixtureRoots();
    const server = createTokenReportingProductionServer({
      basePath: "/tools/token-reporting",
      dataRoot: roots.dataRoot,
      distRoot: roots.distRoot,
      handleApiRequest: async () => ({ body: {}, headers: {}, status: 200 })
    });
    const baseUrl = await listen(server);

    const response = await fetch(baseUrl, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/tools/token-reporting/");
  });

  it("createTokenReportingProductionServer_OperationalStatusWithoutBridgeEnv_ReportsForensicsNotConfigured", async () => {
    const roots = await createFixtureRoots();
    const server = createTokenReportingProductionServer({
      basePath: "/tools/token-reporting",
      dataRoot: roots.dataRoot,
      distRoot: roots.distRoot,
      env: {}
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/tools/token-reporting/api/operational-status`);
    await expectJson(response, 200, {
      forensics: {
        bridgeTimeoutMs: 120000,
        bridgeUrlConfigured: false,
        status: "not_configured",
        tokenConfigured: false,
        workingDirectoryConfigured: false
      },
      service: "token-reporting-production"
    });
  });

  it("createTokenReportingProductionServer_OperationalStatusWithBridgeEnv_ReportsForensicsConfiguredWithoutSecrets", async () => {
    const roots = await createFixtureRoots();
    const server = createTokenReportingProductionServer({
      basePath: "/tools/token-reporting",
      dataRoot: roots.dataRoot,
      distRoot: roots.distRoot,
      env: {
        TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS: "45000",
        TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN: "secret-token-value",
        TOKEN_REPORTING_SDLCA_BRIDGE_URL: "http://127.0.0.1:4318",
        TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY: "/repo"
      }
    });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/tools/token-reporting/api/operational-status`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("secret-token-value");
    expect(JSON.parse(body)).toEqual({
      forensics: {
        bridgeTimeoutMs: 45000,
        bridgeUrlConfigured: true,
        status: "configured",
        tokenConfigured: true,
        workingDirectoryConfigured: true
      },
      service: "token-reporting-production"
    });
  });
});

async function createFixtureRoots(): Promise<{ dataRoot: string; distRoot: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-server-"));
  const dataRoot = path.join(root, "data");
  const distRoot = path.join(root, "dist");

  await fs.mkdir(path.join(dataRoot, "claude"), { recursive: true });
  await fs.mkdir(path.join(distRoot, "assets"), { recursive: true });
  await fs.writeFile(
    path.join(dataRoot, "claude", "latest-metadata.json"),
    JSON.stringify({ provider: "claude" }),
    "utf8"
  );
  await fs.writeFile(
    path.join(distRoot, "index.html"),
    "<!doctype html><title>Token Reporting shell</title>",
    "utf8"
  );
  await fs.writeFile(path.join(distRoot, "assets", "index.js"), "console.log('ok');", "utf8");

  return { dataRoot, distRoot };
}

function listen(server: http.Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      servers.push(server);
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        resolve(`http://127.0.0.1:${address.port}`);
      }
    });
  });
}

async function expectJson(response: Response, status: number, expected: unknown): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.json()).resolves.toEqual(expected);
}
