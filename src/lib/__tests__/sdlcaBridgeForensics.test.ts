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

  it("createSdlcaBridgeForensicExecutor_InvalidCurrentSchemaResult_IsNotNormalized", async () => {
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
          result: forensicArtifact("codex", "Wrong provider result")
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
        validationErrors: ["providerKind_expected_claude"]
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
        resultSummary: expect.objectContaining({
          keys: ["schemaVersion"]
        }),
        validationErrors: expect.arrayContaining([
          "artifactSchemaVersion_expected_sdlca.bridge.forensic.v0"
        ])
      },
      reviewerModel: "opus",
      status: "failed"
    });
    expect(result.reviewerArtifacts[0]?.artifact).toBeUndefined();
  });

  it("createSdlcaBridgeForensicExecutor_LegacyBridgeResult_NormalizesAndRedactsArtifact", async () => {
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
            findings: [
              {
                details: "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN=super-secret",
                evidenceRefs: ["Authorization: Bearer super-secret"],
                severity: "critical",
                title: "credential leaked"
              }
            ],
            provenance: {
              snapshotId: "dynamic-usage-codex-2026-06-07",
              source: "provider_execution"
            },
            recommendations: ["Rotate sk-test_1234567890abcd before sharing."],
            reviewerModel: "sonnet",
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
    expect(result.reviewerArtifacts[0]).toMatchObject({
      artifact: {
        artifactSchemaVersion: "sdlca.bridge.forensic.v0",
        findings: [
          {
            details: "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN=[REDACTED]",
            evidenceRefs: ["Authorization: Bearer [REDACTED]"],
            severity: "high",
            title: "credential leaked"
          }
        ],
        providerKind: "claude",
        provenance: {
          redacted: true,
          source: "provider_execution"
        },
        recommendations: ["Rotate [REDACTED] before sharing."],
        summary: "credential: [REDACTED]"
      },
      bridgeProviderKind: "claude",
      reviewerModel: "sonnet",
      status: "completed"
    });
    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain("super-secret");
    expect(serializedResult).not.toContain("sk-test_1234567890abcd");
  });

  it("createSdlcaBridgeForensicExecutor_LegacyBridgeResultForDifferentProvider_IsNotNormalized", async () => {
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
            findings: [{ details: "Wrong provider.", severity: "low", title: "Provider mismatch" }],
            providerKind: "codex",
            recommendations: [],
            schemaVersion: "sdlca.bridge.forensic.v0",
            summary: "Wrong provider result"
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
          "providerKind_expected_claude"
        ])
      },
      reviewerModel: "opus",
      status: "failed"
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
