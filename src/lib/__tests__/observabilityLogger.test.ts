import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createObservabilityLogger, resolveLoggingConfig } from "../observabilityLogger";

describe("observabilityLogger", () => {
  it("resolveLoggingConfig_CliFlagsPresent_OverrideEnvironmentAndClampToSupportedRange", () => {
    const config = resolveLoggingConfig({
      argv: ["node", "script", "--verbose", "3", "--debug=3"],
      env: {
        DEBUG: "0",
        VERBOSE: "0"
      },
      serviceName: "token-reporting-test"
    });

    expect(config).toMatchObject({
      debug: 3,
      serviceName: "token-reporting-test",
      verbose: 3
    });
  });

  it("resolveLoggingConfig_DebugEnabled_ImposesDebugVerbosityFloor", () => {
    const config = resolveLoggingConfig({
      argv: ["node", "script"],
      env: {
        DEBUG: "1",
        VERBOSE: "0"
      },
      serviceName: "token-reporting-test"
    });

    expect(config.verbose).toBe(2);
    expect(config.debug).toBe(1);
  });

  it("createObservabilityLogger_VerboseThreeDebugThree_WritesStandardDebugAndTraceArtifacts", async () => {
    const logRoot = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-logs-"));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const logger = createObservabilityLogger({
      debug: 3,
      logRoot,
      now: () => new Date("2026-06-08T22:29:00.000Z"),
      serviceName: "token-reporting-test",
      stderr: (line) => stderr.push(line),
      stdout: (line) => stdout.push(line),
      verbose: 3
    });

    logger.info("Refresh started", {
      jobId: "dynamic-refresh-20260608T222900000Z",
      OPENAI_ADMIN_API_KEY: "admin-secret"
    });
    logger.debug("Bridge reviewer selected", {
      providerKind: "claude",
      reviewerModel: "opus"
    });
    logger.trace("Bridge response received", {
      body: {
        accessToken: "bridge-secret",
        status: "failed"
      }
    });
    logger.error("Reviewer failed", { providerKind: "claude" }, new Error("boom"));

    const standardLog = await fs.readFile(
      path.join(logRoot, "token-reporting-test-2026-06-08.log"),
      "utf8"
    );
    const debugLog = await fs.readFile(
      path.join(logRoot, "token-reporting-test-debug-2026-06-08.log"),
      "utf8"
    );
    const traceLog = await fs.readFile(
      path.join(logRoot, "token-reporting-test-trace-2026-06-08.log"),
      "utf8"
    );

    expect(standardLog).toContain("Refresh started");
    expect(standardLog).toContain("Reviewer failed");
    expect(standardLog).not.toContain("Bridge reviewer selected");
    expect(debugLog).toContain("Bridge reviewer selected");
    expect(traceLog).toContain("Bridge response received");
    expect(traceLog).toContain("[REDACTED]");
    expect(traceLog).not.toContain("admin-secret");
    expect(traceLog).not.toContain("bridge-secret");
    expect(stdout.join("\n")).toContain("Bridge response received");
    expect(stderr.join("\n")).toContain("Reviewer failed");
  });
});
