import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import type { CodexUsageReport, CodexCostsReport } from "./types";

interface PersistReportArgs {
  usage: CodexUsageReport;
  costs?: CodexCostsReport;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistCodexUsageReport({
  usage,
  costs,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "codex",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting OpenAI Codex usage data", env);

  const snapshot = costs ? { usage, costs } : { usage };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return outputPath;
}
