// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { build } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const outputDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(outputDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })));
});

describe("production build artifacts", () => {
  it.each(["/", "/tools/token-reporting/"])(
    "ProductionBuild_BasePath%s_EmitsJavaScriptWithinExistingWarningBudget",
    async base => {
      vi.stubEnv("NODE_ENV", "production");
      const outDir = await mkdtemp(path.join(tmpdir(), "token-reporting-bundle-test-"));
      outputDirectories.push(outDir);
      // Never copy private reporting snapshots into the disposable artifact.
      const result = await build({
        base,
        publicDir: false,
        build: { outDir, emptyOutDir: true }
      });
      if (!("output" in result)) throw new Error("Expected one non-watching application build");
      const chunks = result.output.filter(item => item.type === "chunk");
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(Buffer.byteLength(chunk.code, "utf8"), chunk.fileName).toBeLessThanOrEqual(500_000);
      }
      const html = result.output.find(item => item.type === "asset" && item.fileName === "index.html");
      expect(html?.type).toBe("asset");
      if (html?.type === "asset") expect(String(html.source)).toContain(`${base}assets/`);
    },
    30_000
  );
});
