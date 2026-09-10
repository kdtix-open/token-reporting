import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDataRoot } from "../dataRoot";

afterEach(() => vi.restoreAllMocks());

describe("resolveDataRoot", () => {
  it("resolveDataRoot_NoConfiguration_UsesCwdPublicData", () => {
    const cwd = path.resolve("fixture-code");
    vi.spyOn(process, "cwd").mockReturnValue(cwd);
    expect(resolveDataRoot({ env: {} })).toBe(path.join(cwd, "public", "data"));
  });

  it("resolveDataRoot_ConfiguredEnvironment_UsesCanonicalDataRoot", () => {
    const dataRoot = path.resolve("fixture-data");
    expect(resolveDataRoot({ cwd: path.resolve("fixture-code"), env: { TOKEN_REPORTING_DATA_ROOT: dataRoot } })).toBe(dataRoot);
  });

  it("resolveDataRoot_ExplicitOption_OverridesEnvironment", () => {
    const dataRoot = path.resolve("explicit-data");
    expect(resolveDataRoot({ dataRoot, env: { TOKEN_REPORTING_DATA_ROOT: path.resolve("ignored-data") } })).toBe(dataRoot);
  });

  it("resolveDataRoot_RelativeConfiguration_ResolvesAgainstExplicitCwd", () => {
    const cwd = path.resolve("fixture-code");
    expect(resolveDataRoot({ cwd, dataRoot: "../shared-data", env: {} })).toBe(path.resolve(cwd, "../shared-data"));
  });

  it("resolveDataRoot_NoOptions_ReadsProcessEnvironment", () => {
    const dataRoot = path.resolve("environment-data");
    vi.stubEnv("TOKEN_REPORTING_DATA_ROOT", dataRoot);
    try { expect(resolveDataRoot()).toBe(dataRoot); } finally { vi.unstubAllEnvs(); }
  });

  it.each(["", " ", "\t\n"])("resolveDataRoot_BlankExplicitOption=%j_RejectsBeforeFallback", (dataRoot) => {
    expect(() => resolveDataRoot({ dataRoot, env: { TOKEN_REPORTING_DATA_ROOT: "/ignored" } })).toThrow("Data root must not be empty");
  });

  it.each(["", " ", "\t\n"])("resolveDataRoot_BlankEnvironment=%j_RejectsBeforeFallback", (dataRoot) => {
    expect(() => resolveDataRoot({ env: { TOKEN_REPORTING_DATA_ROOT: dataRoot } })).toThrow("Data root must not be empty");
  });

  it("resolveDataRoot_ValidExplicitRoot_IgnoresBlankLowerPriorityEnvironment", () => {
    const dataRoot = path.resolve("explicit-data");
    expect(resolveDataRoot({ dataRoot, env: { TOKEN_REPORTING_DATA_ROOT: " " } })).toBe(dataRoot);
  });
});
