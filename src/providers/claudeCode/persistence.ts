import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import type { ClaudeCodeSnapshot } from "./types";

interface PersistSnapshotArgs {
  snapshot: ClaudeCodeSnapshot;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistClaudeCodeSnapshot({
  snapshot,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "claude-code",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistSnapshotArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting Claude Code usage data", env);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return outputPath;
}
