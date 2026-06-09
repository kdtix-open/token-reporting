import fs from "node:fs/promises";
import path from "node:path";

import { refreshHuggingFaceCandidates } from "../src/lib/huggingFaceCandidates";

const outputPath =
  process.env.TOKEN_REPORTING_HF_CANDIDATES_PATH ??
  path.resolve("public/data/huggingface/local-model-candidates.json");

async function main(): Promise<void> {
  const candidateSet = await refreshHuggingFaceCandidates();

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(candidateSet, null, 2)}\n`, "utf8");

  process.stdout.write(
    `Wrote ${candidateSet.candidates.length} Hugging Face candidates to ${outputPath}\n`
  );
  process.stdout.write(`Hugging Face candidate set id: ${candidateSet.candidateSetId}\n`);
}

void main();
