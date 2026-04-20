import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import type { ClaudeUsageReport, ClaudeCostsReport } from "./types";

interface PersistReportArgs {
  report: ClaudeUsageReport;
  costs?: ClaudeCostsReport;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistClaudeUsageReport({
  report,
  costs,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "claude",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting Claude usage data", env);

  const snapshot = costs ? { usage: report, costs } : { usage: report };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return outputPath;
}
