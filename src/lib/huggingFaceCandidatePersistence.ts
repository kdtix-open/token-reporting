import fs from "node:fs/promises";
import path from "node:path";

import { resolveDataRoot, type DataRootOptions } from "./dataRoot";
import type { HuggingFaceCandidateSet } from "./huggingFaceCandidates";
import { assertWritableOperationAllowed } from "./permissions";

export interface PersistHuggingFaceCandidatesOptions extends DataRootOptions {
  outputPath?: string;
}

/** Persist refreshed candidates beside the provider snapshots served by the same installation. */
export async function persistHuggingFaceCandidates(
  candidateSet: HuggingFaceCandidateSet,
  options: PersistHuggingFaceCandidatesOptions = {}
): Promise<string> {
  const env = options.env ?? process.env;
  assertWritableOperationAllowed("Persisting Hugging Face candidates", env);
  const outputPath = options.outputPath ?? env.TOKEN_REPORTING_HF_CANDIDATES_PATH ??
    path.join(resolveDataRoot({ ...options, env }), "huggingface", "local-model-candidates.json");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(candidateSet, null, 2)}\n`, "utf8");
  return outputPath;
}
