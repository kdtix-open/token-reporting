import { describe, expect, it, vi } from "vitest";

import { createProviderScriptRefreshExecutor } from "../dynamicRefreshExecutor";

describe("dynamicRefreshExecutor", () => {
  it("createProviderScriptRefreshExecutor_HistoricalSelectedProviders_RunsProviderScriptsWithHistoricalEnv", async () => {
    const runScript = vi.fn().mockResolvedValue({ ok: true });
    const executor = createProviderScriptRefreshExecutor({
      env: {
        OPENAI_ADMIN_API_KEY: "codex-admin"
      },
      now: () => new Date("2026-06-07T17:00:00.000Z"),
      runScript
    });

    const result = await executor({
      includeForensicModelProfiles: false,
      includeHuggingFaceRefresh: false,
      mode: "historical",
      providers: ["codex"],
      reviewerModels: []
    });

    expect(runScript).toHaveBeenCalledWith("report:codex", {
      OPENAI_ADMIN_API_KEY: "codex-admin",
      TOKEN_REPORTING_FETCH_MODE: "historical"
    });
    expect(result.providerResults).toEqual([
      {
        completedAt: "2026-06-07T17:00:00.000Z",
        providerId: "codex",
        startedAt: "2026-06-07T17:00:00.000Z",
        status: "completed"
      }
    ]);
  });

  it("createProviderScriptRefreshExecutor_MissingRequiredAdminEnv_ReturnsDegradedWithoutRunningScript", async () => {
    const runScript = vi.fn();
    const executor = createProviderScriptRefreshExecutor({
      env: {},
      runScript
    });

    const result = await executor({
      includeForensicModelProfiles: false,
      includeHuggingFaceRefresh: false,
      mode: "incremental",
      providers: ["cursor"],
      reviewerModels: []
    });

    expect(runScript).not.toHaveBeenCalled();
    expect(result.providerResults).toEqual([
      expect.objectContaining({
        degradedReason: "CURSOR_ADMIN_API_KEY_not_configured",
        providerId: "cursor",
        status: "degraded"
      })
    ]);
  });

  it("createProviderScriptRefreshExecutor_ScriptFailure_ReturnsFailedProviderResult", async () => {
    const runScript = vi.fn().mockResolvedValue({
      ok: false,
      stderr: "rate limited"
    });
    const executor = createProviderScriptRefreshExecutor({
      env: {
        ANTHROPIC_ADMIN_API_KEY: "anthropic-admin"
      },
      runScript
    });

    const result = await executor({
      includeForensicModelProfiles: false,
      includeHuggingFaceRefresh: false,
      mode: "incremental",
      providers: ["claude"],
      reviewerModels: []
    });

    expect(result.providerResults).toEqual([
      expect.objectContaining({
        degradedReason: "rate limited",
        providerId: "claude",
        status: "failed"
      })
    ]);
  });

  it("createProviderScriptRefreshExecutor_HuggingFaceRefreshRequested_RunsCandidateScript", async () => {
    const runScript = vi.fn().mockResolvedValue({
      ok: true,
      stdout: "Wrote 5 Hugging Face candidates\nHugging Face candidate set id: hf-candidates-20260607T172000123Z\n"
    });
    const executor = createProviderScriptRefreshExecutor({
      env: {
        OPENAI_ADMIN_API_KEY: "codex-admin"
      },
      runScript
    });

    const result = await executor({
      includeForensicModelProfiles: false,
      includeHuggingFaceRefresh: true,
      mode: "incremental",
      providers: ["codex"],
      reviewerModels: []
    });

    expect(runScript).toHaveBeenNthCalledWith(
      1,
      "report:huggingface-candidates",
      expect.objectContaining({
        OPENAI_ADMIN_API_KEY: "codex-admin"
      })
    );
    expect(runScript).toHaveBeenNthCalledWith(
      2,
      "report:codex",
      expect.objectContaining({
        OPENAI_ADMIN_API_KEY: "codex-admin"
      })
    );
    expect(result.huggingFaceCandidateSetId).toBe("hf-candidates-20260607T172000123Z");
  });

  it("createProviderScriptRefreshExecutor_GitHubCopilotSelected_RunsExistingCopilotScript", async () => {
    const runScript = vi.fn().mockResolvedValue({ ok: true });
    const executor = createProviderScriptRefreshExecutor({
      env: {
        GITHUB_ADMIN_TOKEN: "github-admin"
      },
      runScript
    });

    await executor({
      includeForensicModelProfiles: false,
      includeHuggingFaceRefresh: false,
      mode: "incremental",
      providers: ["github-copilot"],
      reviewerModels: []
    });

    expect(runScript).toHaveBeenCalledWith(
      "report:copilot",
      expect.objectContaining({
        GITHUB_ADMIN_TOKEN: "github-admin"
      })
    );
  });
});
