import { resolveRuntimeAssetPath } from "./runtimePaths";

export interface HuggingFaceModelCandidate {
  architecture: string | null;
  degradedReason?: string;
  downloads: number | null;
  lastModified: string | null;
  libraryName: string | null;
  license: string | null;
  likes: number | null;
  modelId: string;
  parameterCount: number | null;
  pipelineTag: string | null;
  tags: string[];
  url: string;
}

export interface HuggingFaceCandidateSet {
  candidateSetId: string;
  candidates: HuggingFaceModelCandidate[];
  generatedAt: string;
  source: "huggingface_hub_api";
}

export interface RefreshHuggingFaceCandidatesOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  repoIds?: string[];
}

export const DEFAULT_HUGGING_FACE_CANDIDATE_REPO_IDS = [
  "meta-llama/Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-Coder-14B-Instruct",
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct-1M"
] as const;

export async function refreshHuggingFaceCandidates(
  options: RefreshHuggingFaceCandidatesOptions = {}
): Promise<HuggingFaceCandidateSet> {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const fetcher = options.fetcher ?? fetch;
  const repoIds = options.repoIds ?? [...DEFAULT_HUGGING_FACE_CANDIDATE_REPO_IDS];
  const candidates = await Promise.all(
    repoIds.map((repoId) => fetchCandidate(fetcher, repoId))
  );

  return {
    candidateSetId: `hf-candidates-${compactTimestamp(new Date(generatedAt))}`,
    candidates,
    generatedAt,
    source: "huggingface_hub_api"
  };
}

export async function loadHuggingFaceCandidateSet(
  fetcher: typeof fetch = fetch,
  basePath = ""
): Promise<HuggingFaceCandidateSet | null> {
  try {
    const response = await fetcher(
      resolveRuntimeAssetPath("data/huggingface/local-model-candidates.json", basePath)
    );
    if (!response.ok) return null;

    return (await response.json()) as HuggingFaceCandidateSet;
  } catch {
    return null;
  }
}

async function fetchCandidate(
  fetcher: typeof fetch,
  repoId: string
): Promise<HuggingFaceModelCandidate> {
  const url = `https://huggingface.co/api/models/${encodeRepoPath(repoId)}`;
  const response = await fetcher(url);
  if (!response.ok) {
    return degradedCandidate(repoId, `huggingface_model_fetch_failed_${response.status}`);
  }

  try {
    return candidateFromHubModel(repoId, (await response.json()) as unknown);
  } catch (error) {
    return degradedCandidate(
      repoId,
      error instanceof Error ? error.message : "huggingface_model_parse_failed"
    );
  }
}

function encodeRepoPath(repoId: string): string {
  return repoId.split("/").map(encodeURIComponent).join("/");
}

function candidateFromHubModel(repoId: string, raw: unknown): HuggingFaceModelCandidate {
  const data = isRecord(raw) ? raw : {};
  const tags = readStringArray(data.tags);
  const modelId = readString(data.id) ?? readString(data.modelId) ?? repoId;

  return {
    architecture: readArchitecture(data),
    downloads: readNumber(data.downloads),
    lastModified: readString(data.lastModified),
    libraryName: readString(data.library_name),
    license: readLicense(data, tags),
    likes: readNumber(data.likes),
    modelId,
    parameterCount: readParameterCount(data),
    pipelineTag: readString(data.pipeline_tag),
    tags,
    url: `https://huggingface.co/${modelId}`
  };
}

function degradedCandidate(repoId: string, degradedReason: string): HuggingFaceModelCandidate {
  return {
    architecture: null,
    degradedReason,
    downloads: null,
    lastModified: null,
    libraryName: null,
    license: null,
    likes: null,
    modelId: repoId,
    parameterCount: null,
    pipelineTag: null,
    tags: [],
    url: `https://huggingface.co/${repoId}`
  };
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readArchitecture(data: Record<string, unknown>): string | null {
  const config = isRecord(data.config) ? data.config : {};
  return readString(config.model_type) ?? readStringArray(config.architectures)[0] ?? null;
}

function readLicense(data: Record<string, unknown>, tags: string[]): string | null {
  const cardData = isRecord(data.cardData) ? data.cardData : {};
  const fromCard = readString(cardData.license);
  if (fromCard) return fromCard;

  const licenseTag = tags.find((tag) => tag.startsWith("license:"));
  return licenseTag ? licenseTag.slice("license:".length) : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readParameterCount(data: Record<string, unknown>): number | null {
  const safetensors = isRecord(data.safetensors) ? data.safetensors : {};
  return readNumber(safetensors.total) ?? readNumber(data.parameterCount);
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
