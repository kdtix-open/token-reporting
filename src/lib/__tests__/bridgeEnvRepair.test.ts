import { describe, expect, it } from "vitest";

import {
  buildBridgeEnvRepair,
  readDotenvKey
} from "../bridgeEnvRepair";

describe("bridgeEnvRepair", () => {
  it("buildBridgeEnvRepair_MissingBridgeKeys_AppendsRedactedTokenReportingBridgeConfig", () => {
    const result = buildBridgeEnvRepair({
      adminEnvText: "OPENAI_ADMIN_API_KEY=admin-token\n",
      bridgeEnvText: "SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN=bridge-secret\n",
      bridgeUrl: "http://127.0.0.1:4318",
      timeoutMs: 120000,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    expect(readDotenvKey(result.updatedAdminEnvText, "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN")).toBe(
      "bridge-secret"
    );
    expect(result.updatedAdminEnvText).toContain(
      "TOKEN_REPORTING_SDLCA_BRIDGE_URL=http://127.0.0.1:4318"
    );
    expect(result.updatedAdminEnvText).toContain(
      "TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY=/Users/ckreager/repos/kdtix/token_reporting"
    );
    expect(result.redactedSummary).toEqual(
      expect.objectContaining({
        bridgeToken: "[REDACTED]",
        changed: true
      })
    );
    expect(JSON.stringify(result.redactedSummary)).not.toContain("bridge-secret");
  });

  it("buildBridgeEnvRepair_ExistingBridgeKeys_ReplacesValuesWithoutDuplicatingKeys", () => {
    const result = buildBridgeEnvRepair({
      adminEnvText: [
        "TOKEN_REPORTING_SDLCA_BRIDGE_URL=http://old.example",
        "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN=old-secret",
        "TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS=1000",
        ""
      ].join("\n"),
      bridgeEnvText: "export SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN='new-secret'\n",
      bridgeUrl: "http://127.0.0.1:4318",
      timeoutMs: 120000,
      workingDirectory: "/repo"
    });

    expect(readDotenvKey(result.updatedAdminEnvText, "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN")).toBe(
      "new-secret"
    );
    expect(
      result.updatedAdminEnvText.match(/^TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN=/gm) ?? []
    ).toHaveLength(1);
    expect(result.updatedAdminEnvText).not.toContain("old-secret");
  });

  it("buildBridgeEnvRepair_MissingBridgeToken_FailsWithoutChangingAdminEnv", () => {
    expect(() =>
      buildBridgeEnvRepair({
        adminEnvText: "OPENAI_ADMIN_API_KEY=admin-token\n",
        bridgeEnvText: "OTHER_KEY=value\n",
        bridgeUrl: "http://127.0.0.1:4318",
        timeoutMs: 120000,
        workingDirectory: "/repo"
      })
    ).toThrow("SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN");
  });
});
