import { refreshHuggingFaceCandidates } from "../src/lib/huggingFaceCandidates";
import { persistHuggingFaceCandidates } from "../src/lib/huggingFaceCandidatePersistence";
import { assertWritableOperationAllowed } from "../src/lib/permissions";

async function main(): Promise<void> {
  assertWritableOperationAllowed("Refreshing Hugging Face candidates");
  const candidateSet = await refreshHuggingFaceCandidates();
  const outputPath = await persistHuggingFaceCandidates(candidateSet);

  process.stdout.write(
    `Wrote ${candidateSet.candidates.length} Hugging Face candidates to ${outputPath}\n`
  );
  process.stdout.write(`Hugging Face candidate set id: ${candidateSet.candidateSetId}\n`);
}

void main();
