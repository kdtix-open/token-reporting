import { describe, expect, it } from "vitest";

import {
  normalizePublicBasePath,
  resolveRuntimeApiBaseUrl,
  resolveRuntimeAssetPath
} from "../runtimePaths";

describe("runtimePaths", () => {
  it("normalizePublicBasePath_RootOrBlank_ReturnsEmptyBase", () => {
    expect(normalizePublicBasePath()).toBe("");
    expect(normalizePublicBasePath("")).toBe("");
    expect(normalizePublicBasePath("/")).toBe("");
  });

  it("normalizePublicBasePath_Subpath_ReturnsLeadingSlashWithoutTrailingSlash", () => {
    expect(normalizePublicBasePath("tools/token-reporting/")).toBe("/tools/token-reporting");
    expect(normalizePublicBasePath("/tools/token-reporting/")).toBe("/tools/token-reporting");
  });

  it("resolveRuntimeAssetPath_SubpathBuild_ReturnsSubpathScopedDataUrl", () => {
    expect(
      resolveRuntimeAssetPath("data/claude/latest-metadata.json", "/tools/token-reporting/")
    ).toBe("/tools/token-reporting/data/claude/latest-metadata.json");
  });

  it("resolveRuntimeApiBaseUrl_BrowserSubpath_ReturnsSameOriginSubpath", () => {
    expect(
      resolveRuntimeApiBaseUrl({
        basePath: "/tools/token-reporting/",
        origin: "https://dev.projectit.ai"
      })
    ).toBe("https://dev.projectit.ai/tools/token-reporting");
  });

  it("resolveRuntimeApiBaseUrl_ConfiguredApiUrl_WinsOverSameOriginDefault", () => {
    expect(
      resolveRuntimeApiBaseUrl({
        basePath: "/tools/token-reporting/",
        configuredApiBaseUrl: "http://127.0.0.1:8788/",
        origin: "https://dev.projectit.ai"
      })
    ).toBe("http://127.0.0.1:8788");
  });
});
