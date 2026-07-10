import { describe, expect, it, vi } from "vitest";

import { createSdlcaBridgeForensicExecutor } from "../sdlcaBridgeForensics";

const forensicCapabilities = {
  artifactKinds: ["local_model_forensic_review"],
  artifactSchemaVersion: "sdlca.bridge.forensic.v0",
  emitsRawAdminSnapshots: false,
  executionKind: "forensic",
  requiresAdminCredentials: false,
  resultKind: "forensic",
  supportedProviderRoles: ["reviewer"],
  supportsReviewerArtifacts: true
};

const evidencePacket = {
  artifactUri: "local://token-reporting/forensics/run-001/evidence-packet.json",
  generatedAt: "2026-06-07T17:30:00.000Z",
  huggingFaceCandidateSetId: "hf-candidates-test",
  providerSnapshotIds: ["dynamic-usage-codex-2026-06-07"],
  usageSnapshotId: "dynamic-usage-codex-2026-06-07"
};

describe("sdlcaBridgeForensics", () => {
  it("createSdlcaBridgeForensicExecutor_RunsReviewerArtifactsThroughExistingExecutePath", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          providers: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude reviewer",
              resolvedExecutable: "/usr/bin/claude"
            },
            {
              forensicCapabilities,
              kind: "codex",
              providerId: "codex-reviewer",
              providerName: "Codex reviewer",
              resolvedExecutable: "/usr/bin/codex"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: forensicArtifact("claude", "Sonnet perspective")
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: forensicArtifact("codex", "GPT perspective")
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      timeoutMs: 45_000,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet", "gpt"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:4818/providers",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-sdlca-bridge-token": "bridge-token" }),
        method: "GET"
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:4818/execute",
      expect.objectContaining({
        body: expect.stringContaining('"executionKind":"forensic"'),
        headers: expect.objectContaining({ "x-sdlca-bridge-token": "bridge-token" }),
        method: "POST"
      })
    );
    const firstExecuteBody = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
    expect(firstExecuteBody).toMatchObject({
      executionKind: "forensic",
      providerKind: "claude",
      providerRole: "reviewer",
      timeoutMs: 45_000,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });
    expect(firstExecuteBody).not.toHaveProperty("model");
    const secondExecuteBody = JSON.parse(fetcher.mock.calls[2]![1]!.body as string);
    expect(secondExecuteBody).not.toHaveProperty("model");
    expect(firstExecuteBody.schema).toMatchObject({
      properties: {
        artifactSchemaVersion: { const: "sdlca.bridge.forensic.v0" }
      },
      type: "object"
    });
    expect(firstExecuteBody.prompt).toContain("dynamic-forensic-20260607T173000000Z");
    expect(firstExecuteBody.prompt).toContain("hf-candidates-test");
    expect(firstExecuteBody.prompt).toContain("Return exactly one JSON object and nothing else.");

    expect(result.status).toBe("completed");
    expect(result.reviewerArtifacts).toEqual([
      expect.objectContaining({
        artifact: expect.objectContaining({ providerKind: "claude", summary: "Sonnet perspective" }),
        bridgeProviderKind: "claude",
        reviewerModel: "sonnet",
        status: "completed"
      }),
      expect.objectContaining({
        artifact: expect.objectContaining({ providerKind: "codex", summary: "GPT perspective" }),
        bridgeProviderKind: "codex",
        reviewerModel: "gpt",
        status: "completed"
      })
    ]);
  });

  it("createSdlcaBridgeForensicExecutor_RealSdlcaProviderResultShape_RunsReviewerArtifact", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "codex",
              providerId: "codex-worker",
              providerName: "Codex Worker",
              resolvedExecutable: "/usr/bin/codex"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: forensicArtifact("codex", "Real bridge result shape")
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["gpt"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const executeBody = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
    expect(executeBody).toMatchObject({
      executionKind: "forensic",
      providerKind: "codex",
      providerRole: "reviewer"
    });
    expect(executeBody).not.toHaveProperty("model");
    expect(result.status).toBe("completed");
    expect(result.reviewerArtifacts).toEqual([
      expect.objectContaining({
        artifact: expect.objectContaining({
          providerKind: "codex",
          summary: "Real bridge result shape"
        }),
        bridgeProviderKind: "codex",
        reviewerModel: "gpt",
        status: "completed"
      })
    ]);
  });

  it("createSdlcaBridgeForensicExecutor_ProviderUnavailable_ReturnsDegradedReviewerArtifact", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(jsonResponse({ providers: [] }));
    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("degraded");
    expect(result.reviewerArtifacts).toEqual([
      expect.objectContaining({
        bridgeProviderKind: "claude",
        degradedReason: "bridge_forensic_provider_unavailable",
        reviewerModel: "sonnet",
        status: "failed"
      })
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("createSdlcaBridgeForensicExecutor_BridgeExecuteInProgress_PublishesRunningArtifactBeforeCompletion", async () => {
    let resolveExecute: ((response: Response) => void) | undefined;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "codex",
              providerId: "codex-reviewer",
              providerName: "Codex Reviewer",
              resolvedExecutable: "/usr/bin/codex"
            }
          ]
        })
      )
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveExecute = resolve;
        })
      );
    const progressArtifacts: Array<Array<{ reviewerModel: string; status: string }>> = [];
    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const resultPromise = executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      onReviewerArtifact: (_artifact, artifacts) => {
        progressArtifacts.push(
          artifacts.map((artifact) => ({
            reviewerModel: artifact.reviewerModel,
            status: artifact.status
          }))
        );
      },
      reviewerModels: ["kimi"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
    expect(progressArtifacts[0]).toEqual([{ reviewerModel: "kimi", status: "running" }]);

    resolveExecute?.(
      jsonResponse({
        result: forensicArtifact("codex", "Kimi perspective")
      })
    );
    await expect(resultPromise).resolves.toMatchObject({
      reviewerArtifacts: [expect.objectContaining({ reviewerModel: "kimi", status: "completed" })],
      status: "completed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_DuplicateReviewerModels_ReplacesMatchingRunningSlot", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "codex",
              providerId: "codex-reviewer",
              providerName: "Codex Reviewer",
              resolvedExecutable: "/usr/bin/codex"
            }
          ]
        })
      )
      .mockResolvedValueOnce(jsonResponse({ result: forensicArtifact("codex", "First GPT") }))
      .mockResolvedValueOnce(jsonResponse({ result: forensicArtifact("codex", "Second GPT") }));
    const progressArtifacts: Array<Array<{ reviewerModel: string; status: string; summary?: string }>> = [];
    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      onReviewerArtifact: (_artifact, artifacts) => {
        progressArtifacts.push(
          artifacts.map((artifact) => ({
            reviewerModel: artifact.reviewerModel,
            status: artifact.status,
            summary: artifact.artifact?.summary as string | undefined
          }))
        );
      },
      reviewerModels: ["gpt", "gpt"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("completed");
    expect(result.reviewerArtifacts).toEqual([
      expect.objectContaining({
        artifact: expect.objectContaining({ summary: "First GPT" }),
        reviewerModel: "gpt",
        status: "completed"
      }),
      expect.objectContaining({
        artifact: expect.objectContaining({ summary: "Second GPT" }),
        reviewerModel: "gpt",
        status: "completed"
      })
    ]);
    expect(progressArtifacts.at(-1)).toEqual([
      { reviewerModel: "gpt", status: "completed", summary: "First GPT" },
      { reviewerModel: "gpt", status: "completed", summary: "Second GPT" }
    ]);
  });

  it("createSdlcaBridgeForensicExecutor_CallbackMutation_DoesNotCorruptReviewerArtifacts", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          providers: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude reviewer",
              resolvedExecutable: "/usr/bin/claude"
            },
            {
              forensicCapabilities,
              kind: "codex",
              providerId: "codex-reviewer",
              providerName: "Codex reviewer",
              resolvedExecutable: "/usr/bin/codex"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: forensicArtifact("claude", "Sonnet perspective")
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: forensicArtifact("codex", "GPT perspective")
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      onReviewerArtifact: (artifact, artifacts) => {
        artifact.status = "failed";
        artifact.reviewerModel = "callback-mutated";
        artifacts.length = 0;
      },
      reviewerModels: ["sonnet", "gpt"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result).toMatchObject({
      reviewerArtifacts: [
        expect.objectContaining({
          artifact: expect.objectContaining({ providerKind: "claude", summary: "Sonnet perspective" }),
          reviewerModel: "sonnet",
          status: "completed"
        }),
        expect.objectContaining({
          artifact: expect.objectContaining({ providerKind: "codex", summary: "GPT perspective" }),
          reviewerModel: "gpt",
          status: "completed"
        })
      ],
      status: "completed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_BridgeExecuteTimeout_ReturnsFailedTimeoutArtifact", async () => {
    vi.useFakeTimers();
    let executeInit: RequestInit | undefined;
    try {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            result: [
              {
                forensicCapabilities,
                kind: "codex",
                providerId: "codex-reviewer",
                providerName: "Codex Reviewer",
                resolvedExecutable: "/usr/bin/codex"
              }
            ]
          })
        )
        .mockImplementationOnce((_url: string, init?: RequestInit) => {
          executeInit = init;
          if (!init?.signal) {
            return Promise.resolve(textResponse({ error: "missing abort signal" }, 599));
          }
          return new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const error = new Error("The bridge execute request was aborted.");
              error.name = "AbortError";
              reject(error);
            });
          });
        });

      const executor = createSdlcaBridgeForensicExecutor({
        bridgeToken: "bridge-token",
        bridgeUrl: "http://127.0.0.1:4818",
        fetcher,
        timeoutMs: 1_000,
        workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
      });

      const resultPromise = executor({
        createdAt: "2026-06-07T17:30:00.000Z",
        evidencePacket,
        huggingFaceCandidateSetId: "hf-candidates-test",
        reviewerModels: ["kimi"],
        runId: "dynamic-forensic-20260607T173000000Z",
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      });

      await vi.waitFor(() => {
        expect(executeInit?.signal).toBeDefined();
      });
      await vi.advanceTimersByTimeAsync(1_001);

      const result = await resultPromise;
      expect(result.status).toBe("degraded");
      expect(result.reviewerArtifacts).toEqual([
        expect.objectContaining({
          bridgeProviderKind: "codex",
          degradedReason: "sdlca_bridge_forensic_execute_timeout",
          diagnostics: expect.objectContaining({
            bridgeProviderKind: "codex",
            timeoutMs: 1_000
          }),
          reviewerModel: "kimi",
          status: "failed"
        })
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("createSdlcaBridgeForensicExecutor_BridgeExecuteBodyTimeout_ReturnsFailedTimeoutArtifact", async () => {
    vi.useFakeTimers();
    let executeInit: RequestInit | undefined;
    try {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            result: [
              {
                forensicCapabilities,
                kind: "codex",
                providerId: "codex-reviewer",
                providerName: "Codex Reviewer",
                resolvedExecutable: "/usr/bin/codex"
              }
            ]
          })
        )
        .mockImplementationOnce((_url: string, init?: RequestInit) => {
          executeInit = init;
          return Promise.resolve({
            json: async () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                  const error = new Error("The bridge execute body read was aborted.");
                  error.name = "AbortError";
                  reject(error);
                });
              }),
            ok: true,
            status: 200
          } as unknown as Response);
        });

      const executor = createSdlcaBridgeForensicExecutor({
        bridgeToken: "bridge-token",
        bridgeUrl: "http://127.0.0.1:4818",
        fetcher,
        timeoutMs: 1_000,
        workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
      });

      const resultPromise = executor({
        createdAt: "2026-06-07T17:30:00.000Z",
        evidencePacket,
        huggingFaceCandidateSetId: "hf-candidates-test",
        reviewerModels: ["kimi"],
        runId: "dynamic-forensic-20260607T173000000Z",
        usageSnapshotId: "dynamic-usage-codex-2026-06-07"
      });

      await vi.waitFor(() => {
        expect(executeInit?.signal).toBeDefined();
      });
      await vi.advanceTimersByTimeAsync(1_001);

      await expect(resultPromise).resolves.toMatchObject({
        reviewerArtifacts: [
          expect.objectContaining({
            degradedReason: "sdlca_bridge_forensic_execute_timeout",
            diagnostics: expect.objectContaining({
              timeoutMs: 1_000
            }),
            reviewerModel: "kimi",
            status: "failed"
          })
        ],
        status: "degraded"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("createSdlcaBridgeForensicExecutor_CopilotReviewerLabel_DoesNotSendInvalidModelOverride", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "copilot",
              providerId: "copilot-reviewer",
              providerName: "Copilot Reviewer",
              resolvedExecutable: "/usr/bin/copilot"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: forensicArtifact("copilot", "Copilot perspective")
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["copilot"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    const executeBody = JSON.parse(fetcher.mock.calls[1]![1]!.body as string);
    expect(executeBody).toMatchObject({
      executionKind: "forensic",
      providerKind: "copilot",
      providerRole: "reviewer"
    });
    expect(executeBody).not.toHaveProperty("model");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      bridgeProviderKind: "copilot",
      reviewerModel: "copilot",
      status: "completed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_BridgeExecuteFailure_PersistsRedactedDiagnostics", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "cursor",
              providerId: "cursor-reviewer",
              providerName: "Cursor Reviewer",
              resolvedExecutable: "/usr/bin/cursor-agent"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        textResponse(
          {
            error:
              "Command failed\nS: Increase limits for faster responses You're out of usage.\nbridgeToken=super-secret"
          },
          500
        )
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["composer"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("degraded");
    expect(result.reviewerArtifacts).toEqual([
      expect.objectContaining({
        bridgeProviderKind: "cursor",
        degradedReason: "sdlca_bridge_forensic_execute_failed_500",
        diagnostics: expect.objectContaining({
          bridgeErrorSummary: expect.stringContaining("out of usage"),
          bridgeHttpStatus: 500,
          bridgeProviderKind: "cursor"
        }),
        reviewerModel: "composer",
        status: "failed"
      })
    ]);
    expect(JSON.stringify(result.reviewerArtifacts[0]?.diagnostics)).not.toContain("super-secret");
  });

  it("createSdlcaBridgeForensicExecutor_NormalizedReviewerText_RedactsSecrets", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            findings: [
              {
                details: "Observed TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN=super-secret in output.",
                evidenceRefs: ["Authorization: Bearer super-secret"],
                severity: "high",
                title: "secret leak"
              }
            ],
            recommendations: ["Rotate sk-test_1234567890abcd before sharing."],
            schemaVersion: "sdlca.bridge.forensic.v0",
            summary: "credential: super-secret"
          }
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("completed");
    const artifactText = JSON.stringify(result.reviewerArtifacts[0]?.artifact);
    expect(artifactText).toContain("[REDACTED]");
    expect(artifactText).not.toContain("super-secret");
    expect(artifactText).not.toContain("sk-test_1234567890abcd");
  });

  it("createSdlcaBridgeForensicExecutor_CurrentSchemaArtifact_RedactsSecrets", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            ...forensicArtifact("claude", "Sonnet perspective"),
            api_key: "sk-test_1234567890abcd",
            metrics: {
              inputTokens: 12_345,
              outputTokens: 678,
              requiredContextTokens: 1_000_000,
              tokenUsage: {
                inputTokens: 12_345
              }
            },
            findings: [
              {
                details: "Observed token=super-secret in a valid bridge artifact.",
                severity: "high",
                title: "secret leak"
              }
            ],
            recommendations: ["Rotate sk-test_1234567890abcd before sharing."],
            summary: "credential: super-secret"
          }
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("completed");
    const artifactText = JSON.stringify(result.reviewerArtifacts[0]?.artifact);
    expect(result.reviewerArtifacts[0]?.artifact).toMatchObject({
      metrics: {
        inputTokens: 12_345,
        outputTokens: 678,
        requiredContextTokens: 1_000_000,
        tokenUsage: {
          inputTokens: 12_345
        }
      }
    });
    expect(artifactText).toContain("[REDACTED]");
    expect(artifactText).not.toContain("super-secret");
    expect(artifactText).not.toContain("sk-test_1234567890abcd");
  });

  it("createSdlcaBridgeForensicExecutor_BridgeHttpOkJsonParseFailure_ReturnsFailedArtifact", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce({
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
        ok: true,
        status: 200
      } as unknown as Response);

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("degraded");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      bridgeProviderKind: "claude",
      degradedReason: "sdlca_bridge_forensic_output_parse_failed",
      diagnostics: expect.objectContaining({
        bridgeErrorSummary: expect.stringContaining("Unexpected token"),
        bridgeHttpStatus: 200,
        bridgeProviderKind: "claude"
      }),
      reviewerModel: "sonnet",
      status: "failed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_BridgeJsonParseFailure_LabelsReviewerOutputParseFailure", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        textResponse(
          {
            error: "Unexpected non-whitespace character after JSON at position 3851 (line 68 column 1)"
          },
          500
        )
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("degraded");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      bridgeProviderKind: "claude",
      degradedReason: "sdlca_bridge_forensic_output_parse_failed",
      diagnostics: expect.objectContaining({
        bridgeErrorSummary: expect.stringContaining("Unexpected non-whitespace character"),
        bridgeHttpStatus: 500,
        bridgeProviderKind: "claude"
      }),
      reviewerModel: "sonnet",
      status: "failed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_InvalidBridgeResult_PersistsValidationDiagnostics", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            artifactKind: "local_model_forensic_review",
            findings: [],
            generatedAt: "2026-06-07T17:30:30.000Z",
            providerKind: "claude",
            providerRole: "reviewer",
            recommendations: [],
            summary: "Missing schema version."
          }
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["opus"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("degraded");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      bridgeProviderKind: "claude",
      degradedReason: "sdlca_bridge_forensic_result_invalid",
      diagnostics: {
        bridgeHttpStatus: 200,
        bridgeProviderKind: "claude",
        resultSummary: expect.objectContaining({
          keys: expect.arrayContaining(["artifactKind", "summary"])
        }),
        validationErrors: ["artifactSchemaVersion_expected_sdlca.bridge.forensic.v0"]
      },
      reviewerModel: "opus",
      status: "failed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_SchemaOnlyBridgeResult_DoesNotNormalizeSyntheticArtifact", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            schemaVersion: "sdlca.bridge.forensic.v0"
          }
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-07T17:30:00.000Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["opus"],
      runId: "dynamic-forensic-20260607T173000000Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-07"
    });

    expect(result.status).toBe("degraded");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      bridgeProviderKind: "claude",
      degradedReason: "sdlca_bridge_forensic_result_invalid",
      diagnostics: {
        bridgeHttpStatus: 200,
        bridgeProviderKind: "claude",
        validationErrors: expect.arrayContaining([
          "artifactSchemaVersion_expected_sdlca.bridge.forensic.v0",
          "findings_expected_array",
          "summary_expected_string"
        ])
      },
      reviewerModel: "opus",
      status: "failed"
    });
  });

  it("createSdlcaBridgeForensicExecutor_StructuredSonnetBridgeResult_NormalizesReviewerArtifact", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            evidenceIntegrity: {
              redacted: true,
              source: "provider_execution"
            },
            findings: [
              {
                details:
                  "Cache-heavy workload can start with local short-context routing while hosted providers keep the tail.",
                severity: "medium",
                title: "Tiered local routing remains appropriate"
              }
            ],
            generatedAt: "2026-06-10T03:31:17.923Z",
            inputs: {
              authorization: "Bearer super-secret",
              usageSnapshotId: "dynamic-usage-codex-2026-06-10"
            },
            localModelAssessment: {
              migrationFit: "partial",
              serverSizing: "dual workstation lane"
            },
            nextActions: [
              "Apply short-context workloads to local candidates first.",
              {
                title: "Keep hosted tail workloads",
                details: "Long-context and cache-heavy forensic workloads stay hosted."
              }
            ],
            redactions: {
              rawProviderSnapshots: "omitted"
            },
            reviewer: {
              model: "sonnet",
              providerKind: "claude"
            },
            runId: "dynamic-forensic-20260610T033047026Z",
            schemaVersion: "sdlca.bridge.forensic.v0",
            summary: {
              conclusion:
                "Tiered local routing is supported, but long-context work should remain hosted.",
              confidence: 0.91
            }
          }
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-10T03:30:47.026Z",
      evidencePacket,
      huggingFaceCandidateSetId: "hf-candidates-test",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260610T033047026Z",
      usageSnapshotId: "dynamic-usage-codex-2026-06-10"
    });

    expect(result.status).toBe("completed");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      artifact: {
        artifactKind: "local_model_forensic_review",
        artifactSchemaVersion: "sdlca.bridge.forensic.v0",
        generatedAt: "2026-06-10T03:31:17.923Z",
        providerKind: "claude",
        providerRole: "reviewer",
        provenance: {
          redacted: true,
          source: "provider_execution"
        },
        recommendations: [
          "Apply short-context workloads to local candidates first.",
          "Keep hosted tail workloads: Long-context and cache-heavy forensic workloads stay hosted."
        ],
        summary:
          "Tiered local routing is supported, but long-context work should remain hosted."
      },
      bridgeProviderKind: "claude",
      diagnostics: {
        normalizedFromBridgeResult: true,
        originalResultSummary: expect.objectContaining({
          hasFindings: true,
          hasRecommendations: false,
          hasSummary: false
        })
      },
      reviewerModel: "sonnet",
      status: "completed"
    });
    expect(JSON.stringify(result.reviewerArtifacts[0])).not.toContain("super-secret");
  });

  it("createSdlcaBridgeForensicExecutor_BridgeAttributedSonnetVerdict_NormalizesReviewerArtifact", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          result: [
            {
              forensicCapabilities,
              kind: "claude",
              providerId: "claude-reviewer",
              providerName: "Claude Reviewer",
              resolvedExecutable: "/usr/bin/claude"
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            bridgeProviderKind: "claude",
            evidence: {
              artifactUri:
                "local://token-reporting/forensics/dynamic-forensic-20260610T034941921Z/evidence-packet.json",
              providerSnapshotIds: ["dynamic-usage-codex-2026-06-11"]
            },
            findings: [
              {
                category: "snapshot_freshness",
                detail: "Trend comparisons should account for asymmetric collection windows.",
                severity: "medium",
                summary: "Primary usage snapshot lags other providers"
              }
            ],
            generatedAt: "2026-06-10T03:49:41.921Z",
            huggingFaceCandidateSetId: "dynamic-hf-candidates-unavailable-20260610T034941921Z",
            recommendations: [
              {
                action:
                  "Re-run the Hugging Face candidate fetch before publishing local-model fit conclusions.",
                priority: "high"
              }
            ],
            reviewerModel: "sonnet",
            runId: "dynamic-forensic-20260610T034941921Z",
            usageSnapshotId: "dynamic-usage-github-copilot-2026-06-08",
            verdict: {
              confidence: "low",
              rationale:
                "Reviewer can validate snapshot structure, but candidate-set evidence is unavailable.",
              status: "provisional"
            }
          }
        })
      );

    const executor = createSdlcaBridgeForensicExecutor({
      bridgeToken: "bridge-token",
      bridgeUrl: "http://127.0.0.1:4818",
      fetcher,
      workingDirectory: "/Users/ckreager/repos/kdtix/token_reporting"
    });

    const result = await executor({
      createdAt: "2026-06-10T03:49:41.921Z",
      evidencePacket,
      huggingFaceCandidateSetId: "dynamic-hf-candidates-unavailable-20260610T034941921Z",
      reviewerModels: ["sonnet"],
      runId: "dynamic-forensic-20260610T034941921Z",
      usageSnapshotId: "dynamic-usage-github-copilot-2026-06-08"
    });

    expect(result.status).toBe("completed");
    expect(result.reviewerArtifacts[0]).toMatchObject({
      artifact: {
        artifactKind: "local_model_forensic_review",
        artifactSchemaVersion: "sdlca.bridge.forensic.v0",
        findings: [
          {
            details: "Trend comparisons should account for asymmetric collection windows.",
            severity: "medium",
            title: "Primary usage snapshot lags other providers"
          }
        ],
        providerKind: "claude",
        recommendations: [
          "Re-run the Hugging Face candidate fetch before publishing local-model fit conclusions."
        ],
        summary: "provisional: Reviewer can validate snapshot structure, but candidate-set evidence is unavailable."
      },
      diagnostics: {
        normalizedFromBridgeResult: true,
        originalResultSummary: expect.objectContaining({
          hasFindings: true,
          hasRecommendations: true,
          hasSummary: false
        })
      },
      reviewerModel: "sonnet",
      status: "completed"
    });
  });
});

function forensicArtifact(providerKind: "claude" | "codex" | "copilot", summary: string) {
  return {
    artifactKind: "local_model_forensic_review",
    artifactSchemaVersion: "sdlca.bridge.forensic.v0",
    findings: [
      {
        details: `${providerKind} reviewed the local model evidence packet.`,
        severity: "info",
        title: "Evidence reviewed"
      }
    ],
    generatedAt: "2026-06-07T17:30:30.000Z",
    providerKind,
    providerRole: "reviewer",
    provenance: {
      redacted: true,
      snapshotId: "dynamic-usage-codex-2026-06-07",
      source: "provider_execution"
    },
    recommendations: [`${summary} recommendation`],
    summary
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    json: async () => body,
    ok: status >= 200 && status < 300,
    status
  } as Response;
}

function textResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  } as Response;
}
