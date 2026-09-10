import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { persistHuggingFaceCandidates } from "../huggingFaceCandidatePersistence";
import type { HuggingFaceCandidateSet } from "../huggingFaceCandidates";

const candidateSet: HuggingFaceCandidateSet = {
  candidateSetId: "fixture-candidates", candidates: [],
  generatedAt: "2026-09-09T00:00:00.000Z", source: "huggingface_hub_api"
};
let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-hf-root-test-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("Hugging Face shared data root", () => {
  it("persistHuggingFaceCandidates_ConfiguredRoot_WritesServedCandidateSet", async () => {
    const outputPath = await persistHuggingFaceCandidates(candidateSet, { env: { TOKEN_REPORTING_DATA_ROOT: root } });
    expect(outputPath).toBe(path.join(root, "huggingface", "local-model-candidates.json"));
    expect(JSON.parse(await fs.readFile(outputPath, "utf8"))).toEqual(candidateSet);
  });

  it("persistHuggingFaceCandidates_ExplicitPath_PreservesOverridePrecedence", async () => {
    const outputPath = path.join(root, "explicit.json");
    await persistHuggingFaceCandidates(candidateSet, {
      outputPath, dataRoot: path.join(root, "other-root"),
      env: { TOKEN_REPORTING_HF_CANDIDATES_PATH: path.join(root, "ignored.json") }
    });
    expect(await fs.readdir(root)).toEqual(["explicit.json"]);
  });

  it("persistHuggingFaceCandidates_LegacyEnvironmentPath_PreservesOverride", async () => {
    const outputPath = path.join(root, "custom.json");
    expect(await persistHuggingFaceCandidates(candidateSet, {
      env: { TOKEN_REPORTING_HF_CANDIDATES_PATH: outputPath, TOKEN_REPORTING_DATA_ROOT: path.join(root, "ignored-root") }
    })).toBe(outputPath);
  });

  it("persistHuggingFaceCandidates_ReadOnly_DoesNotWrite", async () => {
    await expect(persistHuggingFaceCandidates(candidateSet, { env: {
      TOKEN_REPORTING_READ_ONLY: "true", TOKEN_REPORTING_DATA_ROOT: root
    } })).rejects.toThrow("TOKEN_REPORTING_READ_ONLY");
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("refreshHuggingFaceCli_ReadOnly_StopsBeforeAnyNetworkCall", async () => {
    const repoRoot = process.cwd();
    const forbidFetch = `data:text/javascript,${encodeURIComponent('globalThis.fetch = async () => { throw new Error("FIXTURE_FETCH_CALLED"); };')}`;
    const result = await promisify(execFile)(process.execPath, [
      "--import", "tsx", "--import", forbidFetch,
      path.join(repoRoot, "scripts", "refresh-huggingface-candidates.ts")
    ], { cwd: repoRoot, env: { PATH: process.env.PATH, TOKEN_REPORTING_READ_ONLY: "true", TOKEN_REPORTING_DATA_ROOT: root } })
      .then(() => ({ stderr: "unexpected_success" }), (error: { stderr: string }) => error);
    expect(result.stderr).toContain("TOKEN_REPORTING_READ_ONLY");
    expect(result.stderr).not.toContain("FIXTURE_FETCH_CALLED");
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("refreshHuggingFaceCli_SeparateCodeRoot_WritesOnlyServedCandidates", async () => {
    const repoRoot = process.cwd();
    const codeRoot = path.join(root, "code");
    const dataRoot = path.join(root, "data");
    await fs.mkdir(codeRoot);
    const fixtureFetch = `data:text/javascript,${encodeURIComponent('globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: "fixture/model" }) });')}`;
    await promisify(execFile)(process.execPath, [
      "--import", path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs"),
      "--import", fixtureFetch, path.join(repoRoot, "scripts", "refresh-huggingface-candidates.ts")
    ], { cwd: codeRoot, env: { PATH: process.env.PATH, TOKEN_REPORTING_DATA_ROOT: dataRoot } });
    const saved = JSON.parse(await fs.readFile(path.join(dataRoot, "huggingface", "local-model-candidates.json"), "utf8"));
    expect(saved).toMatchObject({ source: "huggingface_hub_api", candidates: expect.any(Array) });
    expect(await fs.readdir(codeRoot)).toEqual([]);
  });
});
