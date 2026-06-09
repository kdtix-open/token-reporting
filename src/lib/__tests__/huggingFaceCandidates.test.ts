import { describe, expect, it, vi } from "vitest";

import {
  loadHuggingFaceCandidateSet,
  refreshHuggingFaceCandidates
} from "../huggingFaceCandidates";

describe("huggingFaceCandidates", () => {
  it("refreshHuggingFaceCandidates_FetchesModelMetadata_ReturnsCandidateSet", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        cardData: {
          license: "apache-2.0"
        },
        config: {
          architectures: ["Qwen2ForCausalLM"],
          model_type: "qwen2"
        },
        downloads: 8_100_000,
        id: "Qwen/Qwen2.5-Coder-32B-Instruct",
        lastModified: "2025-01-12T00:00:00.000Z",
        library_name: "transformers",
        likes: 2_035,
        pipeline_tag: "text-generation",
        safetensors: {
          total: 32_763_900_000
        },
        tags: ["text-generation", "code", "license:apache-2.0"]
      }),
      ok: true
    });

    const result = await refreshHuggingFaceCandidates({
      fetcher,
      now: () => new Date("2026-06-07T17:10:00.000Z"),
      repoIds: ["Qwen/Qwen2.5-Coder-32B-Instruct"]
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-32B-Instruct"
    );
    expect(result).toEqual({
      candidateSetId: "hf-candidates-20260607T171000000Z",
      candidates: [
        {
          architecture: "qwen2",
          downloads: 8_100_000,
          lastModified: "2025-01-12T00:00:00.000Z",
          libraryName: "transformers",
          license: "apache-2.0",
          likes: 2_035,
          modelId: "Qwen/Qwen2.5-Coder-32B-Instruct",
          parameterCount: 32_763_900_000,
          pipelineTag: "text-generation",
          tags: ["text-generation", "code", "license:apache-2.0"],
          url: "https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct"
        }
      ],
      generatedAt: "2026-06-07T17:10:00.000Z",
      source: "huggingface_hub_api"
    });
  });

  it("refreshHuggingFaceCandidates_FetchFailure_RecordsDegradedCandidate", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });

    const result = await refreshHuggingFaceCandidates({
      fetcher,
      repoIds: ["missing/model"]
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        degradedReason: "huggingface_model_fetch_failed_404",
        modelId: "missing/model"
      })
    ]);
  });

  it("loadHuggingFaceCandidateSet_AvailableSnapshot_ReturnsCandidateSet", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: async () => ({
        candidateSetId: "hf-candidates-test",
        candidates: [],
        generatedAt: "2026-06-07T17:10:00.000Z",
        source: "huggingface_hub_api"
      }),
      ok: true
    });

    await expect(loadHuggingFaceCandidateSet(fetcher)).resolves.toEqual({
      candidateSetId: "hf-candidates-test",
      candidates: [],
      generatedAt: "2026-06-07T17:10:00.000Z",
      source: "huggingface_hub_api"
    });
    expect(fetcher).toHaveBeenCalledWith("/data/huggingface/local-model-candidates.json");
  });
});
