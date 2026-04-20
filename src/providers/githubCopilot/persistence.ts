import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import type { GitHubCopilotLatestUsersReport } from "./types";

interface PersistReportArgs {
  organization: string;
  report: GitHubCopilotLatestUsersReport;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistGitHubCopilotLatestUsersReportMetadata({
  organization,
  report,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "github-copilot",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed(
    `Persisting GitHub Copilot metadata for ${organization}`,
    env
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outputPath;
}
